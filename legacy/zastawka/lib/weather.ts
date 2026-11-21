// Pogoda z Open-Meteo (bez klucza API). Gdy sieć zawiedzie — deterministyczny
// generator pogody, żeby demo działało zawsze (np. na sali bez Wi-Fi).

export interface Day {
  date: string // YYYY-MM-DD
  doy: number
  p: number // opad [mm]
  et0: number // ewapotranspiracja wzorcowa FAO [mm]
  tmax: number
  tmin: number
  forecast: boolean // czy to prognoza (a nie pomiar)
}

export type Mode = { kind: 'season'; year: number } | { kind: 'live' }

export interface WeatherResult {
  days: Day[]
  source: 'open-meteo' | 'offline'
  todayIndex: number // indeks „dzisiaj” w trybie live
}

const DAILY = 'precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min'

export function doyOf(date: string) {
  const d = new Date(date + 'T12:00:00Z')
  const start = Date.UTC(d.getUTCFullYear(), 0, 0)
  return Math.floor((d.getTime() - start) / 86400000)
}

function isoToday() {
  return new Date().toISOString().slice(0, 10)
}

const cache = new Map<string, WeatherResult>()

export async function loadWeather(lat: number, lng: number, mode: Mode): Promise<WeatherResult> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${mode.kind === 'live' ? 'live' : mode.year}`
  const hit = cache.get(key)
  if (hit) return hit

  let url: string
  if (mode.kind === 'season') {
    url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
      `&start_date=${mode.year}-01-01&end_date=${mode.year}-10-31&daily=${DAILY}&timezone=Europe%2FWarsaw`
  } else {
    url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&daily=${DAILY}&past_days=92&forecast_days=16&timezone=Europe%2FWarsaw`
  }

  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 9000)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const j = await res.json()
    const today = isoToday()
    const days: Day[] = (j.daily.time as string[])
      .map((date, i) => ({
        date,
        doy: doyOf(date),
        p: j.daily.precipitation_sum[i],
        et0: j.daily.et0_fao_evapotranspiration[i],
        tmax: j.daily.temperature_2m_max[i],
        tmin: j.daily.temperature_2m_min[i],
        forecast: mode.kind === 'live' && date > today,
      }))
      // archiwum ma kilkudniowe opóźnienie — obcinamy puste dni
      .filter((d) => d.p !== null && d.et0 !== null)
    if (days.length < 30) throw new Error('za mało danych')
    const ti = days.findIndex((d) => d.date === today)
    const out: WeatherResult = { days, source: 'open-meteo', todayIndex: ti >= 0 ? ti : days.length - 17 }
    cache.set(key, out)
    return out
  } catch (e) {
    console.warn('[pogoda] Open-Meteo niedostępne, używam danych offline:', e)
    const out = syntheticWeather(mode, lat)
    cache.set(key, out)
    return out
  }
}

// ---------- offline ----------

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function syntheticWeather(mode: Mode, lat: number): WeatherResult {
  const year = mode.kind === 'season' ? mode.year : new Date().getFullYear()
  const rnd = mulberry32(year * 1000 + Math.round(lat * 10))
  const start = mode.kind === 'season' ? new Date(Date.UTC(year, 0, 1)) : new Date(Date.now() - 92 * 86400000)
  const n = mode.kind === 'season' ? 304 : 92 + 16
  const days: Day[] = []
  const today = isoToday()
  for (let i = 0; i < n; i++) {
    const d = new Date(start.getTime() + i * 86400000)
    const date = d.toISOString().slice(0, 10)
    const doy = doyOf(date)
    const season = Math.sin(((doy - 80) / 365) * 2 * Math.PI) // -1 zima … 1 lato
    const tmean = 9 + 11 * season + (rnd() - 0.5) * 6
    const et0 = Math.max(0.2, 2.3 + 2.4 * season + (rnd() - 0.5) * 1.4)
    // susza wiosenna kwiecień–maj, burze w lipcu
    const dry = doy > 95 && doy < 150
    const chance = dry ? 0.12 : doy > 180 && doy < 215 ? 0.33 : 0.38
    let p = 0
    if (rnd() < chance) p = Math.round(-Math.log(1 - rnd()) * (doy > 170 && doy < 230 ? 7 : 3.5) * 10) / 10
    days.push({ date, doy, p, et0: Math.round(et0 * 100) / 100, tmax: tmean + 5, tmin: tmean - 5, forecast: mode.kind === 'live' && date > today })
  }
  const ti = days.findIndex((d) => d.date === today)
  return { days, source: 'offline', todayIndex: ti >= 0 ? ti : 92 }
}
