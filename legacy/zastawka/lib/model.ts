// Dobowy bilans wody w strefie korzeniowej (FAO-56, model „wiadra”)
// + magazyn retencji w rowie sterowany zastawką + wpływ na plon (FAO-33, Ky).
import { CROPS, SOILS, type Crop, type Field, type Soil } from './data'
import type { Day } from './weather'

export interface Practices {
  retention: boolean // sterowana zastawka na rowie
  cover: boolean // międzyplon / mulcz — mniej parowania, lepsze wsiąkanie
  organic: boolean // uprawa bezorkowa, +materia organiczna → większa pojemność wodna
  pond: boolean // oczko / zbiornik — dodatkowy magazyn
}

export const NO_PRACTICES: Practices = { retention: false, cover: false, organic: false, pond: false }

export type GatePolicy = 'open' | 'closed' | 'smart'

export interface DayState {
  date: string
  doy: number
  p: number
  et0: number
  forecast: boolean
  kc: number
  dr: number // deficyt wody w strefie korzeni [mm]
  taw: number // całkowita woda dostępna [mm]
  raw: number // łatwo dostępna woda [mm]
  ks: number // współczynnik stresu (1 = brak)
  etc: number
  eta: number
  store: number // woda zatrzymana w rowie [mm na polu]
  storeCap: number
  captured: number // ile odpływu zatrzymano tego dnia [mm]
  lost: number // ile odpłynęło rowem [mm]
  cr: number // podsiąk z rowu [mm]
  gateOpen: boolean
  waterlog: boolean
  inSeason: boolean
}

export interface Params {
  crop: Crop
  soil: Soil
  taw: number
  raw: number
  infil: number
  kcMul: number
  storeCap: number
}

export function params(field: Field, pr: Practices): Params {
  const crop = CROPS[field.crop]
  const soil = SOILS[field.soil]
  let taw = 1000 * (soil.fc - soil.wp) * crop.zr
  if (pr.organic) taw *= 1.12
  return {
    crop,
    soil,
    taw,
    raw: crop.p * taw,
    infil: soil.infil * (pr.cover ? 1.3 : 1) * (pr.organic ? 1.15 : 1),
    kcMul: pr.cover ? 0.88 : 1,
    storeCap: pr.retention ? 70 + (pr.pond ? 40 : 0) : pr.pond ? 40 : 0,
  }
}

export function kcAt(crop: Crop, doy: number) {
  const pts = crop.kc
  if (doy <= pts[0][0] || doy >= pts[pts.length - 1][0]) return 0.3
  for (let i = 1; i < pts.length; i++) {
    if (doy <= pts[i][0]) {
      const [d0, k0] = pts[i - 1]
      const [d1, k1] = pts[i]
      return k0 + ((k1 - k0) * (doy - d0)) / (d1 - d0)
    }
  }
  return 0.3
}

export function inSeason(crop: Crop, doy: number) {
  return doy > crop.kc[0][0] && doy < crop.kc[crop.kc.length - 1][0]
}

export interface Init {
  dr: number
  store: number
}

export function rainAhead(days: Day[], i: number, n = 3) {
  let s = 0
  for (let k = i; k < Math.min(days.length, i + n); k++) s += days[k].p
  return s
}

/** Symulacja dzień po dniu. Prognoza opadów (3 dni) steruje zastawką w trybie „smart”. */
export function simulate(days: Day[], pm: Params, policy: GatePolicy, init: Init, from = 0, to = days.length): DayState[] {
  let dr = init.dr
  let store = Math.min(init.store, pm.storeCap)
  const out: DayState[] = []
  for (let i = from; i < to; i++) {
    const d = days[i]
    const hasStore = pm.storeCap > 0
    let gateOpen = policy === 'open' || !hasStore
    const d0 = d
    if (policy === 'smart' && hasStore) {
      // otwieramy, jeśli idzie ulewa, a rów jest już pełny — inaczej podtopimy pole
      // …i tylko o tyle, ile trzeba: nadwyżka deszczu, której gleba nie przyjmie, musi zmieścić się w rowie
      const r3 = rainAhead(days, i, 3)
      const excess = Math.max(0, r3 - dr - 3 * d0.et0) * pm.soil.capture
      if (r3 >= 20 && excess > pm.storeCap - store + 3) {
        gateOpen = true
        store = Math.max(0, pm.storeCap - excess)
      } else if (dr < 3 && store > 0.9 * pm.storeCap) {
        // mokry okres: trzymamy mały zapas wolnej pojemności (ok. 10%) na wypadek nawalnicy
        gateOpen = true
        store = 0.9 * pm.storeCap
      }
    }
    if (policy === 'open' || !hasStore) store = 0

    const kc = kcAt(pm.crop, d.doy) * (kcAt(pm.crop, d.doy) < 0.7 ? pm.kcMul : 1)
    const ro = Math.max(0, d.p - pm.infil) * 0.8
    const pe = d.p - ro
    const ks = dr > pm.raw ? Math.max(0, (pm.taw - dr) / (pm.taw - pm.raw)) : 1
    const etc = kc * d.et0
    const eta = ks * etc

    // podsiąk z rowu, gdy gleba przesycha
    let cr = 0
    if (store > 0) {
      const demand = Math.min(1, dr / (0.5 * pm.taw))
      cr = Math.min(store, pm.soil.crMax * demand)
      store -= cr
    }

    dr = dr - pe - cr + eta
    let dp = 0
    if (dr < 0) {
      dp = -dr
      dr = 0
    }
    dr = Math.min(dr, pm.taw)

    // odpływ drenarski: przy zamkniętej zastawce część zostaje w rowie
    let captured = 0
    let lost = dp + ro
    let overflow = 0
    if (hasStore && !gateOpen) {
      const inflow = (dp + ro * 0.5) * pm.soil.capture
      captured = Math.min(inflow, pm.storeCap - store)
      overflow = inflow - captured
      store += captured
      lost = dp + ro - captured
    }
    store *= 0.996 // straty: przesiąkanie, parowanie z lustra wody

    // rów pełny, zastawka zamknięta, a woda dalej napływa → cofka i podtopienie pola
    const waterlog = overflow > 3

    out.push({
      date: d.date, doy: d.doy, p: d.p, et0: d.et0, forecast: d.forecast,
      kc, dr, taw: pm.taw, raw: pm.raw, ks, etc, eta, store, storeCap: pm.storeCap,
      captured, lost, cr, gateOpen, waterlog, inSeason: inSeason(pm.crop, d.doy),
    })
  }
  return out
}

