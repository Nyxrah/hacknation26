// Mózg aplikacji. Sekwencja zgodna z zadaniem KOWR i „Podstawami naukowymi”:
//   ocena sytuacji wodnej → identyfikacja przyczyn → rekomendacje retencyjne → agrotechniczne → nawadnianie.
// Każda rekomendacja wynika z rozpoznanych warunków działki i wskazuje dane, na których się opiera.
import type { Analysis } from './analyze.ts'
import { CROPS, inSeason, kcAt, ndmiRef, ndviRef, phaseAt, type Crop, type CropId } from './crops.ts'
import { CN_ARABLE, cnAmc, scsRunoff } from './hydro.ts'
import { awcGainFromOM, type Soil } from './soil.ts'
import type { NdmiScene } from './types.ts'
import { doyOf, type WeatherSeries } from './weather.ts'
import { seasonal, type Seasonal } from './seasonal.ts'

export type Sev = 0 | 1 | 2 | 3
export const SEV_LABEL = ['Brak niedoboru wody', 'Lekki niedobór wody', 'Umiarkowany niedobór wody', 'Silny niedobór wody']

export interface Indicator {
  key: 'gleba' | 'klimat' | 'wilgotnosc' | 'satelita'
  label: string
  value: string
  detail: string
  sev: Sev | null
  source: string
}

export interface Cause {
  id: 'opady' | 'gleba' | 'odplyw' | 'uprawa' | 'historia' | 'dreny' | 'snieg' | 'studnie' | 'drzewa'
  title: string
  active: boolean
  pending?: boolean
  strength: 'silny' | 'umiarkowany' | 'słaby'
  text: string
  evidence: string[]
}

export interface Rec {
  group: 'retencja' | 'agrotechnika' | 'nawadnianie'
  title: string
  why: string
  effect?: string
  when?: string
  priority: 1 | 2 | 3
  causes: Cause['id'][]
  icon: string
}

export interface SatInterp {
  scene: NdmiScene | null
  ndvi: number | null
  ndmi: number | null
  ndviRef: number | null
  ndmiRef: number | null
  sev: Sev | null
  dryShare: number | null
  note: string
  ageDays: number | null
}

export interface YearRow { year: number; stressCrit: number; deficit: number; yieldRatio: number; drought: boolean; kbw: number }

export interface Assessment {
  date: string
  crop: Crop
  phase: string
  active: boolean
  status: { sev: Sev; title: string; text: string; confidence: 'wysoka' | 'średnia' | 'niska'; confidenceWhy: string }
  indicators: Indicator[]
  current: { availPct: number; dr: number; taw: number; raw: number; ks: number; deficitSeason: number; stressDays: number; daysToStress: number | null; rain7: number | null; et7: number | null }
  climate: { kbw30: number; kbw30pct: number; kbw60: number; kbw60pct: number; p30: number; p30norm: number; hot30: number; hot30norm: number; drySpell: number }
  history: { rows: YearRow[]; droughtYears: number; months: { name: string; deficit: number; prob: number }[]; riskMonths: string; irrigMedian: number; irrigDry: number }
  sat: SatInterp
  causes: Cause[]
  recs: Rec[]
  irrigation: { decision: 'tak' | 'przygotuj' | 'nie' | 'poza sezonem'; title: string; text: string; dose: number | null }
  series: { date: string; avail: number; thr: number; p: number; forecast: boolean }[]
  limits: string[]
  seasonal: Seasonal
}

const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']
const MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia']
const MONTHS_FULL = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień']
const r0 = (v: number) => Math.round(v)
const sign = (v: number) => (v > 0 ? '+' : '') + r0(v)

// ---------- bilans wody w strefie korzeniowej (FAO-56) ----------
interface DayOut { date: string; doy: number; dr: number; ks: number; etc: number; eta: number; p: number }

/** Praktyka uprawowa w modelu: uprawa bezorkowa = resztki na powierzchni → CN −4 (tabele USDA), parowanie z gleby −15% (FAO-56, mulcz). */
export interface Mods { cnDelta: number; evapMul: number }
const NOTILL: Mods = { cnDelta: -4, evapMul: 0.85 }

function runSeason(w: WeatherSeries, crop: Crop, taw: number, cn0: number, from: number, to: number, dr0: number, mods?: Mods): DayOut[] {
  const cn = cn0 + (mods?.cnDelta ?? 0)
  const raw = crop.p * taw
  let dr = dr0
  const out: DayOut[] = []
  for (let i = from; i <= to && i < w.dates.length; i++) {
    const doy = doyOf(w.dates[i])
    const kc0 = kcAt(crop, doy)
    const kc = kc0 < 0.6 ? kc0 * (mods?.evapMul ?? 1) : kc0 // na początku sezonu dominuje parowanie z gleby
    const p = w.liquid[i] // deszcz + roztopy (śnieg czeka w pokrywie)
    let p5 = 0
    for (let k = Math.max(0, i - 5); k < i; k++) p5 += w.liquid[k]
    const pe = p - scsRunoff(p, cnAmc(cn, p5, doy > 105 && doy < 290))
    const ks = dr > raw ? Math.max(0, (taw - dr) / (taw - raw)) : 1
    const etc = kc * w.et0[i]
    const eta = ks * etc
    dr = Math.min(taw, Math.max(0, dr - pe + eta))
    out.push({ date: w.dates[i], doy, dr, ks, etc, eta, p })
  }
  return out
}

function idxOf(w: WeatherSeries, date: string) {
  const i = w.dates.findIndex((d) => d >= date)
  return i < 0 ? w.dates.length - 1 : i
}

function sum(w: WeatherSeries, a: number, b: number, f: (i: number) => number) {
  let s = 0
  for (let i = Math.max(0, a); i <= b && i < w.dates.length; i++) s += f(i)
  return s
}

function pctRank(v: number, arr: number[]) {
  if (!arr.length) return 50
  return (arr.filter((x) => x < v).length + 0.5 * arr.filter((x) => x === v).length) / arr.length * 100
}

/** zapas po zimie: suchy przełom roku → gleba nie wróciła do pojemności polowej */
function startDepletion(w: WeatherSeries, year: number, taw: number) {
  const a = idxOf(w, `${year - 1}-11-01`), b = idxOf(w, `${year}-02-28`)
  if (w.dates[a] > `${year - 1}-11-01` && a === 0) return 0.15 * taw
  const kbw = sum(w, a, b, (i) => w.p[i] - w.et0[i])
  return kbw > 80 ? 0.05 * taw : kbw > 30 ? 0.2 * taw : 0.35 * taw
}

