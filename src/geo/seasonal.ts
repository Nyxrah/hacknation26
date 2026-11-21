// Zima i roztopy, wody podziemne (studnie), przymrozki, opady w kolejnych latach.
// Rzeczy, o których rolnicy mówią, że „łatwo zapomnieć”: śnieg to też woda, a studnia też ma dno.
import type { Crop } from './crops.ts'
import { doyOf, type WeatherSeries } from './weather.ts'

const MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia']
const fmtDay = (d: string) => `${Number(d.slice(8))} ${MONTHS_GEN[Number(d.slice(5, 7)) - 1]}`
const idx = (w: WeatherSeries, d: string) => { const i = w.dates.findIndex((x) => x >= d); return i < 0 ? w.dates.length - 1 : i }
const pct = (v: number, arr: number[]) => (arr.length ? ((arr.filter((x) => x < v).length + 0.5 * arr.filter((x) => x === v).length) / arr.length) * 100 : 50)
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0)

export interface Winter {
  label: string // np. „zima 2024/25”
  partial: boolean
  snowCm: number
  snowCmNorm: number
  coverDays: number
  coverDaysNorm: number
  maxSwe: number // mm wody w pokrywie
  maxSweNorm: number
  meltMm: number
  meltMmNorm: number
  sweNow: number // mm wody w śniegu w dniu analizy
  meltNext: number | null // prognozowane roztopy 7 dni [mm]
  poor: boolean
  rich: boolean
}

export interface Groundwater {
  sev: 0 | 1 | 2 | 3
  title: string
  deepDrier: number | null // w ilu z n lat warstwa 1–2,5 m była suchsza
  n: number
  kbw12: number // opad − parowanie z 12 miesięcy [mm]
  kbw12Drier: number
  recharge: number // zasilanie zimowe (XI–III): deszcz + roztopy − ET0 [mm]
  rechargeNorm: number
  advice: string[]
  why: string
}

export interface FrostDay { date: string; tmin: number; tmax: number; rain: number; snowCm: number; forecast: boolean }
export interface Frost {
  days: FrostDay[]
  next: FrostDay | null // najbliższy prognozowany przymrozek
  lastFrost: FrostDay | null // ostatni przymrozek przed datą analizy
  sensitive: boolean
  text: string
}

export interface PrecipYear { label: string; rain: number; snow: number; total: number; partial: boolean }

