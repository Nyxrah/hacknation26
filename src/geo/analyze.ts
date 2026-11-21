// Cała analiza „banku wody” dla jednej działki — liczona w przeglądarce w kilka sekund.
import {
  accumulate, burnLines, cellXY, CN_ARABLE, CN_WOOD, distanceFrom, fillDepressions, flowDirD8,
  rasterize, runoffSeries, scsRunoff, simulateDam, slopeTan, twiOf, type DamResult,
} from './hydro.ts'
import type { Grid, NdmiScene, Parcel, RawInputs, XY } from './types.ts'

export type Hsg = 'A' | 'B' | 'C' | 'D'

export interface Exit {
  cell: number
  xy: XY
  share: number // udział spływu z działki
  path: number[] // dalsza droga wody (komórki)
}

export type InterventionKind = 'zastawka' | 'oczko' | 'zadrzewienie'

export interface Intervention {
  kind: InterventionKind
  title: string
  where: string
  cell: number
  capacity: [number, number] // m³ — zakres
  cost: [number, number] // zł — zakres
  perStorm: (P: number, hsg: Hsg) => number // m³ zatrzymane po ulewie P mm
  perYear: [number, number] // m³/rok (zakres)
  m3per1000: number // m³ pojemności na 1000 zł (środek zakresów)
  formal: string
  cells: Int32Array // footprint do podświetlenia
  catchmentHa: number
}

export interface Validation {
  drought?: NdmiScene
  normal?: NdmiScene
  rho: number | null // Spearman TWI × NDMI (susza)
  rhoNormal: number | null
  precision: number | null // trafność stref suchych (dolny tercyl)
  n: number
  modelDry: Uint8Array // 1 = suche wg modelu (dolny tercyl TWI w działce), 2 = mokre (górny)
  satDry: Uint8Array // to samo wg NDMI
}

export interface YearStat {
  year: number
  rain: number
  runoffM3: number
  heavy: number // dni z opadem ≥ 30 mm
  maxDay: number
}

export interface Analysis {
  raw: RawInputs
  g: Omit<Grid, 'data'>
  z: Float32Array
  filled: Float32Array
  dir: Int32Array
  acc: Float32Array
  accP: Float32Array
  tanb: Float32Array
  twi: Float32Array
  mask: Uint8Array
  channel: Uint8Array
  parcelCells: number
  areaHa: number
  zmin: number
  zmax: number
  pzmin: number
  pzmax: number
  meanSlopePct: number
  exits: Exit[]
  interventions: Intervention[]
  dam?: { candidate: number; sim: (h: number) => DamResult; catchmentCells: number }
  validation: Validation
  years: YearStat[]
  timings: Record<string, number>
  cnTable: Record<Hsg, number>
}

const DR = [-1, -1, 0, 1, 1, 1, 0, -1]
const DC = [0, 1, 1, 1, 0, -1, -1, -1]

export function polygonArea(ring: XY[]) {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  return Math.abs(a) / 2
}

export function runoffM3(P: number, hsg: Hsg, cells: number, res: number, cnTable: Record<Hsg, number> = CN_ARABLE) {
  return (scsRunoff(P, cnTable[hsg]) / 1000) * cells * res * res
}

function spearman(a: number[], b: number[]) {
  const rank = (v: number[]) => {
    const idx = v.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0])
    const r = new Array(v.length)
    idx.forEach(([, i], k) => (r[i] = k))
    return r as number[]
  }
  const ra = rank(a), rb = rank(b)
  const n = a.length
  const ma = (n - 1) / 2
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - ma)
    da += (ra[i] - ma) ** 2
    db += (rb[i] - ma) ** 2
  }
  return num / Math.sqrt(da * db)
}

function quantile(v: number[], q: number) {
  const s = [...v].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]
}

