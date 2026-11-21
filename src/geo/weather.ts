/* eslint-disable @typescript-eslint/no-explicit-any */
// Pogoda dzienna z Open-Meteo: archiwum ERA5 / ERA5-Land (10+ lat wstecz od daty analizy) + prognoza 7 dni,
// jeśli data analizy to „dziś”. Bez klucza API, licencja CC BY 4.0.
// Śnieg nie trafia do gleby od razu: model stopniodni gromadzi go w pokrywie i oddaje wodę w czasie roztopów.
export interface WeatherSeries {
  start: string // pierwsza data (YYYY-MM-DD)
  dates: string[]
  p: number[] // opad całkowity [mm] (deszcz + woda ze śniegu)
  rain: number[] // deszcz [mm]
  snowCm: number[] // świeży śnieg [cm]
  et0: number[] // ET0 FAO Penman-Monteith [mm]
  tmax: number[]
  tmin: number[]
  tmean: number[]
  sm: (number | null)[] // wilgotność gleby 0–100 cm, ERA5-Land [m³/m³] (tylko archiwum)
  smDeep: (number | null)[] // wilgotność 100–255 cm, ERA5-Land — wskaźnik zasilania wód podziemnych
  // --- model śniegu ---
  swe: number[] // woda zmagazynowana w pokrywie śnieżnej [mm]
  melt: number[] // woda z roztopów danego dnia [mm]
  liquid: number[] // woda docierająca do gleby: deszcz + roztopy [mm]
  smLabel: string // skąd wilgotność gleby (ERA5-Land albo NASA POWER)
  analysisIndex: number // indeks daty analizy
  forecastFrom: number | null // indeks pierwszego dnia prognozy
  source: string
}

// 8 zmiennych (≤ 10) — każda ponad 10 mnoży „wagę” zapytania w limicie Open-Meteo; średnią temperaturę liczymy sami
const DAILY = 'precipitation_sum,rain_sum,snowfall_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min'
const SM = 'soil_moisture_0_to_100cm_mean,soil_moisture_100_to_255cm_mean'
const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (s: string, n: number) => iso(new Date(new Date(s + 'T12:00:00Z').getTime() + n * 86400000))

const mem = new Map<string, Promise<unknown>>()

/** pobranie z ponowieniem przy limicie zapytań (HTTP 429) i pamięcią podręczną w przeglądarce */
async function getJson(url: string, timeout = 20000): Promise<any> {
  const hit = mem.get(url)
  if (hit) return hit
  const job = (async () => {
    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), timeout)
      try {
        const r = await fetch(url, { signal: ctrl.signal })
        if (r.status === 429 && attempt < 1) { await new Promise((ok) => setTimeout(ok, 1500)); continue }
        if (!r.ok) throw new Error('Open-Meteo HTTP ' + r.status + (r.status === 429 ? ' (limit zapytań — spróbuj za minutę)' : ''))
        return await r.json()
      } finally {
        clearTimeout(t)
      }
    }
  })()
  mem.set(url, job)
  job.catch(() => mem.delete(url))
  return job
}

const isBrowser = typeof window !== 'undefined'
// archiwum przez nasz serwer (trwały cache); prognoza bezpośrednio (zmienia się co godzinę)
const ARCHIVE = isBrowser ? '/proxy/meteo' : 'https://archive-api.open-meteo.com/v1/archive'
/** zaokrąglenie do siatki 0,05° — ERA5-Land ma 0,1°, więc wynik się nie zmienia, a sąsiednie działki dzielą cache */
const snap = (v: number) => (Math.round(v * 20) / 20).toFixed(2)

/**
 * Model śniegu metodą stopniodni (degree-day): przy średniej dobowej ≤ 0,5°C opad śniegu zostaje w pokrywie;
 * topnienie = 3 mm/°C/dobę powyżej 0°C (typowa wartość dla nizin Polski, por. modele HBV).
 */