export function seasonal(w: WeatherSeries, date: string, crop: Crop, active: boolean) {
  const di = w.analysisIndex
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7))

  // ---------- zima ----------
  const wy = m >= 11 ? y : y - 1 // zima zaczyna się 1 listopada roku wy
  const wStart = `${wy}-11-01`, wEnd = `${wy + 1}-03-31`
  const endI = Math.min(idx(w, wEnd), di)
  const len = endI - idx(w, wStart)
  const winterStats = (startDate: string, n: number) => {
    const a = idx(w, startDate)
    let snow = 0, cover = 0, maxS = 0, melt = 0
    for (let i = a; i <= a + n && i < w.dates.length; i++) {
      snow += w.snowCm[i]
      if (w.swe[i] >= 5) cover++
      maxS = Math.max(maxS, w.swe[i])
      melt += w.melt[i]
    }
    return { snow, cover, maxS, melt }
  }
  const cur = winterStats(wStart, len)
  const prev = Array.from({ length: 10 }, (_, k) => wy - 10 + k).filter((yy) => `${yy}-11-01` >= w.start).map((yy) => winterStats(`${yy}-11-01`, len))
  let meltNext: number | null = null
  if (w.forecastFrom !== null) { meltNext = 0; for (let i = w.forecastFrom; i < w.dates.length; i++) meltNext += w.melt[i] }
  const winter: Winter = {
    label: `zima ${wy}/${String(wy + 1).slice(2)}`, partial: date < wEnd,
    snowCm: cur.snow, snowCmNorm: mean(prev.map((p) => p.snow)),
    coverDays: cur.cover, coverDaysNorm: mean(prev.map((p) => p.cover)),
    maxSwe: cur.maxS, maxSweNorm: mean(prev.map((p) => p.maxS)),
    meltMm: cur.melt, meltMmNorm: mean(prev.map((p) => p.melt)),
    sweNow: w.swe[di] ?? 0, meltNext,
    poor: len > 60 && cur.snow < 0.5 * mean(prev.map((p) => p.snow)),
    rich: len > 30 && cur.snow > 1.4 * mean(prev.map((p) => p.snow)) && cur.snow > 20,
  }

  // ---------- wody podziemne (wskaźnik pośredni) ----------
  const sameDay = (yy: number) => idx(w, `${yy}${date.slice(4)}`)
  const years = Array.from({ length: 10 }, (_, k) => y - 10 + k).filter((yy) => `${yy}-12-31` >= w.start)
  const sumWin = (end: number, n: number, f: (i: number) => number) => { let s = 0; for (let i = Math.max(0, end - n + 1); i <= end; i++) s += f(i); return s }
  const kbw12 = sumWin(di, 365, (i) => w.p[i] - w.et0[i])
  const kbw12Hist = years.map((yy) => sumWin(sameDay(yy), 365, (i) => w.p[i] - w.et0[i]))
  const deepAt = (i: number) => { let s = 0, c = 0; for (let k = i - 7; k <= i + 7; k++) { const v = w.smDeep[k]; if (v != null) { s += v; c++ } } return c ? s / c : null }
  let deepNow: number | null = null
  for (let k = di; k >= Math.max(0, di - 12) && deepNow === null; k--) deepNow = w.smDeep[k] ?? null
  const deepHist = years.map((yy) => deepAt(sameDay(yy))).filter((v): v is number => v !== null)
  const rechargeOf = (yy: number) => { const a = idx(w, `${yy}-11-01`), b = Math.min(idx(w, `${yy + 1}-03-31`), di); let s = 0; for (let i = a; i <= b; i++) s += w.liquid[i] - w.et0[i]; return s }
  const recharge = rechargeOf(wy)
  const rechargeHist = years.filter((yy) => yy < wy).map(rechargeOf)
  const pKbw = pct(kbw12, kbw12Hist)
  const pDeep = deepNow !== null && deepHist.length >= 5 ? pct(deepNow, deepHist) : null
  const score = pDeep === null ? pKbw : (pKbw + pDeep) / 2
  const sev: Groundwater['sev'] = score < 15 ? 3 : score < 35 ? 2 : score < 45 ? 1 : 0
  const title = score < 15 ? 'Wody podziemne: wyraźnie niżej niż zwykle' : score < 35 ? 'Wody podziemne: poniżej normy' : score < 75 ? 'Wody podziemne: w normie' : 'Wody podziemne: powyżej normy'
  const legal = 'Pobór do 5 m³ na dobę na potrzeby gospodarstwa to zwykle „zwykłe korzystanie z wód”; większy wymaga pozwolenia wodnoprawnego. Nowa studnia głębsza niż 30 m wymaga projektu robót geologicznych.'
  const advice = sev >= 2 ? [
    'Ogranicz pobór ze studni do niezbędnego minimum — nawadniaj tylko w okresie krytycznym uprawy.',
    'Podlewaj nocą lub wcześnie rano, najlepiej kroplowo — mniej wody ucieka na parowanie.',
    'Mierz poziom wody w studni przed i po poborze; szybki spadek to sygnał do przerwy.',
    'Płytkie studnie (kopane, kilkanaście metrów) wysychają pierwsze — przygotuj zapas w zbiorniku lub oczku.',
    legal,
  ] : sev === 1 ? [
    'Korzystaj ze studni oszczędnie — zasilanie wód podziemnych jest trochę słabsze niż zwykle.',
    'Nawadniaj dawkami z raportu, w okresie krytycznym uprawy; unikaj podlewania w upale w południe.',
    legal,
  ] : score < 75 ? [
    'Możesz korzystać ze studni do nawadniania w okresie krytycznym, dawkami z raportu.',
    'Nadwyżki wody wiosną lepiej zatrzymać w krajobrazie (zastawki, oczka), niż później pompować.',
    legal,
  ] : [
    'Zasoby są dobre — to dobry moment, by zgromadzić wodę w zbiorniku lub oczku na suchy okres.',
    legal,
  ]
  const groundwater: Groundwater = {
    sev, title, deepDrier: pDeep === null ? null : deepHist.filter((v) => v < (deepNow as number)).length, n: years.length,
    kbw12, kbw12Drier: kbw12Hist.filter((v) => v < kbw12).length, recharge, rechargeNorm: mean(rechargeHist), advice,
    why: `Bilans opad − parowanie z ostatnich 12 miesięcy: ${Math.round(kbw12)} mm (bardziej sucho było w ${kbw12Hist.filter((v) => v < kbw12).length} z ${kbw12Hist.length} lat)` +
      (pDeep !== null ? `; wilgotność głębokiej warstwy gleby (${w.smLabel}): bardziej sucho było w ${deepHist.filter((v) => v < (deepNow as number)).length} z ${deepHist.length} lat` : '') +
      `; zasilanie zimowe (${winter.label}, deszcz + roztopy − parowanie): ${Math.round(recharge)} mm wobec ${Math.round(mean(rechargeHist))} mm średnio.`,
  }

  // ---------- przymrozki i pogoda wokół daty ----------
  const from = Math.max(0, di - 13)
  const to = w.forecastFrom !== null ? w.dates.length - 1 : di
  const days: FrostDay[] = []
  for (let i = from; i <= to; i++) days.push({ date: w.dates[i], tmin: w.tmin[i], tmax: w.tmax[i], rain: w.rain[i], snowCm: w.snowCm[i], forecast: w.forecastFrom !== null && i >= w.forecastFrom })
  const next = days.find((d) => d.forecast && d.tmin <= 0) ?? null
  const lastFrost = [...days].reverse().find((d) => !d.forecast && d.tmin <= 0) ?? null
  const doy = doyOf(date)
  const sensitive = active && m >= 4 && m <= 6 && doy <= crop.critical[1]
  const frostWhat = crop.id === 'rzepak' ? 'pąki i kwiaty rzepaku' : crop.id === 'kukurydza' || crop.id === 'ziemniak' || crop.id === 'burak' ? 'młode wschody' : crop.id === 'laka' ? 'odrastającą runi' : 'kłosy w fazie kłoszenia i kwitnienia'
  const text = next
    ? `Prognoza: przymrozek ${fmtDay(next.date)} (${next.tmin.toFixed(1)}°C).${sensitive ? ` W tej fazie może uszkodzić ${frostWhat}.` : ''}`
    : w.forecastFrom !== null ? 'W prognozie na 7 dni nie ma przymrozków.'
      : lastFrost ? `Ostatni przymrozek przed datą analizy: ${fmtDay(lastFrost.date)} (${lastFrost.tmin.toFixed(1)}°C).` : 'W 14 dniach przed datą analizy nie było przymrozków.'
  const frost: Frost = { days, next, lastFrost, sensitive, text }

  // ---------- opady w kolejnych latach hydrologicznych (XI–X) ----------
  const precipYears: PrecipYear[] = []
  for (let yy = y - 10; yy <= y; yy++) {
    const a = idx(w, `${yy - 1}-11-01`), b = Math.min(idx(w, `${yy}-10-31`), di)
    if (w.dates[a] > `${yy - 1}-11-30` || a > b) continue
    let rain = 0, snow = 0
    for (let i = a; i <= b; i++) { rain += w.rain[i]; snow += w.p[i] - w.rain[i] }
    precipYears.push({ label: `${String(yy - 1).slice(2)}/${String(yy).slice(2)}`, rain, snow, total: rain + snow, partial: `${yy}-10-31` > date })
  }

  return { winter, groundwater, frost, precipYears }
}

export type Seasonal = ReturnType<typeof seasonal>