export interface Summary {
  stressDays: number
  waterlogDays: number
  capturedMm: number
  crMm: number
  yieldRatio: number // Ya/Ym
}

export function summarize(s: DayState[], crop: Crop): Summary {
  let stress = 0, wl = 0, cap = 0, cr = 0, eta = 0, etc = 0
  for (const d of s) {
    if (d.inSeason) {
      if (d.ks < 0.98) stress++
      eta += d.eta
      etc += d.etc
    }
    if (d.waterlog) wl++
    cap += d.captured
    cr += d.cr
  }
  const ratio = etc > 0 ? Math.max(0, 1 - crop.ky * (1 - eta / etc)) : 1
  return { stressDays: stress, waterlogDays: wl, capturedMm: cap, crMm: cr, yieldRatio: ratio }
}

export interface FieldAnalysis {
  field: Field
  pm: Params
  base: DayState[] // „jak dziś”: zastawka otwarta, bez praktyk
  smart: DayState[] // wybrane praktyki + sterowanie ZASTAWKA
  naive: DayState[] // wybrane praktyki, zastawka zamknięta na stałe
  baseSum: Summary
  smartSum: Summary
  naiveSum: Summary
  /** gałęzie od dnia decyzji: co jeśli dziś zamknę vs. zostawię otwartą */
  branchOpen: DayState[]
  branchSmart: DayState[]
  horizon: number
}

export function analyzeField(field: Field, days: Day[], pr: Practices, decision: number, startDr = 0.15, horizon = 14): FieldAnalysis {
  const pmBase = params(field, NO_PRACTICES)
  const pm = params(field, pr)
  const init = (p: Params): Init => ({ dr: startDr * p.taw, store: 0.4 * p.storeCap })
  const base = simulate(days, pmBase, 'open', init(pmBase))
  const smart = simulate(days, pm, 'smart', init(pm))
  const naive = simulate(days, pm, 'closed', init(pm))

  const d = Math.min(Math.max(decision, 1), days.length - 1)
  const end = Math.min(days.length, d + horizon)
  const prev = smart[d - 1]
  const branchSmart = simulate(days, pm, 'smart', { dr: prev.dr, store: prev.store }, d, end)
  const pmOpen = { ...pm }
  const branchOpen = simulate(days, pmOpen, 'open', { dr: prev.dr, store: prev.store }, d, end)

  return {
    field, pm, base, smart, naive,
    baseSum: summarize(base, pm.crop),
    smartSum: summarize(smart, pm.crop),
    naiveSum: summarize(naive, pm.crop),
    branchOpen, branchSmart, horizon,
  }
}

/** pole wielokąta w ha (offsety w stopniach względem punktu o szerokości lat) */
export function polygonHa(shape: [number, number][], lat: number) {
  const ky = 111_320
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180)
  let a = 0
  for (let i = 0; i < shape.length; i++) {
    const [y1, x1] = shape[i]
    const [y2, x2] = shape[(i + 1) % shape.length]
    a += x1 * kx * (y2 * ky) - x2 * kx * (y1 * ky)
  }
  return Math.abs(a) / 2 / 10_000
}

export function firstStressIn(s: DayState[]) {
  const i = s.findIndex((d) => d.ks < 0.98)
  return i < 0 ? null : i
}
