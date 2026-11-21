// Pipeline analizy działki — przyrostowy. Wszystkie źródła pobierane równolegle, każde z limitem czasu,
// a raport aktualizuje się po każdym z nich:
//   ~1–2 s pogoda · ~5–13 s gleba → ocena · ~10 s satelita · ≤ 25 s teren (NMT 1 m albo zapasowo 30 m).
// Gdy NMT 1 m z Geoportalu dotrze później, wynik doprecyzowuje się sam.
import { analyze, polygonArea, type Analysis } from './analyze.ts'
import { assess, NO_FARMER, type Assessment, type FarmerInput } from './assess.ts'
import type { CropId } from './crops.ts'
import { from4326, toLatLng } from './crs.ts'
import { rasterize } from './hydro.ts'
import { FALLBACK_SOIL, farmerSoil, fetchSoil, type Soil } from './soil.ts'
import { fetchCopDem, fetchDem, fetchGzwp, ndmiScene, type Gzwp, orthoUrl, parcelById, parcelByXY, sceneForDate, waterways } from './sources.ts'
import type { Grid, NdmiScene, Parcel, RawInputs } from './types.ts'
import { fetchWeather, withRain7, type WeatherSeries } from './weather.ts'

export type StepId = 'uldk' | 'pogoda' | 'gleba' | 'satelita' | 'teren' | 'woda' | 'ocena'
export const STEPS: { id: StepId; title: string; src: string; icon: string }[] = [
  { id: 'uldk', title: 'Odnajduję działkę', src: 'ewidencja gruntów · ULDK GUGiK', icon: '📍' },
  { id: 'pogoda', title: 'Pogoda z ostatnich 10 lat', src: 'opady, parowanie, upały · Open-Meteo (ERA5)', icon: '🌦️' },
  { id: 'gleba', title: 'Rodzaj gleby', src: 'uziarnienie i próchnica · ISRIC SoilGrids', icon: '🟫' },
  { id: 'satelita', title: 'Zdjęcie satelitarne pola', src: 'wilgotność roślin · Sentinel-2', icon: '🛰️' },
  { id: 'teren', title: 'Ukształtowanie terenu', src: 'model terenu 1 m · Geoportal', icon: '⛰️' },
  { id: 'woda', title: 'Cieki i spływ wody', src: 'kierunki spływu, zagłębienia, cieki', icon: '💧' },
  { id: 'ocena', title: 'Ocena i zalecenia', src: 'bilans wodny FAO-56 · KBW · SCS-CN', icon: '📋' },
]

export type Progress = (step: StepId, state: 'run' | 'ok' | 'skip' | 'err', note?: string) => void

export interface SourceInfo { name: string; what: string; when: string; license: string }

export interface Result {
  parcel: Parcel
  date: string
  cropId: CropId
  lat: number
  lng: number
  weather?: WeatherSeries
  soil?: Soil
  A?: Analysis
  R?: Assessment
  current?: NdmiScene | null // undefined = jeszcze się pobiera
  demLabel: string
  demFine: boolean
  sources: SourceInfo[]
  missing: string[]
  seconds: number
  generatedAt: string
  done: boolean
  farmer: FarmerInput
  gzwp?: Gzwp[] | null // zbiorniki wód podziemnych pod działką (null = usługa nie odpowiedziała)
}

export async function findParcel(q: string): Promise<Parcel | null> {
  const m = q.match(/^\s*(\d+\.\d+)\s*[,; ]\s*(\d+\.\d+)\s*$/)
  if (m) {
    const [x, y] = from4326(Number(m[1]), Number(m[2]))
    return parcelByXY(x, y)
  }
  return parcelById(q.trim())
}

const timeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms))])

/** najbliższy sąsiad z siatki src do siatki dst */
function resample(src: Grid, dst: Omit<Grid, 'data'>): Grid {
  const out = new Float32Array(dst.w * dst.h)
  for (let r = 0; r < dst.h; r++)
    for (let c = 0; c < dst.w; c++) {
      const x = dst.x0 + (c + 0.5) * dst.res, y = dst.y0 - (r + 0.5) * dst.res
      const sc = Math.floor((x - src.x0) / src.res), sr = Math.floor((src.y0 - y) / src.res)
      out[r * dst.w + c] = sc >= 0 && sr >= 0 && sc < src.w && sr < src.h ? src.data[sr * src.w + sc] : NaN
    }
  return { ...dst, data: out }
}