// ---------- satelita z uwzględnieniem uprawy ----------
export function interpretSat(scene: NdmiScene | null | undefined, crop: Crop, date: string, mask: Uint8Array): SatInterp {
  const empty = (note: string): SatInterp => ({ scene: scene ?? null, ndvi: null, ndmi: null, ndviRef: null, ndmiRef: null, sev: null, dryShare: null, note, ageDays: null })
  if (scene === undefined) return empty('Pobieram zdjęcie satelitarne…')
  if (!scene) return empty('Brak bezchmurnego zdjęcia Sentinel-2 z 30 dni przed datą analizy — wskaźnika satelitarnego nie oceniamy.')
  const age = Math.round((new Date(date).getTime() - new Date(scene.date).getTime()) / 86400000)
  const doy = doyOf(scene.date)
  const ref = ndviRef(crop, doy)
  const vals: number[] = [], nd: number[] = []
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    const v = scene.grid.data[i]
    if (!Number.isNaN(v)) vals.push(v)
    const n = scene.ndvi?.data[i]
    if (n !== undefined && !Number.isNaN(n)) nd.push(n)
  }
  if (vals.length < 10) return { ...empty('Zdjęcie satelitarne zasłonięte chmurami nad działką.'), ageDays: age }
  vals.sort((a, b) => a - b)
  nd.sort((a, b) => a - b)
  const ndmi = vals[vals.length >> 1]
  const ndvi = nd.length ? nd[nd.length >> 1] : null
  if (Number.isNaN(ref)) {
    return { scene, ndvi, ndmi, ndviRef: null, ndmiRef: null, sev: null, dryShare: null, ageDays: age,
      note: `Zdjęcie z ${scene.date}: ${crop.short} jest wtedy ${phaseAt(crop, doy)} — wskaźnik roślinności nie mówi wtedy o suszy, więc go nie oceniamy.` }
  }
  const mRef = ndmiRef(ref)
  const thrDry = mRef - 0.12
  const dryShare = vals.filter((v) => v < thrDry).length / vals.length
  const dev = ndmi - mRef
  // gdy NDVI jest dużo niższe od wzorca, a NDMI „pasuje” do NDVI — to raczej słaby łan / inna faza niż susza
  const lowCanopy = ndvi !== null && ndvi < ref - 0.25
  let sev: Sev = dev < -0.18 ? 3 : dev < -0.11 ? 2 : dev < -0.05 ? 1 : 0
  if (lowCanopy && ndvi !== null && ndmi > ndmiRef(ndvi) - 0.1) sev = Math.min(sev, 1) as Sev
  const note = `NDMI ${ndmi.toFixed(2)} wobec ok. ${mRef.toFixed(2)} oczekiwanego dla zdrowego łanu (${crop.short}, ${MONTHS_FULL[new Date(scene.date).getMonth()]})` +
    (lowCanopy ? '. Łan wyraźnie słabszy od wzorca (NDVI) — możliwa inna faza, uszkodzenia lub inna uprawa niż wskazana.' : '.')
  return { scene, ndvi, ndmi, ndviRef: ref, ndmiRef: mRef, sev, dryShare, note, ageDays: age }
}

// ---------- główna ocena ----------
export interface AssessInput {
  date: string
  cropId: CropId
  w: WeatherSeries
  soil: Soil
  A: Analysis | null
  current: NdmiScene | null | undefined
  mask: Uint8Array // maska działki na siatce sceny satelitarnej
  demLabel: string
  demFine: boolean
  missing: string[]
  farmer: FarmerInput
  areaHa: number
}

/** Odpowiedzi rolnika — dane, których nie ma w żadnej bazie, a rolnik zna najlepiej. */
export interface FarmerInput {
  drainage: 'tak' | 'nie' | 'nie wiem'
  soil: null | 'bardzo lekka' | 'lekka' | 'średnia' | 'ciężka'
  rain7: number | null // własny pomiar opadu z 7 dni przed datą analizy [mm]
  tillage: 'orka' | 'bezorkowa' | 'nie wiem'
  trees: 'tak' | 'nie' | 'nie wiem' // wierzby / topole przy polu
}
export const NO_FARMER: FarmerInput = { drainage: 'nie wiem', soil: null, rain7: null, tillage: 'nie wiem', trees: 'nie wiem' }