export function analyze(raw: RawInputs, onStep?: (k: string) => void): Analysis {
  const T: Record<string, number> = {}
  const tick = (k: string, t0: number) => { T[k] = Math.round(performance.now() - t0); onStep?.(k) }
  const { dem } = raw
  const H: Hsg = raw.hsg ?? 'B'
  const CNT = raw.cn ?? CN_ARABLE
  const g = { w: dem.w, h: dem.h, x0: dem.x0, y0: dem.y0, res: dem.res }
  const { w, h, res } = g
  const z = dem.data
  let t0 = performance.now()

  // --- maska działki, rowy ---
  const mask = rasterize(raw.parcel.ring, g)
  let parcelCells = 0
  for (const v of mask) parcelCells += v
  const ditch = raw.waterways?.length ? burnLines(raw.waterways, g) : new Uint8Array(w * h)
  const burned = Float32Array.from(z)
  for (let i = 0; i < burned.length; i++) if (ditch[i]) burned[i] -= 1

  // --- spływ ---
  const filled = fillDepressions(burned, w, h)
  const dir = flowDirD8(filled, w, h)
  const acc = accumulate(dir)
  // spływ z samej działki, liczony do pierwszego wyjścia poza jej granicę
  const dirIn = new Int32Array(dir.length)
  for (let i = 0; i < dir.length; i++) dirIn[i] = mask[i] && dir[i] >= 0 && mask[dir[i]] ? dir[i] : -1
  const accP = accumulate(dirIn, mask)
  tick('flow', t0)
  t0 = performance.now()
  const tanb = slopeTan(z, w, h, res)
  const twi = twiOf(acc, tanb, res)
  const channel = new Uint8Array(w * h)
  const chanCells = 8000 / (res * res) // > 0,8 ha zlewni → ciek okresowy / rów
  for (let i = 0; i < acc.length; i++) if (acc[i] >= chanCells || ditch[i]) channel[i] = 1
  tick('twi', t0)

  // --- statystyki działki ---
  let zmin = Infinity, zmax = -Infinity, pzmin = Infinity, pzmax = -Infinity, sl = 0
  for (let i = 0; i < z.length; i++) {
    zmin = Math.min(zmin, z[i]); zmax = Math.max(zmax, z[i])
    if (mask[i]) { pzmin = Math.min(pzmin, z[i]); pzmax = Math.max(pzmax, z[i]); sl += tanb[i] }
  }
  const areaHa = polygonArea(raw.parcel.ring) / 10000
  const meanSlopePct = (sl / Math.max(1, parcelCells)) * 100

  // --- punkty wyjścia wody z działki ---
  t0 = performance.now()
  const raws: { cell: number; flux: number }[] = []
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    if (dirIn[i] < 0) raws.push({ cell: i, flux: accP[i] })
  }
  raws.sort((a, b) => b.flux - a.flux)
  const clusters: { cell: number; flux: number }[] = []
  const rad = 30 / res
  for (const e of raws) {
    const r = (e.cell / w) | 0, c = e.cell - r * w
    const hit = clusters.find((k) => {
      const kr = (k.cell / w) | 0, kc = k.cell - kr * w
      return Math.hypot(kr - r, kc - c) < rad
    })
    if (hit) hit.flux += e.flux
    else clusters.push({ ...e })
  }
  const exits: Exit[] = clusters
    .sort((a, b) => b.flux - a.flux)
    .filter((k) => k.flux / parcelCells >= 0.04)
    .slice(0, 4)
    .map((k) => {
      const path: number[] = []
      let cur = k.cell
      for (let s = 0; s < 400 && cur >= 0; s++) { path.push(cur); cur = dir[cur] }
      return { cell: k.cell, xy: cellXY(k.cell, g), share: k.flux / parcelCells, path }
    })
  tick('exits', t0)

  // --- interwencje ---
  t0 = performance.now()
  const interventions: Intervention[] = []
  const dist = distanceFrom(mask, w, h)
  const parcelCatch = (cells: number) => cells * res * res / 10000

  // 1) zastawka / próg na cieku przy działce
  let bestCell = -1, bestVol = 0
  // realny próg: zalew do ~2,5 ha i nie więcej niż 5% działki (nie topimy uprawy)
  const maxFlood = Math.min(25000 / (res * res), Math.max(1500, parcelCells * 0.15))
  for (let i = 0; i < channel.length; i++) {
    if (!channel[i] || dist[i] > 40 / res || i % 2) continue
    const r = (i / w) | 0, c = i - r * w
    if (r < 3 || c < 3 || r > h - 4 || c > w - 4) continue
    const sim = simulateDam(z, dir, w, h, res, i, 1.0, mask, 20000)
    if (sim.cells.length > maxFlood || sim.inParcel > parcelCells * 0.05) continue
    if (sim.volume > bestVol) { bestVol = sim.volume; bestCell = i }
  }
  let dam: Analysis['dam']
  if (bestCell >= 0) {
    const catchment = acc[bestCell]
    const sim = (hh: number) => simulateDam(z, dir, w, h, res, bestCell, hh, mask, 30000)
    dam = { candidate: bestCell, sim, catchmentCells: catchment }
    const lo = sim(0.6).volume, hi = sim(1.0).volume
    const inParcelShare = Math.min(1, accP[bestCell] / Math.max(1, catchment))
    interventions.push({
      kind: 'zastawka',
      title: 'Zastawka (próg piętrzący) na cieku',
      where: `w najniższym punkcie odpływu, zlewnia ${parcelCatch(catchment).toFixed(1)} ha`,
      cell: bestCell,
      capacity: [lo, hi],
      cost: [12000, 35000],
      perStorm: (P, hsg) => Math.min(hi, runoffM3(P, hsg, catchment, res, CNT)),
      perYear: [0, 0],
      m3per1000: ((lo + hi) / 2) / ((12000 + 35000) / 2) * 1000,
      formal: 'Wymaga zgłoszenia wodnoprawnego lub pozwolenia (Wody Polskie); na rowie spółki wodnej — uzgodnienie ze spółką.',
      cells: sim(0.8).cells,
      catchmentHa: parcelCatch(catchment),
    })
    void inParcelShare
  }

  // 2) oczko wodne w naturalnym obniżeniu (max TWI wewnątrz działki)
  let pondCell = -1, pondScore = -Infinity
  const edge = 12 / res
  for (let r = 2; r < h - 2; r++)
    for (let c = 2; c < w - 2; c++) {
      const i = r * w + c
      if (!mask[i]) continue
      // odległość od granicy do wewnątrz: liczymy sąsiedztwo w masce
      let inside = true
      for (let k = 0; k < 8 && inside; k++) if (!mask[(r + DR[k] * edge | 0) * w + (c + DC[k] * edge | 0)]) inside = false
      if (!inside) continue
      // obniżenie, do którego spływa jak najwięcej wody z działki: duża zlewnia + mały spadek
      let t = 0
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) t += tanb[(r + a) * w + c + b]
      const s = Math.log(accP[i] + 1) * 1.5 - Math.log(Math.max(0.003, t / 25))
      if (s > pondScore) { pondScore = s; pondCell = i }
    }
  if (pondCell >= 0) {
    const R = 14 / res
    const pr = (pondCell / w) | 0, pc = pondCell - pr * w
    const fp: number[] = []
    let natural = 0
    for (let a = -Math.ceil(R); a <= R; a++)
      for (let b = -Math.ceil(R); b <= R; b++) {
        if (a * a + b * b > R * R) continue
        const i = (pr + a) * w + pc + b
        if (i < 0 || i >= mask.length) continue
        fp.push(i)
        natural += Math.max(0, filled[i] - burned[i] - 0.002) * res * res
      }
    const area = fp.length * res * res
    const lo = area * 1.2 * 0.7 + natural, hi = area * 1.8 * 0.75 + natural
    const catchment = Math.max(acc[pondCell], accP[pondCell])
    const exc = (lo + hi) / 2 - natural
    const cost: [number, number] = [Math.round((exc * 25 + 4000) / 1000) * 1000, Math.round((exc * 45 + 8000) / 1000) * 1000]
    interventions.push({
      kind: 'oczko',
      title: 'Oczko wodne w naturalnym obniżeniu',
      where: `w obniżeniu terenu, zbiera wodę z ${parcelCatch(catchment).toFixed(1)} ha`,
      cell: pondCell,
      capacity: [lo, hi],
      cost,
      perStorm: (P, hsg) => Math.min(hi, runoffM3(P, hsg, catchment, res, CNT)),
      perYear: [0, 0],
      m3per1000: ((lo + hi) / 2) / ((cost[0] + cost[1]) / 2) * 1000,
      formal: `Ok. ${Math.round(area)} m² — do 1000 m² i 3 m głębokości zwykle wystarcza zgłoszenie wodnoprawne; sprawdź MPZP.`,
      cells: Int32Array.from(fp),
      catchmentHa: parcelCatch(catchment),
    })
  }

  // 3) pas zadrzewień / miedza w poprzek stoku
  const slopeCells: number[] = []
  for (let i = 0; i < mask.length; i++) if (mask[i] && tanb[i] > 0.02) slopeCells.push(i)
  if (slopeCells.length > parcelCells * 0.2) {
    const zs = slopeCells.map((i) => z[i])
    const zc = quantile(zs, 0.6)
    const meanTan = slopeCells.reduce((s, i) => s + tanb[i], 0) / slopeCells.length
    const band = Math.max(0.1, meanTan * 3)
    let strip: number[] = []
    let up = 0
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue
      if (z[i] > zc + band) up++
      if (Math.abs(z[i] - zc) < band && tanb[i] > 0.015) strip.push(i)
    }
    // maks. ~700 m pasa — tam, gdzie po stoku spływa najwięcej wody
    const maxCells = (700 * 12) / (res * res)
    if (strip.length > maxCells) strip = strip.sort((a, b) => accP[b] - accP[a]).slice(0, maxCells)
    const stripArea = strip.length * res * res
    const length = stripArea / 12
    const lo = Math.min(stripArea * 0.04, runoffM3(30, H, up, res, CNT) * 0.5)
    const hi = Math.min(stripArea * 0.08, runoffM3(30, H, up, res, CNT) * 0.8)
    const cost: [number, number] = [Math.round(length * 35 / 100) * 100, Math.round(length * 70 / 100) * 100]
    if (stripArea > 200) {
      interventions.push({
        kind: 'zadrzewienie',
        title: 'Pas zadrzewień w poprzek stoku',
        where: `wzdłuż poziomicy ${zc.toFixed(1)} m n.p.m., ok. ${Math.round(length)} m długości`,
        cell: strip[Math.floor(strip.length / 2)],
        capacity: [lo, Math.max(lo, hi)],
        cost,
        perStorm: (P, hsg) => {
          const before = runoffM3(P, hsg, up, res, CNT)
          const wood = (scsRunoff(P, CN_WOOD[hsg]) / 1000) * stripArea
          return Math.min(before * 0.7, stripArea * 0.08 + Math.max(0, runoffM3(P, hsg, strip.length, res, CNT) - wood))
        },
        perYear: [0, 0],
        m3per1000: ((lo + hi) / 2) / ((cost[0] + cost[1]) / 2) * 1000,
        formal: 'Zwykle bez pozwoleń; zadrzewienia śródpolne bywają finansowane z PS WPR (sprawdź nabory).',
        cells: Int32Array.from(strip),
        catchmentHa: parcelCatch(up),
      })
    }
  }
  tick('interventions', t0)

  // --- opady: roczny bilans ---
  const years: YearStat[] = []
  if (raw.rain) {
    const start = new Date(raw.rain.start + 'T12:00:00Z')
    const by = new Map<number, YearStat>()
    // spływ dobowy z poprawką na wilgotność poprzedzającą (AMC)
    const doyAt = (k: number) => { const d = new Date(start.getTime() + k * 86400000); return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000) }
    const q = runoffSeries(raw.rain.p, CNT[H], doyAt)
    raw.rain.p.forEach((p, k) => {
      const y = new Date(start.getTime() + k * 86400000).getUTCFullYear()
      const s = by.get(y) ?? { year: y, rain: 0, runoffM3: 0, heavy: 0, maxDay: 0 }
      s.rain += p
      s.runoffM3 += (q[k] / 1000) * parcelCells * res * res
      if (p >= 30) s.heavy++
      s.maxDay = Math.max(s.maxDay, p)
      by.set(y, s)
    })
    years.push(...[...by.values()].sort((a, b) => a.year - b.year))
    for (const iv of interventions) {
      let lo = 0, hi = 0
      raw.rain.p.forEach((p) => {
        if (p < 5) return
        const v = iv.perStorm(p, H)
        lo += v * 0.6
        hi += v
      })
      const nY = years.length || 1
      iv.perYear = [lo / nY, hi / nY]
    }
  }

  // --- walidacja: model terenu vs satelita ---
  t0 = performance.now()
  const validation = validate(raw.ndmi, g, mask, twi)
  tick('validation', t0)

  return {
    raw, g, z, filled, dir, acc, accP, tanb, twi, mask, channel, parcelCells, areaHa, zmin, zmax, pzmin, pzmax,
    meanSlopePct, exits, interventions, dam, validation, years, timings: T, cnTable: CNT,
  }
}