function snowModel(snowWE: number[], rain: number[], tmean: number[]) {
  const n = rain.length
  const swe = new Array<number>(n), melt = new Array<number>(n), liquid = new Array<number>(n)
  let pack = 0
  for (let i = 0; i < n; i++) {
    const t = tmean[i]
    pack += snowWE[i]
    const m = t > 0 ? Math.min(pack, 3 * t) : 0
    pack -= m
    swe[i] = pack
    melt[i] = m
    liquid[i] = rain[i] + m
  }
  return { swe, melt, liquid }
}

type Daily = { daily: Record<string, (number | null)[]> & { time: string[] } }

/** ET₀ metodą Hargreavesa-Samaniego (FAO-56, równ. 52) — gdy brak pełnych danych do Penmana-Monteitha. */
function et0Hargreaves(tmax: number, tmin: number, lat: number, doy: number) {
  const phi = (lat * Math.PI) / 180
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365)
  const d = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39)
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(d))))
  const Ra = ((24 * 60) / Math.PI) * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.sin(ws))
  return Math.max(0, 0.0023 * ((tmax + tmin) / 2 + 17.8) * Math.sqrt(Math.max(0, tmax - tmin)) * 0.408 * Ra)
}

/**
 * Zapasowe źródło archiwum: NASA POWER (MERRA-2) — bezpłatne, bez klucza, jedno zapytanie na cały zakres.
 * Używane, gdy Open-Meteo odmówi (np. limit zapytań). Zwraca dane w formacie zgodnym z Open-Meteo.
 */
