// Pobieranie danych publicznych: ULDK (działki), NMT 1 m (Geoportal WCS), ortofotomapa (WMS),
// Sentinel-2 L2A (Earth Search STAC + COG), opady (Open-Meteo/ERA5), rowy (OSM, opcjonalnie).
import { fromArrayBuffer, fromUrl } from 'geotiff'
import { converter } from './crs.ts'
import type { Grid, NdmiScene, Parcel, XY } from './types.ts'

const isBrowser = typeof window !== 'undefined'

export const ENDPOINTS = {
  uldk: 'https://uldk.gugik.gov.pl/',
  // Geoportal WCS nie wysyła nagłówków CORS — w przeglądarce idziemy przez proxy Vite
  nmt: isBrowser ? '/proxy/nmt' : 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModelFormatTIFF',
  // Overpass nie przepuszcza zapytań z przeglądarki bez nagłówka User-Agent — idziemy przez nasz serwer
  orto: 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution',
  stac: 'https://earth-search.aws.element84.com/v1/search',
  meteo: 'https://archive-api.open-meteo.com/v1/archive',
  overpass: isBrowser ? '/proxy/overpass' : 'https://overpass-api.de/api/interpreter',
}

async function fetchT(url: string, init: RequestInit = {}, ms = 30000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url.slice(0, 80)}`)
    return r
  } finally {
    clearTimeout(t)
  }
}

// ---------- ULDK ----------
function parseUldk(text: string): Parcel | null {
  const lines = text.trim().split('\n')
  if (lines[0].trim() !== '0' || !lines[1]) return null
  const [id, geom, voivodeship, county, commune, region, number] = lines[1].split('|')
  const m = geom.match(/POLYGON\(\((.*?)\)/)
  if (!m) return null
  const ring = m[1].split(',').map((p) => p.trim().split(/\s+/).map(Number) as XY)
  return { id, ring, voivodeship, county, commune, region, number }
}

const ULDK_RESULT = 'id,geom_wkt,voivodeship,county,commune,region,parcel'

export async function parcelById(id: string) {
  const u = `${ENDPOINTS.uldk}?request=GetParcelById&id=${encodeURIComponent(id.trim())}&result=${ULDK_RESULT}&srid=2180`
  return parseUldk(await (await fetchT(u, {}, 20000)).text())
}

export async function parcelByXY(x: number, y: number) {
  const u = `${ENDPOINTS.uldk}?request=GetParcelByXY&xy=${x},${y},2180&result=${ULDK_RESULT}&srid=2180`
  return parseUldk(await (await fetchT(u, {}, 15000)).text())
}

// ---------- NMT ----------
/** Wycinek NMT 1 m z WCS, uśredniony do rozdzielczości `res` (np. 2 m). */
export async function fetchDem(bbox: [number, number, number, number], res = 2, timeout = 180000): Promise<Grid> {
  const [x1, y1, x2, y2] = bbox.map((v) => Math.round(v))
  const u = `${ENDPOINTS.nmt}?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=DTM_PL-KRON86-NH_TIFF&FORMAT=image/tiff&SUBSET=x(${x1},${x2})&SUBSET=y(${y1},${y2})${res >= 2 ? `&SCALEFACTOR=${(1 / res).toFixed(3)}` : ''}`
  const resp = await fetchT(u, {}, timeout)
  if (!(resp.headers.get('content-type') ?? '').includes('tiff')) throw new Error('Geoportal NMT nie zwrócił GeoTIFF (przeciążenie albo brak proxy /proxy/nmt)')
  const buf = await resp.arrayBuffer()
  const tif = await fromArrayBuffer(buf)
  const img = await tif.getImage()
  const [ox, oy] = img.getOrigin()
  const W = img.getWidth(), H = img.getHeight()
  const src = (await img.readRasters({ samples: [0] }))[0] as Float32Array
  const ar = Math.abs(img.getResolution()[0]) || 1
  const f = Math.max(1, Math.round(res / ar))
  const w = Math.floor(W / f), h = Math.floor(H / f)
  const data = new Float32Array(w * h)
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      let s = 0, n = 0
      for (let a = 0; a < f; a++)
        for (let b = 0; b < f; b++) {
          const v = src[(r * f + a) * W + c * f + b]
          if (v > -100) { s += v; n++ }
        }
      data[r * w + c] = n ? s / n : NaN
    }
  // uzupełnij ewentualne braki średnią
  let mean = 0, cnt = 0
  for (const v of data) if (!Number.isNaN(v)) { mean += v; cnt++ }
  mean /= cnt || 1
  for (let i = 0; i < data.length; i++) if (Number.isNaN(data[i])) data[i] = mean
  return { w, h, x0: ox, y0: oy, res: f * ar, data }
}

// ---------- Ortofotomapa ----------
export function orthoUrl(g: Omit<Grid, 'data'>, px = 1400) {
  const x2 = g.x0 + g.w * g.res, y1 = g.y0 - g.h * g.res
  const k = px / Math.max(g.w, g.h)
  const W = Math.round(g.w * k), H = Math.round(g.h * k)
  return `${ENDPOINTS.orto}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=Raster&STYLES=&SRS=EPSG:2180&BBOX=${g.x0},${y1},${x2},${g.y0}&WIDTH=${W}&HEIGHT=${H}&FORMAT=image/jpeg`
}

// ---------- Sentinel-2 NDMI ----------
interface StacItem {
  id: string
  properties: Record<string, unknown>
  assets: Record<string, { href: string }>
}

/** NDMI = (B8A − B11)/(B8A + B11) z najlepszej bezchmurnej sceny w oknie dat, próbkowane na siatkę `g`. */
export async function ndmiScene(year: number, g: Omit<Grid, 'data'>, parcelMask: Uint8Array, lat: number, lng: number, window = ['06-01', '08-31'], tries = 1): Promise<NdmiScene | null> {
  const d = 0.01
  const body = {
    collections: ['sentinel-2-l2a'],
    bbox: [lng - d, lat - d, lng + d, lat + d],
    datetime: `${year}-${window[0]}T00:00:00Z/${year}-${window[1]}T23:59:59Z`,
    limit: 40,
    query: { 'eo:cloud_cover': { lt: 40 } },
  }
  const j = await (await fetchT(ENDPOINTS.stac, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 30000)).json()
  const items = (j.features as StacItem[]).sort((a, b) => (a.properties['eo:cloud_cover'] as number) - (b.properties['eo:cloud_cover'] as number))
  // spośród kilku bezchmurnych scen bierzemy najbardziej „zieloną” na działce (szczyt wegetacji, przed żniwami)
  const seenDates = new Set<string>()
  let best: NdmiScene | null = null, bestMed = -Infinity, ok = 0
  for (const it of items.slice(0, 14)) {
    if (ok >= tries) break
    const date = String(it.properties.datetime).slice(0, 10)
    if (seenDates.has(date)) continue
    seenDates.add(date)
    try {
      const res = await sampleNdmi(it, g, parcelMask)
      if (!res) continue
      ok++
      const vals: number[] = []
      for (let i = 0; i < res.data.length; i++) if (parcelMask[i] && !Number.isNaN(res.data[i])) vals.push(res.data[i])
      vals.sort((a, b) => a - b)
      const med = vals[vals.length >> 1]
      if (med > bestMed) { bestMed = med; best = { year, date, sceneId: it.id, cloud: it.properties['eo:cloud_cover'] as number, grid: res } }
    } catch (e) {
      console.warn('[S2] scena pominięta', it.id, e)
    }
  }
  return best
}

async function sampleNdmi(it: StacItem, g: Omit<Grid, 'data'>, parcelMask: Uint8Array, minValid = 0.85): Promise<Grid | null> {
  const r = await sampleScene(it, g, parcelMask, minValid)
  return r ? r.ndmi : null
}

/** Odczyt wycinka sceny: NDMI (B8A, B11) i NDVI (B8A, B04) z maską chmur SCL, próbkowane na siatkę `g`. */
export async function sampleScene(it: StacItem, g: Omit<Grid, 'data'>, parcelMask: Uint8Array, minValid = 0.6) {
  const epsg = (it.properties['proj:epsg'] as number) ?? Number(String(it.properties['proj:code'] ?? '').split(':')[1])
  const toUtm = converter('EPSG:2180', `EPSG:${epsg}`)
  const [nir, swir, scl, red] = await Promise.all(['nir08', 'swir16', 'scl', 'red'].map((k) => fromUrl(it.assets[k].href).then((t) => t.getImage())))
  const corners = [[g.x0, g.y0], [g.x0 + g.w * g.res, g.y0], [g.x0, g.y0 - g.h * g.res], [g.x0 + g.w * g.res, g.y0 - g.h * g.res]].map((p) => toUtm(p as XY))
  const ux1 = Math.min(...corners.map((p) => p[0])) - 40, ux2 = Math.max(...corners.map((p) => p[0])) + 40
  const uy1 = Math.min(...corners.map((p) => p[1])) - 40, uy2 = Math.max(...corners.map((p) => p[1])) + 40
  const win = (im: typeof nir) => {
    const [ox, oy] = im.getOrigin()
    const [rx, ry] = im.getResolution()
    const c0 = Math.floor((ux1 - ox) / rx), c1 = Math.ceil((ux2 - ox) / rx)
    const r0 = Math.floor((uy2 - oy) / ry), r1 = Math.ceil((uy1 - oy) / ry)
    return { ox, oy, rx, ry, c0, r0, W: c1 - c0, window: [c0, r0, c1, r1] }
  }
  const w20 = win(nir), w10 = win(red)
  const [bn, bs, bc, br] = await Promise.all([
    nir.readRasters({ window: w20.window, samples: [0] }),
    swir.readRasters({ window: w20.window, samples: [0] }),
    scl.readRasters({ window: w20.window, samples: [0] }),
    red.readRasters({ window: w10.window, samples: [0] }),
  ].map((p) => p.then((r) => r[0] as Uint16Array)))
  // od 25.01.2022 (baseline 04.00) reflektancje L2A mają przesunięcie +1000
  // Earth Search zwykle już je odejmuje (earthsearch:boa_offset_applied)
  const off = it.properties['earthsearch:boa_offset_applied'] ? 0 : String(it.properties.datetime) >= '2022-01-25' ? 1000 : 0
  const ndmi = new Float32Array(g.w * g.h), ndvi = new Float32Array(g.w * g.h)
  let valid = 0, inParcel = 0
  for (let r = 0; r < g.h; r++)
    for (let c = 0; c < g.w; c++) {
      const i = r * g.w + c
      const [ux, uy] = toUtm([g.x0 + (c + 0.5) * g.res, g.y0 - (r + 0.5) * g.res])
      const k = (Math.floor((uy - w20.oy) / w20.ry) - w20.r0) * w20.W + Math.floor((ux - w20.ox) / w20.rx) - w20.c0
      const k10 = (Math.floor((uy - w10.oy) / w10.ry) - w10.r0) * w10.W + Math.floor((ux - w10.ox) / w10.rx) - w10.c0
      const cls = bc[k]
      const a = bn[k] - off, b = bs[k] - off, rr = br[k10] - off
      const ok = (cls === 4 || cls === 5) && a + b > 0
      ndmi[i] = ok ? (a - b) / (a + b) : NaN
      ndvi[i] = ok && a + rr > 0 ? (a - rr) / (a + rr) : NaN
      if (parcelMask[i]) { inParcel++; if (ok) valid++ }
    }
  const share = inParcel ? valid / inParcel : 0
  if (share < minValid) return null
  return { ndmi: { ...g, data: ndmi }, ndvi: { ...g, data: ndvi }, share }
}

async function stacSearch(lat: number, lng: number, from: string, to: string, maxCloud: number) {
  const d = 0.01
  const body = { collections: ['sentinel-2-l2a'], bbox: [lng - d, lat - d, lng + d, lat + d], datetime: `${from}T00:00:00Z/${to}T23:59:59Z`, limit: 50, query: { 'eo:cloud_cover': { lt: maxCloud } } }
  const j = await (await fetchT(ENDPOINTS.stac, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 20000)).json()
  return j.features as StacItem[]
}

/** Najnowsza użyteczna scena z 45 dni przed datą analizy (starsze zdjęcia dostają w ocenie mniejszą wagę). */
export async function sceneForDate(date: string, g: Omit<Grid, 'data'>, mask: Uint8Array, lat: number, lng: number): Promise<NdmiScene | null> {
  const from = new Date(new Date(date).getTime() - 45 * 86400000).toISOString().slice(0, 10)
  const items = (await stacSearch(lat, lng, from, date, 70)).sort((a, b) => String(b.properties.datetime).localeCompare(String(a.properties.datetime)))
  const seen = new Set<string>()
  const cand = items.filter((it) => { const d = String(it.properties.datetime).slice(0, 10); if (seen.has(d)) return false; seen.add(d); return true }).slice(0, 9)
  // po trzy naraz; bierzemy najnowszą, która ma ≥ 60% działki bez chmur
  for (let k = 0; k < cand.length; k += 3) {
    const res = await Promise.all(cand.slice(k, k + 3).map((it) => sampleScene(it, g, mask, 0.6).catch(() => null)))
    const hit = res.findIndex((r) => r)
    if (hit >= 0) {
      const it = cand[k + hit], r = res[hit]!
      return { year: Number(String(it.properties.datetime).slice(0, 4)), date: String(it.properties.datetime).slice(0, 10), sceneId: it.id, cloud: it.properties['eo:cloud_cover'] as number, grid: r.ndmi, ndvi: r.ndvi, validShare: r.share }
    }
  }
  return null
}

// ---------- Copernicus DEM 30 m (zapas, gdy NMT nie zdąży) ----------
export async function fetchCopDem(bbox: [number, number, number, number], res = 10): Promise<Grid> {
  const to4326 = converter('EPSG:2180', 'EPSG:4326')
  const [x1, y1, x2, y2] = bbox
  const [clng, clat] = to4326([(x1 + x2) / 2, (y1 + y2) / 2])
  const la = Math.floor(clat), lo = Math.floor(clng)
  const name = `Copernicus_DSM_COG_10_N${String(la).padStart(2, '0')}_00_E${String(lo).padStart(3, '0')}_00_DEM`
  const base = typeof window !== 'undefined' ? '/proxy/cop' : 'https://copernicus-dem-30m.s3.amazonaws.com'
  const img = await (await fromUrl(`${base}/${name}/${name}.tif`)).getImage()
  const [ox, oy] = img.getOrigin()
  const [rx, ry] = img.getResolution()
  const corners = [[x1, y1], [x2, y1], [x1, y2], [x2, y2]].map((p) => to4326(p as XY))
  const c0 = Math.max(0, Math.floor((Math.min(...corners.map((p) => p[0])) - ox) / rx) - 2)
  const c1 = Math.min(img.getWidth(), Math.ceil((Math.max(...corners.map((p) => p[0])) - ox) / rx) + 2)
  const r0 = Math.max(0, Math.floor((Math.max(...corners.map((p) => p[1])) - oy) / ry) - 2)
  const r1 = Math.min(img.getHeight(), Math.ceil((Math.min(...corners.map((p) => p[1])) - oy) / ry) + 2)
  const src = (await img.readRasters({ window: [c0, r0, c1, r1], samples: [0] }))[0] as Float32Array
  const W = c1 - c0, H = r1 - r0
  const w = Math.floor((x2 - x1) / res), h = Math.floor((y2 - y1) / res)
  const data = new Float32Array(w * h)
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const [lng, lat] = to4326([x1 + (c + 0.5) * res, y2 - (r + 0.5) * res])
      const fx = (lng - ox) / rx - c0 - 0.5, fy = (lat - oy) / ry - r0 - 0.5
      const ix = Math.max(0, Math.min(W - 2, Math.floor(fx))), iy = Math.max(0, Math.min(H - 2, Math.floor(fy)))
      const tx = Math.min(1, Math.max(0, fx - ix)), ty = Math.min(1, Math.max(0, fy - iy))
      const v = (a: number, b: number) => src[(iy + b) * W + ix + a]
      data[r * w + c] = (v(0, 0) * (1 - tx) + v(1, 0) * tx) * (1 - ty) + (v(0, 1) * (1 - tx) + v(1, 1) * tx) * ty
    }
  return { w, h, x0: x1, y0: y2, res, data }
}

// ---------- Opady ----------
export async function rainSeries(lat: number, lng: number, start = '2018-01-01', end = '2025-12-31') {
  const u = `${ENDPOINTS.meteo}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&start_date=${start}&end_date=${end}&daily=precipitation_sum&timezone=Europe%2FWarsaw`
  const j = await (await fetchT(u, {}, 30000)).json()
  return { start, p: (j.daily.precipitation_sum as (number | null)[]).map((v) => v ?? 0) }
}

// ---------- Rowy (OSM, opcjonalnie) ----------
export async function waterways(bbox4326: [number, number, number, number]): Promise<XY[][]> {
  const [s, w, n, e] = bbox4326
  const q = `[out:json][timeout:20];way["waterway"~"ditch|drain|stream|canal"](${s},${w},${n},${e});out geom;`
  const j = await (await fetchT(ENDPOINTS.overpass, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 12000)).json()
  const to = converter('EPSG:4326', 'EPSG:2180')
  return (j.elements as { geometry: { lat: number; lon: number }[] }[]).map((el) => el.geometry.map((p) => to([p.lon, p.lat])))
}

// ---------- Główne / lokalne zbiorniki wód podziemnych (PIG-PIB, CBDG) ----------
export interface Gzwp { kind: string; nr: string; name: string; rank: string }
export async function fetchGzwp(lat: number, lng: number): Promise<Gzwp[]> {
  const u = `https://cbdgmapa.pgi.gov.pl/arcgis/rest/services/hydrogeologia/gzwp/MapServer/identify?geometry=${lng.toFixed(5)},${lat.toFixed(5)}&geometryType=esriGeometryPoint&sr=4326&layers=all&tolerance=1&mapExtent=14,49,24,55&imageDisplay=1000,600,96&returnGeometry=false&f=json`
  const j = await (await fetchT(u, {}, 12000)).json()
  return ((j.results ?? []) as { layerName: string; attributes: Record<string, string> }[]).map((r) => ({
    kind: r.layerName,
    nr: r.attributes['Nr GZWP'] ?? r.attributes['Nr_GZWP'] ?? r.attributes['Nr LZWP'] ?? '',
    name: r.attributes['Nazwa GZWP'] ?? r.attributes['Nazwa_GZWP'] ?? r.attributes['Nazwa LZWP'] ?? r.attributes['Nazwa'] ?? '',
    rank: r.attributes['Ranga ZWP'] ?? r.attributes['Ranga_ZWP'] ?? '',
  }))
}