export function assess(inp: AssessInput): Assessment {
  const { date, w, soil, A } = inp
  const crop = CROPS[inp.cropId]
  const year = Number(date.slice(0, 4))
  const doy = doyOf(date)
  const di = w.analysisIndex
  const taw = soil.awc * crop.zr
  const raw = crop.p * taw
  const slope = A?.meanSlopePct ?? 0
  const slopeAdj = slope > 8 ? 6 : slope > 4 ? 3 : 0
  const cn = Math.min(95, CN_ARABLE[soil.hsg] + slopeAdj)
  const baseMods = inp.farmer.tillage === 'bezorkowa' ? NOTILL : undefined

  // --- klimat: klimatyczny bilans wodny (P − ET0) na tle 10 lat ---
  const win = (end: number, days: number, f: (i: number) => number) => sum(w, end - days + 1, end, f)
  const kbw = (end: number, days: number) => win(end, days, (i) => w.p[i] - w.et0[i])
  const sameDay = (y: number) => idxOf(w, `${y}${date.slice(4)}`)
  const prevYears = Array.from({ length: 10 }, (_, k) => year - 10 + k).filter((y) => `${y}-12-31` >= w.start)
  const kbw30 = kbw(di, 30), kbw60 = kbw(di, 60)
  const kbw30hist = prevYears.map((y) => kbw(sameDay(y), 30))
  const kbw60hist = prevYears.map((y) => kbw(sameDay(y), 60))
  const p30 = win(di, 30, (i) => w.p[i])
  const p30norm = prevYears.map((y) => win(sameDay(y), 30, (i) => w.p[i])).reduce((a, b) => a + b, 0) / Math.max(1, prevYears.length)
  const hot = (end: number) => win(end, 30, (i) => (w.tmax[i] >= 30 ? 1 : 0))
  const hot30 = hot(di)
  const hot30norm = prevYears.map((y) => hot(sameDay(y))).reduce((a, b) => a + b, 0) / Math.max(1, prevYears.length)
  let drySpell = 0
  for (let i = di; i >= Math.max(0, di - 90) && w.p[i] < 1; i--) drySpell++
  const kbw30pct = pctRank(kbw30, kbw30hist), kbw60pct = pctRank(kbw60, kbw60hist)
  const climPct = Math.min(kbw30pct, (kbw30pct + kbw60pct) / 2)
  const climSev: Sev = climPct < 10 ? 3 : climPct < 25 ? 2 : climPct < 40 ? 1 : 0

  // --- historia 10 lat dla tej uprawy i gleby ---
  const rows: YearRow[] = []
  const monthDef = Array.from({ length: 12 }, () => ({ def: 0, stress: 0 }))
  const seasonDeficits: number[] = []
  for (const y of prevYears) {
    const a = idxOf(w, `${y}-03-01`), b = idxOf(w, `${y}-10-31`)
    if (w.dates[a].slice(0, 4) !== String(y)) continue
    const s = runSeason(w, crop, taw, cn, a, b, startDepletion(w, y, taw), baseMods)
    let stressCrit = 0, def = 0, eta = 0, etc = 0
    const mStress = new Set<number>()
    for (const d of s) {
      const m = Number(d.date.slice(5, 7)) - 1
      if (inSeason(crop, d.doy)) {
        def += d.etc - d.eta
        eta += d.eta
        etc += d.etc
        monthDef[m].def += d.etc - d.eta
        if (d.ks < 0.95) mStress.add(m)
      }
      if (d.doy >= crop.critical[0] && d.doy <= crop.critical[1] && d.ks < 0.95) stressCrit++
    }
    mStress.forEach((m) => monthDef[m].stress++)
    const yieldRatio = etc > 0 ? Math.max(0, 1 - crop.ky * (1 - eta / etc)) : 1
    seasonDeficits.push(def)
    rows.push({ year: y, stressCrit, deficit: def, yieldRatio, drought: stressCrit >= 10 || yieldRatio < 0.85, kbw: kbw(idxOf(w, `${y}-07-31`), 120) })
  }
  const n = Math.max(1, rows.length)
  const months = monthDef.map((m, k) => ({ name: MONTHS[k], deficit: m.def / n, prob: m.stress / n })).slice(3, 10)
  const top = months.map((m, k) => ({ ...m, k: k + 3 })).filter((m) => m.prob >= 0.3).sort((a, b) => a.k - b.k)
  const riskMonths = top.length ? (top.length === 1 ? MONTHS_FULL[top[0].k] : `${MONTHS_FULL[top[0].k]} – ${MONTHS_FULL[top[top.length - 1].k]}`) : 'brak wyraźnego okresu'
  const sorted = [...seasonDeficits].sort((a, b) => a - b)
  const irrigMedian = sorted[sorted.length >> 1] ?? 0
  const irrigDry = sorted[Math.floor(sorted.length * 0.8)] ?? 0
  const droughtYears = rows.filter((r) => r.drought).length

  // --- bieżący sezon do daty analizy (+ prognoza 7 dni) ---
  const sA = idxOf(w, `${year}-03-01`)
  const endI = w.forecastFrom !== null ? w.dates.length - 1 : di
  const active = inSeason(crop, doy)
  let cur = { availPct: 100, dr: 0, taw, raw, ks: 1, deficitSeason: 0, stressDays: 0, daysToStress: null as number | null, rain7: null as number | null, et7: null as number | null }
  const series: Assessment['series'] = []
  if (doy >= 60 && w.dates[sA]?.slice(0, 4) === String(year)) {
    const s = runSeason(w, crop, taw, cn, sA, endI, startDepletion(w, year, taw), baseMods)
    const at = s.find((d) => d.date >= date) ?? s[s.length - 1]
    const atK = s.indexOf(at)
    let def = 0, stress = 0
    for (const d of s.slice(0, atK + 1)) if (inSeason(crop, d.doy)) { def += d.etc - d.eta; if (d.ks < 0.95) stress++ }
    const fut = s.slice(atK + 1)
    const firstStress = fut.findIndex((d) => d.ks < 0.95)
    cur = {
      availPct: Math.round(((taw - at.dr) / taw) * 100), dr: at.dr, taw, raw, ks: at.dr > raw ? Math.max(0, (taw - at.dr) / (taw - raw)) : 1, deficitSeason: def, stressDays: stress,
      daysToStress: at.ks < 0.95 ? 0 : firstStress >= 0 ? firstStress + 1 : null,
      rain7: fut.length ? fut.reduce((a, d) => a + d.p, 0) : null,
      et7: fut.length ? fut.reduce((a, d) => a + d.etc, 0) : null,
    }
    for (const d of s) series.push({ date: d.date, avail: Math.round(((taw - d.dr) / taw) * 100), thr: Math.round(((taw - raw) / taw) * 100), p: d.p, forecast: d.date > date })
  }
  const soilSev: Sev | null = !active ? null : cur.ks < 0.5 ? 3 : cur.ks < 0.8 ? 2 : cur.ks < 0.97 || cur.dr > 0.8 * raw ? 1 : 0

  // --- wilgotność gleby 0–100 cm z ERA5-Land na tle 10 lat (niezależny model, dostępny zawsze) ---
  const smAt = (i: number) => { for (let k = i; k >= Math.max(0, i - 12); k--) if (w.sm[k] != null) return { v: w.sm[k] as number, lag: i - k }; return null }
  const smWin = (i: number) => { let s = 0, c = 0; for (let k = i - 7; k <= i + 7; k++) { const v = w.sm[k]; if (v != null) { s += v; c++ } } return c ? s / c : null }
  const smNow = smAt(di)
  const smHist = prevYears.map((y) => smWin(sameDay(y))).filter((v): v is number => v !== null)
  const smDrier = smNow ? smHist.filter((v) => v < smNow.v).length : 0
  const smPct = smNow && smHist.length >= 5 ? pctRank(smNow.v, smHist) : null
  const smSev: Sev | null = smPct === null ? null : smPct < 10 ? 3 : smPct < 25 ? 2 : smPct < 40 ? 1 : 0

  // --- satelita (zdjęcie do 45 dni; starsze ma mniejszą wagę) ---
  const sat = interpretSat(inp.current, crop, date, inp.mask)
  const satW = sat.ageDays === null ? 0 : sat.ageDays <= 15 ? 0.25 : sat.ageDays <= 30 ? 0.17 : 0.1

  // --- łączna ocena + pewność ---
  const parts: { sev: Sev; w: number; name: string }[] = []
  if (soilSev !== null) parts.push({ sev: soilSev, w: 0.3, name: 'bilans glebowy' })
  parts.push({ sev: climSev, w: active ? 0.2 : 0.5, name: 'opad − parowanie' })
  if (smSev !== null) parts.push({ sev: smSev, w: active ? 0.25 : 0.5, name: 'wilgotność gleby ERA5-Land' })
  if (sat.sev !== null) parts.push({ sev: sat.sev, w: satW, name: 'satelita' })
  const ws = parts.reduce((a, p) => a + p.w, 0)
  const score = parts.reduce((a, p) => a + p.sev * p.w, 0) / ws
  const sev: Sev = score < 0.5 ? 0 : score < 1.3 ? 1 : score < 2.2 ? 2 : 3
  const spread = Math.max(...parts.map((p) => p.sev)) - Math.min(...parts.map((p) => p.sev))
  const maxParts = (active ? 1 : 0) + 3
  const confidence: Assessment['status']['confidence'] = parts.length >= maxParts - 1 && spread <= 1 ? 'wysoka' : parts.length >= 2 && spread <= 2 ? 'średnia' : 'niska'
  const confidenceWhy = `${parts.length} z ${maxParts} wskaźników (${parts.map((p) => p.name).join(', ')})` +
    (spread > 1 ? ' — częściowo się nie zgadzają' : ' — wskazują to samo') +
    (active && sat.sev === null ? '; bez zdjęcia satelitarnego' : '') + (!active ? '; uprawa poza sezonem wegetacji' : '')

  const statusText = !active
    ? `${crop.name} jest teraz ${phaseAt(crop, doy)}. Oceniamy zapas wody w glebie i opady na tle 10 lat. ${climSev >= 2 ? 'Przełom sezonu jest wyraźnie suchszy niż zwykle.' : 'Opady na tle wielolecia są w normie lub powyżej.'}`
    : sev === 0 ? `Rośliny mają dość wody. Zapas w strefie korzeni: ${cur.availPct}%.`
      : `W strefie korzeni zostało ${cur.availPct}% wody dostępnej dla roślin${cur.ks < 0.97 ? ', rośliny już ograniczają wzrost' : ''}. ${climSev >= 2 ? `Ostatnie 30 dni było jednym z najsuchszych takich okresów w dekadzie.` : ''}`

  // --- przyczyny ---
  const causes: Cause[] = []
  causes.push({
    id: 'opady', title: 'Mało opadów, duże parowanie',
    active: climPct < 35 || hot30 > hot30norm + 3,
    strength: climPct < 15 ? 'silny' : climPct < 35 ? 'umiarkowany' : 'słaby',
    text: `W ostatnich 30 dniach spadło ${r0(p30)} mm deszczu (norma z 10 lat: ${r0(p30norm)} mm). Bilans opad − parowanie: ${sign(kbw30)} mm${hot30 ? `, dni upalnych ≥ 30°C: ${hot30} (zwykle ${hot30norm.toFixed(0)})` : ''}.`,
    evidence: [`klimatyczny bilans wodny 30 dni: ${sign(kbw30)} mm (${r0(kbw30pct)}. percentyl 10 lat)`, `60 dni: ${sign(kbw60)} mm (${r0(kbw60pct)}. percentyl)`, `dni bez deszczu z rzędu: ${drySpell}`],
  })
  causes.push({
    id: 'gleba', title: 'Gleba słabo magazynuje wodę',
    active: soil.category === 'I' || soil.category === 'II' || soil.awc < 120,
    strength: soil.category === 'I' ? 'silny' : soil.category === 'II' || soil.awc < 120 ? 'umiarkowany' : 'słaby',
    text: `${soil.source === 'brak' ? 'Brak danych glebowych — przyjęto glebę średnią. ' : ''}Gleba: ${soil.texture} (piasek ${r0(soil.sand)}%, ił ${r0(soil.clay)}%), próchnica ok. ${soil.om.toFixed(1)}%. W strefie korzeni ${crop.short} mieści się ok. ${r0(taw)} mm wody dostępnej — ${soil.categoryName}.`,
    evidence: [`pojemność wodna: ${r0(soil.awc)} mm/m (Saxton & Rawls 2006)`, `kategoria podatności: ${soil.category}`, `grupa hydrologiczna gleby: ${soil.hsg}`],
  })
  const annual = A?.years.length ? A.years.reduce((s, y) => s + y.runoffM3, 0) / A.years.length : 0
  const mainExit = A?.exits[0]?.share ?? 0
  causes.push(A ? {
    id: 'odplyw', title: 'Woda spływa z pola',
    active: slope > 3 || (mainExit > 0.4 && annual > 200),
    strength: slope > 8 ? 'silny' : slope > 3 ? 'umiarkowany' : 'słaby',
    text: `Średni spadek pola ${slope.toFixed(1)}%, różnica wysokości ${(A.pzmax - A.pzmin).toFixed(1)} m. Po ulewach z działki spływa średnio ok. ${r0(annual / 10) * 10} m³ wody rocznie${mainExit > 0.3 ? `, z czego ${r0(mainExit * 100)}% jednym miejscem` : ''}.`,
    evidence: [`teren: ${inp.demLabel}`, `spływ: metoda SCS-CN (CN ${cn}), opady dobowe 10 lat`, `punkty wyjścia wody: ${A.exits.length}`],
  } : { id: 'odplyw', title: 'Woda spływa z pola', active: false, pending: true, strength: 'słaby', text: 'Analizuję ukształtowanie terenu…', evidence: [] })
  const inCrit = doy >= crop.critical[0] - 10 && doy <= crop.critical[1]
  causes.push({
    id: 'uprawa', title: `Wrażliwa faza: ${crop.short}`,
    active: active && (inCrit || crop.ky >= 1.1),
    strength: inCrit && crop.ky >= 1.05 ? 'silny' : inCrit ? 'umiarkowany' : 'słaby',
    text: `${crop.name}: ${phaseAt(crop, doy)}. Okres krytyczny dla wody: ${crop.criticalName} (${MONTHS_FULL[new Date(2025, 0, crop.critical[0]).getMonth()]} – ${MONTHS_FULL[new Date(2025, 0, crop.critical[1]).getMonth()]}). Wrażliwość plonu na niedobór (Ky): ${crop.ky}.`,
    evidence: [`zapotrzebowanie: Kc = ${kcAt(crop, doy).toFixed(2)}`, `korzenie do ${crop.zr} m`],
  })
  causes.push({
    id: 'historia', title: 'Susza wraca na tej działce',
    active: droughtYears >= 3,
    strength: droughtYears >= 5 ? 'silny' : droughtYears >= 3 ? 'umiarkowany' : 'słaby',
    text: `W ${droughtYears} z ${rows.length} ostatnich lat ${crop.short} na tej glebie miała niedobór wody w okresie krytycznym. Najbardziej ryzykowny okres: ${riskMonths}.`,
    evidence: rows.filter((r) => r.drought).map((r) => `${r.year}: ${r.stressCrit} dni stresu w okresie krytycznym`).slice(0, 4),
  })

  const S = seasonal(w, date, crop, active)
  const Wn = S.winter
  if (Wn.poor || (Wn.rich && month0(date) >= 2 && month0(date) <= 5)) causes.push({
    id: 'snieg', title: Wn.poor ? 'Mało śniegu tej zimy' : 'Dużo śniegu tej zimy',
    active: Wn.poor, strength: Wn.poor ? 'umiarkowany' : 'słaby',
    text: Wn.poor
      ? `Zimą ${Wn.label.replace('zima ', '')} spadło ${r0(Wn.snowCm)} cm śniegu (zwykle ${r0(Wn.snowCmNorm)} cm), pokrywa leżała ${Wn.coverDays} dni (zwykle ${r0(Wn.coverDaysNorm)}). Roztopy dały ok. ${r0(Wn.meltMm)} mm wody zamiast ${r0(Wn.meltMmNorm)} mm — gleba i wody gruntowe weszły w sezon z mniejszym zapasem.`
      : `Zimą ${Wn.label.replace('zima ', '')} spadło ${r0(Wn.snowCm)} cm śniegu (zwykle ${r0(Wn.snowCmNorm)} cm) — roztopy to ok. ${r0(Wn.meltMm)} mm wody, którą warto zatrzymać na polu.`,
    evidence: ['model śniegu metodą stopniodni na danych ERA5 (opad śniegu, temperatura)'],
  })
  if (S.groundwater.sev >= 2) causes.push({
    id: 'studnie', title: 'Mniej wody w głębszych warstwach',
    active: true, strength: S.groundwater.sev === 3 ? 'silny' : 'umiarkowany',
    text: S.groundwater.why,
    evidence: ['wskaźnik pośredni: bilans 12 miesięcy, ERA5-Land 1–2,5 m, zasilanie zimowe'],
  })

  const f = inp.farmer
  if (f.drainage === 'tak') causes.push({
    id: 'dreny', title: 'Dreny szybko odprowadzają wodę',
    active: true, strength: 'umiarkowany',
    text: 'Według Ciebie pole jest zdrenowane. Dreny odprowadzają wiosną wodę, która mogłaby zostać w glebie na suchy maj i czerwiec — to częsta przyczyna przesuszenia pól w Polsce.',
    evidence: ['informacja od rolnika'],
  })

  // --- rekomendacje: najpierw retencja, potem agrotechnika, na końcu nawadnianie ---
  const recs: Rec[] = []
  const mo = month0(date)
  if (mo >= 10 || mo <= 2 || Wn.sweNow > 5) recs.push({
    group: 'retencja', icon: '❄️', priority: 1, causes: ['snieg', 'historia'],
    title: 'Zatrzymaj wodę z roztopów',
    why: `${Wn.sweNow > 5 ? `Teraz w śniegu na polu jest ok. ${r0(Wn.sweNow)} mm wody${Wn.meltNext ? `, a w prognozie na 7 dni roztopy dadzą ok. ${r0(Wn.meltNext)} mm` : ''}. ` : ''}Roztopy na zamarzniętej glebie spływają rowami, zanim zdążą wsiąknąć. Zamknięte zastawki i wyloty drenów, ściernisko lub międzyplon na polu i pasy zadrzewień zatrzymują śnieg i wodę z jego topnienia.`,
    effect: `w typowej zimie roztopy to ok. ${r0(Wn.meltMmNorm)} mm wody (${r0(Wn.meltMmNorm * 10)} m³ na każdy hektar)`,
    when: 'zastawki i dreny zamknąć przed odwilżą (luty–marzec); nie zostawiać gołej roli na zimę',
  })
  if (f.drainage === 'tak') recs.push({
    group: 'retencja', icon: '🔧', priority: 1, causes: ['dreny', 'historia'],
    title: 'Regulowany odpływ z drenów (zastawka na wylocie drenarskim)',
    why: `Podpiętrzenie wylotu drenów od jesieni do wiosny zatrzymuje wodę w profilu glebowym zamiast odprowadzać ją do rowu. Przy zapasie ok. ${r0(taw)} mm w strefie korzeni to najtańszy sposób na zatrzymanie wody pod całym polem.`,
    effect: 'woda gruntowa wyżej o kilkadziesiąt cm wiosną, mniej stresu w maju i czerwcu',
    when: 'piętrzyć od żniw do wiosny, otwierać przed pracami polowymi; uzgodnić ze spółką wodną',
  })
  const active_ = (id: Cause['id']) => causes.find((c) => c.id === id)!.active
  for (const iv of A?.interventions ?? []) {
    if (iv.kind === 'zastawka') recs.push({
      group: 'retencja', icon: '🚧', priority: 1, causes: ['odplyw', 'historia'],
      title: 'Spowolnij odpływ w cieku przy polu (zastawka / próg)',
      why: `Najniższy punkt odpływu zbiera wodę z ${iv.catchmentHa.toFixed(1)} ha. Piętrzenie 0,6–1,0 m zatrzyma ${fmtRange(iv.capacity)} w cieku i podniesie poziom wody gruntowej w sąsiedztwie.`,
      effect: `w ciągu roku przepływa tędy ok. ${fmtRange(iv.perYear)} wody, którą można spowolnić`,
      when: 'zamykać jesienią i zimą, otwierać tylko przed nawalnicą; uzgodnić ze spółką wodną / Wodami Polskimi',
    })
    if (iv.kind === 'oczko') recs.push({
      group: 'retencja', icon: '💧', priority: active_('odplyw') ? 1 : 2, causes: ['odplyw', 'gleba'],
      title: 'Oczko wodne lub zastoisko w naturalnym obniżeniu',
      why: `W obniżeniu terenu zbiera się woda z ${iv.catchmentHa.toFixed(1)} ha. Zagłębienie ~${Math.round(iv.cells.length * A!.g.res * A!.g.res)} m² zmieści ${fmtRange(iv.capacity)}.`,
      effect: `w ciągu roku dopłynie do niego ok. ${fmtRange(iv.perYear)} — napełni się kilka razy; woda do nawadniania i zasilania wód gruntowych`,
      when: 'wykop poza sezonem (sierpień–październik); do 1000 m² i 3 m głębokości zwykle zgłoszenie wodnoprawne',
    })
    if (iv.kind === 'zadrzewienie') recs.push({
      group: 'retencja', icon: '🌳', priority: slope > 4 ? 1 : 3, causes: ['odplyw'],
      title: 'Pas zadrzewień lub trwałej roślinności w poprzek stoku',
      why: `Na stoku o spadku ${slope.toFixed(1)}% woda po ulewie szybko spływa. Pas wzdłuż poziomicy spowalnia ją i pozwala wsiąknąć (${fmtRange(iv.capacity)} na jedną ulewę).`,
      effect: 'mniej erozji, wyższa wilgotność gleby poniżej pasa',
      when: `sadzenie jesienią; możliwe wsparcie z PS WPR. Gatunki: ${soil.category === 'I' || soil.category === 'II' || droughtYears >= 4 ? 'na tym suchym polu wybierz mało wodochłonne — dąb, klon polny, lipa, grab, głóg, tarnina, dzika róża; wierzby i topole tylko w miejscach podmokłych (przy rowie, w obniżeniu)' : 'na suchszych fragmentach mało wodochłonne (dąb, klon polny, lipa, głóg); przy rowie i w podmokłych obniżeniach wierzba i olsza — zużyją nadmiar wody'}`,
    })
  }
  if (A && !A.interventions.length && active_('odplyw')) recs.push({ group: 'retencja', icon: '🌱', priority: 2, causes: ['odplyw'], title: 'Zatrzymaj wodę na polu — miedze i pasy buforowe', why: 'Pole ma spadek, ale brak cieku i wyraźnego obniżenia — najprościej spowolnić spływ trwałą roślinnością na krawędziach.' })

  const grossGain = awcGainFromOM(soil, 1, crop.zr)
  recs.push({
    group: 'agrotechnika', icon: '🍂', priority: 1, causes: ['gleba', 'opady'],
    title: 'Zostawiaj resztki pożniwne i mulcz na powierzchni',
    why: `Okrywa z resztek ogranicza parowanie z gleby i spływ po ulewach. ${soil.category <= 'II' ? 'Na lekkiej glebie to najtańszy sposób na zatrzymanie wilgoci.' : ''}`,
    effect: 'kilka–kilkanaście mm wody więcej w glebie w okresie wiosennym',
  })
  if (crop.catchCrop) recs.push({
    group: 'agrotechnika', icon: '🌱', priority: 1, causes: ['gleba', 'historia'],
    title: 'Wysiej międzyplon zaraz po zbiorze',
    why: `${crop.name} schodzi z pola ok. połowy ${MONTHS_GEN[new Date(2025, 0, crop.harvest).getMonth()]}. Międzyplon chroni glebę przed wysychaniem, poprawia strukturę i wsiąkanie, a po zimie zostawia mulcz.`,
    effect: `podnosi próchnicę — każdy +1 pp. próchnicy to ok. +${r0(grossGain)} mm wody w strefie korzeni na tej glebie`,
    when: 'do 2–3 tygodni po zbiorze, przy wilgotnej glebie',
  })
  if (soil.om < 2.5) recs.push({
    group: 'agrotechnika', icon: '🧺', priority: 2, causes: ['gleba'],
    title: 'Zwiększaj zawartość próchnicy (obornik, kompost, słoma)',
    why: `Próchnica ok. ${soil.om.toFixed(1)}% to mało. Według obliczeń dla tej gleby +1 pp. próchnicy zwiększa zapas wody o ok. ${r0(grossGain)} mm (strategia „4 promile”).`,
    effect: `+${r0(grossGain)} mm wody dostępnej przy +1 pp. próchnicy`,
  })
  // --- „co by było, gdyby”: orka vs uprawa bezorkowa na pogodzie z ostatnich 10 lat ---
  const histWith = (mods?: Mods) => {
    let stress = 0, dry = 0
    for (const y of prevYears) {
      const a = idxOf(w, `${y}-03-01`), b = idxOf(w, `${y}-10-31`)
      if (w.dates[a].slice(0, 4) !== String(y)) continue
      const sx = runSeason(w, crop, taw, cn, a, b, startDepletion(w, y, taw), mods)
      let sc = 0, eta = 0, etc = 0
      for (const d of sx) {
        if (inSeason(crop, d.doy)) { eta += d.eta; etc += d.etc }
        if (d.doy >= crop.critical[0] && d.doy <= crop.critical[1] && d.ks < 0.95) sc++
      }
      stress += sc
      if (sc >= 10 || (etc > 0 && 1 - crop.ky * (1 - eta / etc) < 0.85)) dry++
    }
    return { stress, dry }
  }
  const plow = histWith(undefined), noTill = histWith(NOTILL)
  const runoffSum = (c: number) => { let q = 0; for (let i = 0; i < di; i++) { let p5 = 0; for (let k = Math.max(0, i - 5); k < i; k++) p5 += w.liquid[k]; const d = doyOf(w.dates[i]); q += scsRunoff(w.liquid[i], cnAmc(c, p5, d > 105 && d < 290)) } return q }
  const qPlow = runoffSum(cn), qNo = runoffSum(cn + NOTILL.cnDelta)
  const qCut = qPlow > 0 ? Math.round((1 - qNo / qPlow) * 100) : 0
  const tillWhy = `Symulacja na pogodzie z ostatnich ${rows.length} lat dla tej gleby i uprawy: dni stresu wodnego w okresie krytycznym ${plow.stress} → ${noTill.stress}` +
    `${plow.stress > 0 ? ` (−${Math.round((1 - noTill.stress / plow.stress) * 100)}%)` : ''}, lata z suszą ${plow.dry} → ${noTill.dry}, spływ po ulewach mniejszy o ok. ${qCut}% (metoda SCS-CN).`
  if (f.tillage === 'bezorkowa') recs.push({
    group: 'agrotechnika', icon: '🚜', priority: 2, causes: ['opady', 'gleba'],
    title: 'Uprawa bezorkowa — tak trzymać',
    why: `Symulacja na pogodzie z ostatnich ${rows.length} lat: przy orce byłoby ${plow.stress} dni stresu wodnego w okresie krytycznym zamiast ${noTill.stress}, lat z suszą ${plow.dry} zamiast ${noTill.dry}, a spływ po ulewach byłby większy o ok. ${qCut > 0 ? Math.round((qPlow / Math.max(1e-6, qNo) - 1) * 100) : 0}% (metoda SCS-CN). Resztki na powierzchni ograniczają parowanie i pomagają wodzie wsiąkać.`,
    effect: `z czasem rośnie też próchnica: każdy +1 pp. to ok. +${r0(grossGain)} mm wody w strefie korzeni`,
    when: 'łącz z międzyplonem i pozostawianiem słomy; w suchym okresie ograniczaj nawet płytkie uprawki',
  })
  else recs.push({
    group: 'agrotechnika', icon: '🚜', priority: noTill.stress < plow.stress || (active && sev >= 2) ? 1 : 2, causes: ['opady', 'gleba', 'odplyw'],
    title: 'Przejdź na uprawę bezorkową (uproszczoną)',
    why: `${tillWhy} Każde odwrócenie gleby w suchym okresie to utrata 2–5 mm wody; resztki na powierzchni ograniczają parowanie i ułatwiają wsiąkanie.`,
    effect: `po kilku latach rośnie próchnica — każdy +1 pp. to ok. +${r0(grossGain)} mm wody w strefie korzeni na tej glebie`,
    when: active && sev >= 2 ? 'teraz: nie wykonuj uprawek, dopóki nie spadnie deszcz; przejście na bezorkową — od najbliższej jesieni' : 'od jesiennej uprawy pod następną roślinę; 2–3 lata przejściowe (więcej słomy na powierzchni, płodozmian, kontrola ślimaków i gryzoni)',
  })

  // --- wierzby i topole przy polu ---
  const dryField = soil.category === 'I' || soil.category === 'II' || droughtYears >= 4 || S.groundwater.sev >= 2
  if (f.trees === 'tak') {
    causes.push({
      id: 'drzewa', title: 'Wierzby / topole przy polu piją dużo wody',
      active: dryField, strength: dryField ? 'umiarkowany' : 'słaby',
      text: `Wierzby i topole należą do najbardziej wodochłonnych drzew. Ich korzenie sięgają w pole zwykle na 1–2 wysokości drzewa (ok. 20–30 m) i w suchym okresie konkurują z uprawą o wodę.${dryField ? ' Na tym polu wody bywa mało, więc ta konkurencja ma znaczenie.' : ' Przy dobrym zapasie wody nie jest to duży problem.'}`,
      evidence: ['informacja od rolnika', `gleba kat. ${soil.category}, susza w ${droughtYears} z ${rows.length} lat`],
    })
    if (dryField) recs.push({
      group: 'agrotechnika', icon: '🌳', priority: 2, causes: ['drzewa'],
      title: 'Strefa przy wierzbach i topolach',
      why: 'W pasie ok. 20–30 m od drzew rośliny wchodzą w stres wcześniej. Rozważ podcinanie korzeni wzdłuż granicy pola (raz na kilka lat, głębosz lub pług), a w tej strefie trwały pas roślinności albo uprawę mniej wrażliwą na suszę.',
      when: 'wycinka nie jest potrzebna — drzewa chronią przed wiatrem i erozją (a usunięcie zwykle wymaga zezwolenia gminy)',
    })
  }

  // --- woda do oprysków: deszczówka i zbiornik zamiast studni ---
  const SPRAYS: Record<CropId, number> = { pszenica: 6, zyto: 4, jeczmien: 4, rzepak: 7, kukurydza: 3, ziemniak: 12, burak: 7, laka: 1 }
  const sprayM3 = inp.areaHa * SPRAYS[crop.id] * 0.25 // ok. 250 l/ha na zabieg
  const fullYears = S.precipYears.filter((p) => !p.partial)
  const annualP = fullYears.length ? fullYears.reduce((a, p) => a + p.total, 0) / fullYears.length : 550
  const roof = (sprayM3 * 1000) / (annualP * 0.8)
  const pond = A?.interventions.find((x) => x.kind === 'oczko')
  if (crop.id !== 'laka') recs.push({
    group: 'nawadnianie', icon: '💦', priority: S.groundwater.sev >= 2 ? 1 : 2, causes: ['studnie'],
    title: 'Woda do oprysków z deszczówki lub zbiornika, nie ze studni',
    why: `Na tę działkę (${inp.areaHa.toFixed(1)} ha, ${crop.short}) idzie w sezonie ok. ${r0(sprayM3)} m³ wody do oprysków (ok. ${SPRAYS[crop.id]} zabiegów × 250 l/ha). Tyle zbierzesz w ciągu roku z dachu o powierzchni ok. ${r0(Math.ceil(roof / 50) * 50)} m² (średnio ${r0(annualP)} mm opadu rocznie)${pond ? `, a proponowane oczko na polu zmieści wodę na ok. ${Math.max(1, Math.floor(((pond.capacity[0] + pond.capacity[1]) / 2) / Math.max(1, sprayM3)))} sezonów oprysków` : ''}.`,
    effect: 'woda ze studni zostaje na pojenie zwierząt i dom; deszczówka jest miękka — wiele środków działa w niej lepiej niż w twardej wodzie (sprawdź etykietę)',
    when: 'zbiornik na deszczówkę przy budynkach albo pobór z oczka / zbiornika retencyjnego przez filtr; nie pobieraj wody z rowów przy polach opryskiwanych przez sąsiadów',
  })

  if (slope > 3) recs.push({
    group: 'agrotechnika', icon: '↔️', priority: 1, causes: ['odplyw'],
    title: 'Orka, siew i przejazdy w poprzek stoku',
    why: `Przy spadku ${slope.toFixed(1)}% bruzdy wzdłuż stoku działają jak rynny. Poprzeczny kierunek zatrzymuje wodę na polu.`,
  })
  if (soil.category <= 'II' && (crop.id === 'jeczmien' || crop.id === 'kukurydza' || crop.id === 'burak' || crop.id === 'ziemniak')) recs.push({
    group: 'agrotechnika', icon: '🛞', priority: 2, causes: ['gleba'],
    title: 'Wałowanie po siewie na lekkiej glebie',
    why: 'Docisk gleby odtwarza podsiąk kapilarny — nasiona i młode korzenie mają wodę z głębszych warstw.',
  })
  if (droughtYears >= 4 && crop.ky >= 1.05) recs.push({
    group: 'agrotechnika', icon: '🔁', priority: 2, causes: ['historia', 'gleba'],
    title: 'Rozważ odmianę tolerującą suszę lub inny termin siewu',
    why: `Susza w okresie krytycznym wystąpiła w ${droughtYears} z ${rows.length} lat. ${soil.category <= 'II' ? 'Na lekkiej glebie żyto i pszenżyto znoszą niedobory lepiej niż pszenica czy kukurydza.' : 'Wcześniejszy siew przesuwa okres krytyczny przed najsuchsze tygodnie.'}`,
  })
  if (active && sev >= 2 && crop.id !== 'laka') recs.push({
    group: 'agrotechnika', icon: '🧪', priority: 1, causes: ['opady'],
    title: 'Nawożenie azotem dopiero pod zapowiadany deszcz',
    why: 'W suchej glebie azot nie jest pobierany i ulatnia się — dawka podana przed opadem działa, podana na sucho to strata.',
    when: cur.rain7 !== null && cur.rain7 > 5 ? `prognoza: ${r0(cur.rain7)} mm w 7 dni — zaplanuj nawożenie przed opadem` : 'gdy prognoza pokaże ≥ 5 mm deszczu',
  })

  // --- nawadnianie (opcjonalnie) ---
  let irrigation: Assessment['irrigation']
  const dose = Math.round(Math.min(cur.dr, crop.id === 'ziemniak' ? 25 : 35) / 5) * 5
  if (!active) irrigation = { decision: 'poza sezonem', title: 'Teraz nawadnianie nie jest potrzebne', text: `${crop.name} jest ${phaseAt(crop, doy)}. W typowym sezonie ta uprawa na tej glebie potrzebowałaby ok. ${r0(irrigMedian)} mm wody z nawadniania (w suchym roku ${r0(irrigDry)} mm).`, dose: null }
  else if (cur.ks < 0.97 && !(cur.rain7 !== null && cur.rain7 >= cur.dr * 0.7)) irrigation = { decision: 'tak', title: `Nawadniaj teraz: ok. ${dose} mm`, text: `Gleba straciła ${r0(cur.dr)} mm z ${r0(taw)} mm zapasu — rośliny są w stresie.${cur.rain7 !== null ? ` Prognoza na 7 dni: ${r0(cur.rain7)} mm deszczu, nie pokryje braku.` : ''} Podaj ${dose} mm (= ${dose * 10} m³/ha) wieczorem lub rano, by ograniczyć parowanie. Opłacalność nawadniania dla tej uprawy: ${crop.irrigationSense}.`, dose }
  else if (cur.daysToStress !== null && cur.daysToStress <= 7) irrigation = { decision: 'przygotuj', title: `Przygotuj nawadnianie — stres za ok. ${cur.daysToStress} dni`, text: `Zapas wody spada (${cur.availPct}%). Jeśli nie spadnie deszcz, rośliny wejdą w stres w ciągu tygodnia. Planowana dawka: ok. ${dose || 20} mm.`, dose: dose || 20 }
  else if (cur.rain7 !== null && cur.ks < 0.97) irrigation = { decision: 'nie', title: 'Wstrzymaj się — idzie deszcz', text: `Gleba jest przesuszona, ale prognoza zapowiada ${r0(cur.rain7)} mm w 7 dni. Nawadnianie teraz mogłoby się zmarnować.`, dose: null }
  else irrigation = { decision: 'nie', title: 'Nawadnianie nie jest potrzebne', text: `Zapas wody w glebie: ${cur.availPct}% — powyżej progu stresu (${100 - Math.round(crop.p * 100)}%). W sezonie ta uprawa potrzebuje średnio ${r0(irrigMedian)} mm nawodnień (w suchym roku ${r0(irrigDry)} mm).`, dose: null }
  if (irrigation.decision === 'tak' || irrigation.decision === 'przygotuj') recs.push({
    group: 'nawadnianie', icon: '🚿', priority: 1, causes: ['opady', 'uprawa'], title: irrigation.title, why: irrigation.text,
    when: 'pobór wody do 5 m³/dobę to zwykłe korzystanie z wód; większy wymaga pozwolenia wodnoprawnego',
  })

  const G = S.groundwater
  if (G.sev >= 2 && (irrigation.decision === 'tak' || irrigation.decision === 'przygotuj'))
    irrigation = { ...irrigation, text: irrigation.text + ' Uwaga: wody podziemne są niżej niż zwykle — jeśli podlewasz ze studni, ogranicz dawkę do okresu krytycznego i podlewaj nocą.' }
  recs.push({
    group: 'nawadnianie', icon: '🪣', priority: G.sev >= 2 ? 1 : 2, causes: ['studnie'],
    title: G.sev >= 2 ? 'Studnia: ogranicz pobór wody' : G.sev === 1 ? 'Studnia: korzystaj oszczędnie' : 'Studnia: możesz korzystać rozważnie',
    why: `${G.title}. ${G.advice[0]}`,
    effect: G.advice.slice(1, -1).join(' '),
    when: G.advice[G.advice.length - 1],
  })
  const lf = S.frost.lastFrost
  const lfAgo = lf ? Math.round((new Date(date).getTime() - new Date(lf.date).getTime()) / 86400000) : 99
  if (!S.frost.next && lf && lfAgo <= 3 && S.frost.sensitive) recs.push({
    group: 'agrotechnika', icon: '🥶', priority: 1, causes: ['uprawa'],
    title: `Po przymrozku ${lf.date.slice(8)}.${lf.date.slice(5, 7)} (${lf.tmin.toFixed(1)}°C) obejrzyj łan`,
    why: 'Przymrozek w tej fazie mógł uszkodzić rośliny. Oceń uszkodzenia (przebarwienia, zwiędnięte pąki i liście) po 2–3 dniach, zanim zdecydujesz o nawożeniu lub zabiegach ochrony.',
  })
  if (S.frost.next && S.frost.sensitive) recs.push({
    group: 'agrotechnika', icon: '🥶', priority: 1, causes: ['uprawa'],
    title: `Przymrozek ${S.frost.next.date.slice(8)}.${S.frost.next.date.slice(5, 7)}: ${S.frost.next.tmin.toFixed(1)}°C`,
    why: S.frost.text + ' Nie wykonuj w tych dniach zabiegów nalistnych i herbicydowych; po przymrozku obejrzyj łan, zanim zdecydujesz o dalszych zabiegach.',
  })

  // --- ograniczenia ---
  const limits = [
    f.drainage === 'nie wiem' ? 'Nie wiemy, czy pole jest zdrenowane — dreny przyspieszają odpływ wody i mogą pogarszać sytuację (możesz to podać w „Doprecyzuj raport”).' : null,
    f.rain7 === null
      ? 'Opad pochodzi z reanalizy ERA5 (siatka ok. 9–25 km) — lokalna burza mogła dać inny opad (możesz podać własny pomiar w „Doprecyzuj raport”).'
      : `Opad z ostatnich 7 dni wg Twojego pomiaru (${r0(f.rain7)} mm); wcześniejsze dni — reanaliza ERA5.`,
    soil.source === 'rolnik' ? `Gleba wg Twojej oceny (${soil.texture.replace(' (wg rolnika)', '')}); próchnica z SoilGrids.` : soil.source === 'SoilGrids' ? 'Gleba z SoilGrids 250 m (model globalny) — możesz ją poprawić w „Doprecyzuj raport”, jeśli znasz swoją glebę.' : 'Brak danych glebowych — przyjęto glebę średnią (możesz ją podać w „Doprecyzuj raport”).',
    !inp.demFine ? `Teren: ${inp.demLabel}.` : null,
    sat.ageDays !== null && sat.ageDays > 15 ? `Najnowsze bezchmurne zdjęcie satelitarne ma ${sat.ageDays} dni — w ocenie ma mniejszą wagę.` : null,
    sat.ndvi !== null && sat.ndviRef !== null && sat.ndvi < sat.ndviRef - 0.25 ? `Na zdjęciu łan wygląda dużo słabiej niż wzorzec dla uprawy „${crop.short}” — sprawdź, czy wybrana uprawa się zgadza.` : null,
    smNow && smNow.lag > 3 ? `Wilgotność gleby ERA5-Land pochodzi z ${smNow.lag} dni przed datą analizy (opóźnienie publikacji danych).` : null,
    ...inp.missing,
  ].filter((x): x is string => !!x)

  return {
    date, crop, phase: phaseAt(crop, doy), active,
    status: { sev, title: active ? SEV_LABEL[sev] : sev >= 2 ? 'Sucho przed sezonem' : 'Poza sezonem — zapas w normie', text: statusText, confidence, confidenceWhy },
    indicators: [
      { key: 'gleba', label: 'Woda w glebie (model)', value: active ? `${cur.availPct}%` : '—', detail: active ? `zapas wody dostępnej w strefie korzeni (próg stresu: ${100 - Math.round(crop.p * 100)}%)` : 'uprawa poza sezonem wegetacji', sev: soilSev, source: 'FAO-56, ERA5, SoilGrids' },
      { key: 'klimat', label: 'Opad − parowanie, 30 dni', value: `${sign(kbw30)} mm`, detail: `${kbw30hist.filter((x) => x < kbw30).length === 0 ? 'najsuchszy taki okres od 10 lat' : `bardziej sucho było w ${kbw30hist.filter((x) => x < kbw30).length} z ${kbw30hist.length} lat`}`, sev: climSev, source: 'Open-Meteo ERA5, 10 lat' },
      { key: 'wilgotnosc', label: 'Wilgotność gleby do 1 m', value: smNow ? `${Math.round(smNow.v * 100)}% obj.` : '—', detail: smNow ? (smHist.length ? `${smDrier === 0 ? 'najsuchsza w tym terminie od 10 lat' : `bardziej sucho było w ${smDrier} z ${smHist.length} lat`} (ERA5-Land)` : 'ERA5-Land') : 'brak danych ERA5-Land dla tej daty', sev: smSev, source: 'Open-Meteo ERA5-Land, 10 lat' },
      { key: 'satelita', label: 'Wilgotność roślin (NDMI)', value: sat.ndmi !== null ? sat.ndmi.toFixed(2) : '—', detail: sat.ndmi !== null && sat.ndmiRef !== null ? `norma dla uprawy ok. ${sat.ndmiRef.toFixed(2)} · zdjęcie z ${sat.scene?.date}${sat.ageDays !== null && sat.ageDays > 15 ? ` (${sat.ageDays} dni temu)` : ''}${sat.ndvi !== null && sat.ndviRef !== null && sat.ndvi < sat.ndviRef - 0.25 ? ' · uwaga: łan dużo słabszy od wzorca — możliwa inna uprawa niż wskazana' : ''}` : sat.note, sev: sat.sev, source: 'Sentinel-2 L2A' },
    ],
    current: cur,
    climate: { kbw30, kbw30pct, kbw60, kbw60pct, p30, p30norm, hot30, hot30norm, drySpell },
    history: { rows, droughtYears, months, riskMonths, irrigMedian, irrigDry },
    seasonal: S,
    sat, causes, recs: recs.sort((a, b) => order(a.group) - order(b.group) || a.priority - b.priority), irrigation, series, limits,
  }
}

