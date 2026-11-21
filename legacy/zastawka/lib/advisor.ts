// Z liczb → jedna decyzja na dziś. To jest serce produktu: rolnik nie dostaje
// wykresu do interpretacji, tylko „co zrobić, gdzie i ile na tym zyska”.
import { firstStressIn, rainAhead, summarize, type FieldAnalysis } from './model'
import type { Day } from './weather'

export type Level = 'critical' | 'warning' | 'ok' | 'calm'
export type Verb = 'ZAMKNIJ' | 'OTWÓRZ' | 'TRZYMAJ' | 'NAWADNIAJ'

export interface Advice {
  level: Level
  verb: Verb
  gate: string
  fieldName: string
  title: string
  why: string[]
  gainM3: number
  gainPln: number
  stressAvoided: number
  daysToStress: number | null
  tips: string[]
}

const dni = (n: number) => (n === 1 ? '1 dzień' : `${n} dni`)

export function fmtM3(mm: number, ha: number) {
  return mm * ha * 10 // 1 mm na 1 ha = 10 m³
}

export function adviseField(a: FieldAnalysis, days: Day[], decision: number, ha: number): Advice {
  const { pm, branchOpen, branchSmart, field } = a
  const today = a.smart[decision]
  const rain3 = rainAhead(days, decision, 3)
  const rain14 = rainAhead(days, decision, 14)
  const et14 = days.slice(decision, decision + 14).reduce((s, d) => s + d.et0, 0)
  const sOpen = summarize(branchOpen, pm.crop)
  const sSmart = summarize(branchSmart, pm.crop)
  const stressOpen = firstStressIn(branchOpen.filter((d) => d.inSeason))
  const stressSmart = firstStressIn(branchSmart.filter((d) => d.inSeason))
  const prevStore = a.smart[decision - 1]?.store ?? 0
  const lostIfOpen = branchOpen.reduce((s, d) => s + d.lost, 0) + prevStore
  const keptIfClosed = branchSmart.reduce((s, d) => s + d.captured + d.cr, 0) + (today?.store ?? 0) * 0.5
  // zysk z 14 dni ważony udziałem tego okna w potrzebach wodnych całego sezonu
  const seasonEtc = a.smart.reduce((s, d) => s + (d.inSeason ? d.etc : 0), 0)
  const etaIn = (b: typeof branchOpen) => b.reduce((s, d) => s + (d.inSeason ? d.eta : 0), 0)
  const yieldDelta = seasonEtc > 0 ? Math.max(0, (pm.crop.ky * (etaIn(branchSmart) - etaIn(branchOpen))) / seasonEtc) : 0
  const gainPln = yieldDelta * pm.crop.ym * pm.crop.price * ha
  const fill = pm.storeCap > 0 ? (today?.store ?? 0) / pm.storeCap : 0
  const month = new Date(days[decision].date).getMonth() + 1
  const dep = today ? Math.round((today.dr / today.taw) * 100) : 0

  const tips: string[] = []
  const base = { tips, gate: field.gate, fieldName: field.name, stressAvoided: Math.max(0, sOpen.stressDays - sSmart.stressDays), daysToStress: stressSmart }

  // 1) ulewa + pełny rów → otwórz, zanim podtopi
  if (today?.gateOpen && pm.storeCap > 0) {
    tips.push('Po przejściu opadów zamknij zastawkę ponownie — w ciągu 24–48 h.')
    if (today && today.dr < today.raw * 0.3) tips.push('Nie wjeżdżaj ciężkim sprzętem — gleba blisko pełnego nasycenia.')
    return {
      ...base, level: 'warning', verb: 'OTWÓRZ',
      title: `Otwórz częściowo zastawkę ${field.gate} przed ulewą`,
      why: [
        `W ciągu 3 dni prognoza: ${rain3.toFixed(0)} mm opadu.`,
        `Gleba jest blisko nasycenia, a rów pełny w ${Math.round(fill * 100)}% — bez zrzutu woda cofnie się na pole.`,
        `Zrzuć tylko tyle, ile trzeba (ok. ${Math.round(fmtM3(Math.max(0, (a.smart[decision - 1]?.store ?? 0) - today.store), ha)).toLocaleString('pl')} m³) — resztę deszczu zatrzymasz z powrotem.`,
      ],
      gainM3: fmtM3(today.store, ha), gainPln: 0,
    }
  }

  // 2) poza sezonem — magazynuj wodę zimową i roztopową
  if (month >= 10 || month <= 2) {
    tips.push('Jesienią i zimą rów to Twój magazyn na wiosnę — każda zatrzymana kropla to mniej suszy w kwietniu.')
    tips.push('Sprawdź szczelność deski zastawki i drożność przepustu przed mrozami.')
    return {
      ...base, level: 'calm', verb: 'ZAMKNIJ',
      title: `Zamknij zastawkę ${field.gate} — gromadź wodę na wiosnę`,
      why: [
        `Poza sezonem wegetacji woda z drenów tylko odpływa do rzeki.`,
        fmtM3(keptIfClosed, ha) > 100
          ? `Przy zamkniętej zastawce w ciągu 14 dni zatrzymasz ok. ${Math.round(fmtM3(keptIfClosed, ha)).toLocaleString('pl')} m³.`
          : `Gleba jeszcze nie oddaje wody do drenów — ale pierwsze roztopy i opady zimowe trafią do rowu. Zastawka musi być wtedy już zamknięta.`,
        `Wiosną podsiąk z rowu zasili strefę korzeni.`,
      ],
      gainM3: fmtM3(keptIfClosed, ha), gainPln: gainPln,
    }
  }

  // 3) sezon — czy idzie niedobór?
  const deficitTrend = et14 - rain14
  if (stressOpen !== null || deficitTrend > 15 || dep > 35) {
    const critical = stressSmart !== null && stressSmart < 7
    if (stressSmart !== null) tips.push(`Nawet z retencją stres pojawi się za ${dni(stressSmart)} — jeśli masz deszczownię, to pole ma priorytet.`)
    if (pm.crop.id === 'kukurydza' || pm.crop.id === 'pszenica') tips.push('Przesuń pogłówne nawożenie azotem tuż przed najbliższy deszcz — w suchej glebie N nie zadziała.')
    tips.push('Nie uprawiaj gleby w upał — każda uprawka to 2–5 mm wody mniej.')
    return {
      ...base,
      level: critical ? 'critical' : 'ok',
      verb: critical ? 'NAWADNIAJ' : 'ZAMKNIJ',
      title: critical
        ? stressSmart === 0
          ? `${field.name}: rośliny już w stresie — trzymaj ${field.gate} i nawadniaj`
          : `${field.name}: susza za ${dni(stressSmart)} — zamknij ${field.gate} i nawadniaj`
        : `Zamknij zastawkę ${field.gate} — idzie okres suchy`,
      why: [
        `Bilans na 14 dni: opad ${rain14.toFixed(0)} mm vs parowanie ${et14.toFixed(0)} mm (${deficitTrend > 0 ? '−' : '+'}${Math.abs(deficitTrend).toFixed(0)} mm).`,
        stressOpen === 0
          ? `Gleba wyczerpała ${dep}% wody dostępnej — rośliny już ograniczają wzrost. Podsiąk z rowu łagodzi stres.`
          : stressOpen !== null
            ? `Bez retencji rośliny wejdą w stres za ${dni(stressOpen)}${stressSmart === null ? ' — z zamkniętą zastawką: wcale w tym oknie.' : stressSmart > stressOpen ? `, z retencją dopiero za ${dni(stressSmart)}.` : '.'}`
            : `Gleba wyczerpała już ${dep}% wody dostępnej dla roślin.`,
        `Otwarta zastawka = ${Math.round(fmtM3(lostIfOpen, ha)).toLocaleString('pl')} m³ wody ucieka rowem do rzeki.`,
      ],
      gainM3: fmtM3(keptIfClosed, ha), gainPln,
    }
  }

  tips.push('Utrzymuj piętrzenie 30–50 cm poniżej powierzchni terenu.')
  return {
    ...base, level: 'calm', verb: 'TRZYMAJ',
    title: `Trzymaj zastawkę ${field.gate} zamkniętą — wody jest dość`,
    why: [
      `Gleba ma zapas: wykorzystano tylko ${dep}% wody dostępnej.`,
      `Na 14 dni: opad ${rain14.toFixed(0)} mm, parowanie ${et14.toFixed(0)} mm.`,
      `Brak ulew, które wymagałyby zrzutu.`,
    ],
    gainM3: fmtM3(keptIfClosed, ha), gainPln,
  }
}

const RANK: Record<Level, number> = { critical: 3, warning: 2, ok: 1, calm: 0 }
export function pickTop(list: Advice[]) {
  return [...list].sort((a, b) => RANK[b.level] - RANK[a.level] || b.gainPln - a.gainPln)[0]
}
export function levelRank(l: Level) {
  return RANK[l]
}