function terrain(parcel: Parcel, lat: number, lng: number, dem: Grid, soil: Soil | undefined, w: WeatherSeries | undefined, val: NdmiScene | null, ww: RawInputs['waterways']) {
  const g = { w: dem.w, h: dem.h, x0: dem.x0, y0: dem.y0, res: dem.res }
  const raw: RawInputs = {
    parcel, dem, lat, lng, hsg: soil?.hsg ?? 'B', waterways: ww,
    ndmi: val ? [{ ...val, grid: resample(val.grid, g) }] : [],
    rain: w ? { start: w.dates[0], p: w.liquid.slice(0, w.analysisIndex + 1) } : undefined,
    ortho: orthoUrl(g),
  }
  return analyze(raw)
}

// ---------- dane od rolnika ----------
/** Własny pomiar opadu z 7 dni przed datą analizy zastępuje ERA5 w tym oknie (rozkład dzienny zachowany). */
export function applyRain(w: WeatherSeries, rain7: number | null): WeatherSeries {
  return rain7 === null ? w : withRain7(w, rain7)
}
export function applySoil(s: Soil, kind: FarmerInput['soil']): Soil {
  return kind ? farmerSoil(kind, s.soc) : s
}

// ---------- prefetch: teren i gleba ruszają już po wskazaniu działki ----------
interface Pre { bbox: [number, number, number, number]; lat: number; lng: number; nmt: Promise<Grid>; soil: Promise<Soil> }
const pre = new Map<string, Pre>()