async function fetchPower(lat: number, lng: number, start: string, end: string): Promise<Daily> {
  const u = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,PRECSNOLAND,T2M_MAX,T2M_MIN,GWETROOT,GWETPROF&community=AG&longitude=${lng.toFixed(3)}&latitude=${lat.toFixed(3)}&start=${start.replace(/-/g, '')}&end=${end.replace(/-/g, '')}&format=JSON`
  const j = await getJson(u, 30000)
  const P = j.properties.parameter
  const keys = Object.keys(P.PRECTOTCORR).sort()
  const v = (k: string, d: string) => { const x = P[k]?.[d]; return x === undefined || x <= -990 ? null : x }
  const out: Daily = { daily: { time: [], precipitation_sum: [], rain_sum: [], snowfall_sum: [], et0_fao_evapotranspiration: [], temperature_2m_max: [], temperature_2m_min: [], soil_moisture_0_to_100cm_mean: [], soil_moisture_100_to_255cm_mean: [] } as any }
  for (const k of keys) {
    const d = `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`
    const p = v('PRECTOTCORR', k), sn = v('PRECSNOLAND', k) ?? 0, tx = v('T2M_MAX', k), tn = v('T2M_MIN', k)
    if (p === null || tx === null || tn === null) continue
    out.daily.time.push(d)
    out.daily.precipitation_sum.push(p)
    out.daily.rain_sum.push(Math.max(0, p - sn))
    out.daily.snowfall_sum.push(sn) // ok. 1 cm świeżego śniegu na 1 mm wody
    out.daily.et0_fao_evapotranspiration.push(et0Hargreaves(tx, tn, lat, doyOf(d)))
    out.daily.temperature_2m_max.push(tx)
    out.daily.temperature_2m_min.push(tn)
    out.daily.soil_moisture_0_to_100cm_mean.push(v('GWETROOT', k))
    out.daily.soil_moisture_100_to_255cm_mean.push(v('GWETPROF', k))
  }
  return out
}

export async function fetchWeather(lat: number, lng: number, date: string, from?: string): Promise<WeatherSeries> {
  const today = iso(new Date())
  const y = Number((from ?? date).slice(0, 4))
  const start = `${y - 10}-01-01`
  const archiveEnd = date < addDays(today, -7) ? date : addDays(today, -7)
  const ll = `latitude=${snap(lat)}&longitude=${snap(lng)}&timezone=Europe%2FWarsaw&daily=${DAILY}`
  let fallback = false
  const archive = getJson(`${ARCHIVE}?${ll},${SM}&start_date=${start}&end_date=${archiveEnd}`)
    .catch(async () => { fallback = true; return fetchPower(lat, lng, start, archiveEnd) }) as Promise<Daily>
  const jobs: Promise<Daily | null>[] = [archive]
  const recent = date >= addDays(today, -7)
  if (recent) jobs.push(getJson(`https://api.open-meteo.com/v1/forecast?${ll}&past_days=14&forecast_days=8`).catch(() => null))
  const res = (await Promise.all(jobs)).filter((x): x is Daily => !!x)
  type Row = { p: number; rain: number; snowCm: number; snowWE: number; et0: number; tmax: number; tmin: number; tmean: number; sm: number | null; smDeep: number | null }
  const map = new Map<string, Row>()
  for (const j of res) {
    const D = j.daily
    D.time.forEach((d, i) => {
      const p = D.precipitation_sum[i], e = D.et0_fao_evapotranspiration[i]
      if (p === null || e === null) return
      const rain = D.rain_sum?.[i] ?? p
      const tmax = D.temperature_2m_max[i] ?? NaN, tmin = D.temperature_2m_min?.[i] ?? NaN
      const tmean = (tmax + tmin) / 2
      const prev = map.get(d)
      const row: Row = {
        p, rain: Math.min(p, rain), snowCm: D.snowfall_sum?.[i] ?? 0, snowWE: Math.max(0, p - Math.min(p, rain)), et0: e, tmax, tmin, tmean,
        sm: (D['soil_moisture_0_to_100cm_mean']?.[i] as number | null | undefined) ?? prev?.sm ?? null,
        smDeep: (D['soil_moisture_100_to_255cm_mean']?.[i] as number | null | undefined) ?? prev?.smDeep ?? null,
      }
      if (!prev || d > archiveEnd) map.set(d, row)
    })
  }
  const dates = [...map.keys()].sort()
  const rows = dates.map((d) => map.get(d)!)
  const analysisIndex = dates.findIndex((d) => d >= date)
  const fi = recent ? dates.findIndex((d) => d > today) : -1
  const sn = snowModel(rows.map((r) => r.snowWE), rows.map((r) => r.rain), rows.map((r) => r.tmean))
  return {
    start: dates[0],
    dates,
    p: rows.map((r) => r.p),
    rain: rows.map((r) => r.rain),
    snowCm: rows.map((r) => r.snowCm),
    et0: rows.map((r) => r.et0),
    tmax: rows.map((r) => r.tmax),
    tmin: rows.map((r) => r.tmin),
    tmean: rows.map((r) => r.tmean),
    sm: rows.map((r) => r.sm),
    smDeep: rows.map((r) => r.smDeep),
    ...sn,
    smLabel: fallback ? 'NASA POWER / MERRA-2' : 'ERA5-Land',
    analysisIndex: analysisIndex < 0 ? dates.length - 1 : analysisIndex,
    forecastFrom: fi >= 0 ? fi : null,
    source: fallback
      ? 'NASA POWER (MERRA-2) — źródło zapasowe, bo Open-Meteo odmówił (limit zapytań); ET₀ metodą Hargreavesa (FAO-56)' + (recent && res.length > 1 ? ' + prognoza Open-Meteo' : '')
      : recent ? 'Open-Meteo: ERA5 / ERA5-Land (archiwum) + model prognozy (7 dni)' : 'Open-Meteo: ERA5 / ERA5-Land (archiwum)',
  }
}

/** Własny pomiar opadu rolnika (ostatnie 7 dni) — przeskalowanie deszczu i przeliczenie śniegu. */
export function withRain7(w: WeatherSeries, rain7: number): WeatherSeries {
  const p = w.p.slice(), rain = w.rain.slice()
  const a = Math.max(0, w.analysisIndex - 6), b = w.analysisIndex
  const era = p.slice(a, b + 1).reduce((s, v) => s + v, 0)
  for (let i = a; i <= b; i++) {
    const k = era > 0.5 ? rain7 / era : 0
    p[i] = era > 0.5 ? p[i] * k : rain7 / (b - a + 1)
    rain[i] = era > 0.5 ? rain[i] * k : p[i]
  }
  const sn = snowModel(p.map((v, i) => Math.max(0, v - rain[i])), rain, w.tmean)
  return { ...w, p, rain, ...sn }
}

export const doyOf = (d: string) => {
  const t = new Date(d + 'T12:00:00Z')
  return Math.floor((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 0)) / 86400000)
}