function month0(d: string) { return Number(d.slice(5, 7)) - 1 }
const order = (g: Rec['group']) => (g === 'retencja' ? 0 : g === 'agrotechnika' ? 1 : 2)

function fmtRange([a, b]: [number, number]) {
  const r = (v: number) => (v >= 1000 ? Math.round(v / 100) * 100 : Math.round(v / 10) * 10)
  return r(a) === r(b) ? `${r(a).toLocaleString('pl-PL')} m³` : `${r(a).toLocaleString('pl-PL')}–${r(b).toLocaleString('pl-PL')} m³`
}

/** Szybkie podsumowanie pogody — pokazywane, zanim dotrą gleba, satelita i teren. */
export function quickClimate(w: WeatherSeries, date: string) {
  const di = w.analysisIndex
  const y = Number(date.slice(0, 4))
  const win = (end: number, f: (i: number) => number) => sum(w, end - 29, end, f)
  const years = Array.from({ length: 10 }, (_, k) => y - 10 + k).filter((yy) => `${yy}-12-31` >= w.start)
  const same = (yy: number) => idxOf(w, `${yy}${date.slice(4)}`)
  const p30 = win(di, (i) => w.p[i])
  const p30norm = years.map((yy) => win(same(yy), (i) => w.p[i])).reduce((a, b) => a + b, 0) / Math.max(1, years.length)
  const kbw30 = win(di, (i) => w.p[i] - w.et0[i])
  const hist = years.map((yy) => win(same(yy), (i) => w.p[i] - w.et0[i]))
  const drier = hist.filter((x) => x < kbw30).length
  const hot30 = win(di, (i) => (w.tmax[i] >= 30 ? 1 : 0))
  let drySpell = 0
  for (let i = di; i >= Math.max(0, di - 90) && w.p[i] < 1; i--) drySpell++
  // bilans opad − parowanie w sezonie (kwiecień–wrzesień) dla każdego roku
  const seasons = [...years, y].map((yy) => {
    const a = idxOf(w, `${yy}-04-01`), b = Math.min(idxOf(w, `${yy}-09-30`), yy === y ? di : Infinity)
    return { year: yy, kbw: sum(w, a, b, (i) => w.p[i] - w.et0[i]), partial: yy === y }
  })
  return { p30, p30norm, kbw30, drier, n: hist.length, hot30, drySpell, seasons }
}