/** Porównanie w blokach 20 m: TWI (model) vs NDMI (Sentinel-2). */
function validate(scenes: NdmiScene[], g: Omit<Grid, 'data'>, mask: Uint8Array, twi: Float32Array): Validation {
  const drought = scenes.filter((s) => s.year === 2018 || s.year === 2019).sort((a, b) => a.year - b.year)[0]
  const normal = scenes.find((s) => s.year !== 2018 && s.year !== 2019)
  const B = Math.max(1, Math.round(20 / g.res))
  const bw = Math.floor(g.w / B), bh = Math.floor(g.h / B)
  const modelDry = new Uint8Array(g.w * g.h)
  const satDry = new Uint8Array(g.w * g.h)
  const blocks: { cells: number[]; t: number; d: number; n: number }[] = []
  for (let br = 0; br < bh; br++)
    for (let bc = 0; bc < bw; bc++) {
      const cells: number[] = []
      let t = 0, d = 0, nd = 0, nn = 0, dn = 0
      for (let a = 0; a < B; a++)
        for (let b = 0; b < B; b++) {
          const i = (br * B + a) * g.w + bc * B + b
          if (!mask[i]) continue
          cells.push(i)
          t += twi[i]
          const v = drought?.grid.data[i]
          if (v !== undefined && !Number.isNaN(v)) { d += v; nd++ }
          const u = normal?.grid.data[i]
          if (u !== undefined && !Number.isNaN(u)) { dn += u; nn++ }
        }
      if (cells.length < B * B * 0.8) continue
      blocks.push({ cells, t: t / cells.length, d: nd ? d / nd : NaN, n: nn ? dn / nn : NaN })
    }
  const ok = blocks.filter((b) => !Number.isNaN(b.d))
  if (ok.length < 12) return { drought, normal, rho: null, rhoNormal: null, precision: null, n: ok.length, modelDry, satDry }
  const tq1 = quantile(ok.map((b) => b.t), 1 / 3), tq2 = quantile(ok.map((b) => b.t), 2 / 3)
  const dq1 = quantile(ok.map((b) => b.d), 1 / 3), dq2 = quantile(ok.map((b) => b.d), 2 / 3)
  let hit = 0, dryN = 0
  for (const b of ok) {
    const md = b.t <= tq1, sd = b.d <= dq1
    for (const i of b.cells) {
      modelDry[i] = md ? 1 : b.t >= tq2 ? 2 : 3
      satDry[i] = sd ? 1 : b.d >= dq2 ? 2 : 3
    }
    if (md) { dryN++; if (sd) hit++ }
  }
  const okN = ok.filter((b) => !Number.isNaN(b.n))
  return {
    drought, normal,
    rho: spearman(ok.map((b) => b.t), ok.map((b) => b.d)),
    rhoNormal: okN.length > 12 ? spearman(okN.map((b) => b.t), okN.map((b) => b.n)) : null,
    precision: dryN ? hit / dryN : null,
    n: ok.length,
    modelDry, satDry,
  }
}

export function parcelLabel(p: Parcel) {
  return [p.region, p.commune].filter(Boolean).join(', ')
}