function geom(parcel: Parcel) {
  const xs = parcel.ring.map((p) => p[0]), ys = parcel.ring.map((p) => p[1])
  const B = 200
  const bbox: [number, number, number, number] = [Math.min(...xs) - B, Math.min(...ys) - B, Math.max(...xs) + B, Math.max(...ys) + B]
  const [lat, lng] = toLatLng([(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2])
  return { bbox, lat, lng }
}

/**
 * Wywoływane, gdy rolnik wskaże działkę — zanim wybierze uprawę i datę.
 * NMT z Geoportalu (17–70 s) i gleba (3–13 s) nie zależą od uprawy ani daty, więc zwykle są gotowe,
 * zanim rolnik kliknie „Sprawdź”.
 */
export function prefetch(parcel: Parcel): Pre {
  const hit = pre.get(parcel.id)
  if (hit) return hit
  const { bbox, lat, lng } = geom(parcel)
  const p: Pre = { bbox, lat, lng, nmt: fetchDem(bbox, 2, 240000), soil: fetchSoil(lat, lng) }
  p.nmt.catch(() => pre.delete(parcel.id))
  p.soil.catch(() => {})
  pre.set(parcel.id, p)
  return p
}

// ---------- obliczenia (wspólne dla analizy i doprecyzowania) ----------
interface Ctx {
  dem: Grid | null
  val: NdmiScene | null
  ww: RawInputs['waterways']
  mask10: Uint8Array
  weatherRaw?: WeatherSeries
  soilRaw?: Soil
  memo?: { key: unknown[]; A: Analysis } // analiza terenu liczy się tylko, gdy zmienią się jej dane wejściowe
}
const ctxOf = new WeakMap<object, Ctx>()

function compute(st: Result, ctx: Ctx): Result {
  const out: Result = { ...st }
  out.weather = ctx.weatherRaw && applyRain(ctx.weatherRaw, st.farmer.rain7)
  out.soil = ctx.soilRaw && applySoil(ctx.soilRaw, st.farmer.soil)
  if (ctx.dem) {
    const key = [ctx.dem, out.soil?.hsg, ctx.weatherRaw, st.farmer.rain7, ctx.val, ctx.ww]
    if (!ctx.memo || ctx.memo.key.some((k, i) => k !== key[i]))
      ctx.memo = { key, A: terrain(st.parcel, st.lat, st.lng, ctx.dem, out.soil, out.weather, ctx.val, ctx.ww) }
    out.A = ctx.memo.A
  }
  if (out.weather && out.soil)
    out.R = assess({ date: st.date, cropId: st.cropId, w: out.weather, soil: out.soil, A: out.A ?? null, current: st.current, mask: ctx.mask10, demLabel: st.demLabel, demFine: st.demFine, missing: st.missing, farmer: st.farmer, areaHa: polygonArea(st.parcel.ring) / 1e4 })
  ctxOf.set(out, ctx)
  return out
}

/** Przeliczenie raportu po odpowiedziach rolnika — bez ponownego pobierania danych (ułamek sekundy). */
export function refine(res: Result, farmer: FarmerInput): Result {
  const ctx = ctxOf.get(res)
  if (!ctx) return res
  return compute({ ...res, farmer, generatedAt: res.generatedAt }, ctx)
}

export async function runAnalysis(parcel: Parcel, date: string, cropId: CropId, progress: Progress, onUpdate: (r: Result) => void, farmer: FarmerInput = NO_FARMER): Promise<Result> {
  const t0 = performance.now()
  const now = new Date().toLocaleString('pl-PL')
  const missing: string[] = []
  progress('uldk', 'ok', parcel.id)

  const pf = prefetch(parcel)
  const { bbox, lat, lng } = pf
  if ((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) > 9e6) throw new Error('Działka jest bardzo duża (powyżej ok. 500 ha) — prototyp obsługuje działki rolne do kilkuset ha.')
  const g10 = { w: Math.floor((bbox[2] - bbox[0]) / 10), h: Math.floor((bbox[3] - bbox[1]) / 10), x0: bbox[0], y0: bbox[3], res: 10 }
  const mask10 = rasterize(parcel.ring, g10)

  let st: Result = { parcel, date, cropId, lat, lng, demLabel: 'ukształtowanie terenu: pobieram…', demFine: false, sources: [], missing, seconds: 0, generatedAt: now, done: false, farmer }
  const ctx: Ctx = { dem: null, val: null, ww: [], mask10 }

  const sources = (): SourceInfo[] => [
    { name: 'ULDK — Usługa Lokalizacji Działek Katastralnych (GUGiK)', what: 'granica i numer działki', when: now, license: 'dane publiczne, bezpłatne' },
    st.demFine
      ? { name: 'NMT 1 m — Geoportal (GUGiK), usługa WCS', what: 'ukształtowanie terenu, spadki, spływ, cieki', when: now, license: 'bezpłatne, do dowolnego wykorzystania' }
      : { name: 'Copernicus DEM GLO-30 (ESA / Airbus), AWS Open Data', what: 'ukształtowanie terenu (przybliżone)', when: now, license: 'licencja Copernicus DEM — bezpłatna' },
    { name: 'Ortofotomapa — Geoportal (GUGiK), usługa WMS', what: 'podkład zdjęciowy', when: now, license: 'bezpłatne' },
    { name: 'Open-Meteo Historical Weather: ERA5 i ERA5-Land (ECMWF)' + (ctx.weatherRaw?.forecastFrom != null ? ' + prognoza 7 dni' : ''), what: ctx.weatherRaw ? `opady, ET₀, temperatura, wilgotność gleby 0–100 cm · ${ctx.weatherRaw.dates[0]} – ${ctx.weatherRaw.dates[Math.min(ctx.weatherRaw.analysisIndex, ctx.weatherRaw.dates.length - 1)]}` : '—', when: now, license: 'CC BY 4.0' },
    { name: 'ISRIC SoilGrids 2.0', what: ctx.soilRaw?.source === 'SoilGrids' ? 'uziarnienie i węgiel organiczny 0–60 cm' : 'NIEDOSTĘPNE — przyjęto glebę średnią', when: now, license: 'CC BY 4.0' },
    { name: 'Sentinel-2 L2A (Copernicus) — katalog Earth Search (Element 84)', what: st.current ? `NDVI/NDMI, scena ${st.current.sceneId}` : 'brak bezchmurnej sceny z 45 dni', when: now, license: 'licencja Copernicus Sentinel — bezpłatna' },
    ...(ctx.ww?.length ? [{ name: 'OpenStreetMap (Overpass API)', what: 'rowy i cieki', when: now, license: 'ODbL' }] : []),
    { name: 'PIG-PIB, Centralna Baza Danych Geologicznych — GZWP/LZWP (ArcGIS REST)', what: st.gzwp === undefined ? 'zbiorniki wód podziemnych — pobieram' : st.gzwp === null ? 'zbiorniki wód podziemnych — usługa nie odpowiedziała' : st.gzwp.length ? `pod działką: ${st.gzwp.map((g) => `${g.kind} nr ${g.nr}`).join(', ')}` : 'brak udokumentowanego zbiornika pod działką', when: now, license: 'dane publiczne PIG-PIB (z podaniem źródła)' },
  ]

  const emit = () => {
    st.sources = sources()
    st.seconds = (performance.now() - t0) / 1000
    st = compute(st, ctx)
    onUpdate(st)
  }

  progress('pogoda', 'run'); progress('gleba', 'run'); progress('satelita', 'run'); progress('teren', 'run')
  const pW = fetchWeather(lat, lng, date).then((w) => { ctx.weatherRaw = w; progress('pogoda', 'ok', `${w.dates[0].slice(0, 4)}–${date.slice(0, 4)} · ${w.dates.length} dni`); emit() })
  pW.catch((e) => progress('pogoda', 'err', 'Open-Meteo nie odpowiada: ' + e.message))
  const pS = timeout(pf.soil, 15000).then((s) => {
    if (s === 'timeout') throw new Error('timeout')
    ctx.soilRaw = s; progress('gleba', 'ok', `${s.texture} · ${Math.round(s.awc)} mm/m`)
  }).catch(() => { ctx.soilRaw = FALLBACK_SOIL; progress('gleba', 'skip', 'brak odpowiedzi — przyjęto glebę średnią'); missing.push('SoilGrids nie odpowiedział — przyjęto glebę średnią (glina lekka), co obniża pewność wyniku.') })
    .then(() => pW.then(emit).catch(() => {}))
  const pSat = timeout(sceneForDate(date, g10, mask10, lat, lng).catch(() => null), 24000).then((s) => {
    st.current = s === 'timeout' ? null : s
    if (!st.current) { progress('satelita', 'skip', s === 'timeout' ? 'nie zdążyło w limicie czasu' : 'brak bezchmurnego zdjęcia z 45 dni'); missing.push('Brak bezchmurnego zdjęcia Sentinel-2 z 45 dni przed datą analizy — ocena bez wskaźnika satelitarnego (pozostałe wskaźniki działają).') }
    else progress('satelita', 'ok', `zdjęcie z ${st.current.date}`)
    emit()
  })
  const pVal = timeout(ndmiScene(2018, g10, mask10, lat, lng, ['05-20', '07-15'], 2).catch(() => null), 26000).then((s) => {
    ctx.val = s === 'timeout' ? null : s
    if (!ctx.val) missing.push('Brak bezchmurnej sceny z suszy 2018 r. — sprawdzian modelu terenu z satelitą niedostępny.')
    else if (ctx.dem) emit()
  })
  timeout(fetchGzwp(lat, lng), 12000).then((g) => { st.gzwp = g === 'timeout' ? null : g; emit() }).catch(() => { st.gzwp = null })
  const pWW = timeout(waterways([lat - 0.008, lng - 0.012, lat + 0.008, lng + 0.012]).catch(() => [] as RawInputs['waterways']), 15000).then((r) => {
    ctx.ww = r === 'timeout' ? [] : r
    if (ctx.ww?.length && ctx.dem) emit()
  })

  const first = await timeout(pf.nmt.catch(() => null), 20000)
  if (first && first !== 'timeout') {
    ctx.dem = first
    st.demLabel = 'NMT 1 m z Geoportalu (uśredniony do 2 m)'
    st.demFine = true
    progress('teren', 'ok', `NMT 1 m · ${first.w}×${first.h} pól`)
  } else {
    progress('teren', 'run', 'Geoportal odpowiada wolno — biorę model 30 m')
    try {
      ctx.dem = await fetchCopDem(bbox, 10)
      st.demLabel = 'Copernicus DEM 30 m (NMT 1 m z Geoportalu nie odpowiedział w 20 s; model powierzchni — z drzewami i budynkami)'
      progress('teren', 'ok', 'przybliżony 30 m · doprecyzuję, gdy dotrze NMT 1 m')
      pf.nmt.then((fine) => {
        ctx.dem = fine
        st.demLabel = 'NMT 1 m z Geoportalu (uśredniony do 2 m)'
        st.demFine = true
        emit()
      }).catch(() => {})
    } catch {
      progress('teren', 'err', 'brak danych o terenie')
      missing.push('Nie udało się pobrać modelu terenu — bez analizy spływu i miejsc retencji.')
    }
  }
  progress('woda', 'run')
  await Promise.all([pW.catch(() => {}), pS, pSat])
  await timeout(Promise.all([pVal, pWW]), 2000)
  if (!ctx.weatherRaw) throw new Error('Nie udało się pobrać danych pogodowych (Open-Meteo). Spróbuj ponownie za chwilę.')
  st.done = true
  emit()
  progress('woda', st.A ? 'ok' : 'skip', st.A ? `${st.A.exits.length} miejsc odpływu · ${st.A.interventions.length} miejsc retencji` : 'bez terenu')
  progress('ocena', 'ok', st.R?.status.title)
  return st
}
