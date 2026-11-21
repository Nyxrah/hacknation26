import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, CloudRain, Droplets, LocateFixed, MousePointerClick, Radio, ShieldAlert, Sprout, TrendingUp, Wifi, WifiOff } from 'lucide-react'
import { DEMO_FARM, PROGRAMS, SOILS, CROPS } from './lib/data'
import { analyzeField, polygonHa, type Practices } from './lib/model'
import { adviseField, levelRank, type Advice } from './lib/advisor'
import { loadWeather, type Mode, type WeatherResult } from './lib/weather'
import { longDate, m3, nf0, nf1, pln } from './lib/format'
import { FarmMap } from './components/FarmMap'
import { ActionCard } from './components/ActionCard'
import { SoilBucket } from './components/SoilBucket'
import { ForecastChart } from './components/ForecastChart'
import { SeasonTimeline } from './components/SeasonTimeline'
import { FieldTabs, Kpi, ProgramsPanel, ScenarioPanel, SmsPanel } from './components/Panels'
import { Chip, LEVEL_COLOR, Panel } from './components/ui'

const MODES: { label: string; mode: Mode }[] = [
  { label: 'Sezon 2025', mode: { kind: 'season', year: 2025 } },
  { label: 'Sezon 2024', mode: { kind: 'season', year: 2024 } },
  { label: 'Na żywo', mode: { kind: 'live' } },
]

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-10 w-10 place-items-center rounded-xl bg-ink-800 ring-1 ring-water/30">
        <Droplets className="text-water" size={20} />
        <div className="absolute inset-x-1.5 top-1/2 h-[3px] rounded-full bg-alarm" />
      </div>
      <div>
        <div className="font-mono text-lg font-bold tracking-[0.2em] text-white">ZASTAWKA</div>
        <div className="-mt-0.5 text-[11px] text-slate-400">copilot retencji wody dla rolnika</div>
      </div>
    </div>
  )
}

export default function App() {
  const farm = DEMO_FARM
  const [modeIdx, setModeIdx] = useState(0)
  const mode = MODES[modeIdx].mode
  const [center, setCenter] = useState({ lat: farm.lat, lng: farm.lng })
  const [wx, setWx] = useState<WeatherResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [decision, setDecision] = useState(0)
  const [practices, setPractices] = useState<Practices>({ retention: true, cover: false, organic: false, pond: false })
  const [selected, setSelected] = useState('f2')

  useEffect(() => {
    let alive = true
    setLoading(true)
    loadWeather(center.lat, center.lng, mode).then((r) => {
      if (!alive) return
      setWx(r)
      if (mode.kind === 'season') {
        // domyślny dzień demo: początek fali upałów (2025) / suchy maj (2024)
        const i = r.days.findIndex((d) => d.date === `${mode.year}-${mode.year === 2025 ? '06-27' : '05-06'}`)
        setDecision(i > 0 ? i : Math.floor(r.days.length / 2))
      } else {
        setDecision(Math.max(1, r.todayIndex))
      }
      setLoading(false)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, modeIdx])

  const areas = useMemo(() => Object.fromEntries(farm.fields.map((f) => [f.id, polygonHa(f.shape, center.lat)])), [farm, center.lat])

  const analyses = useMemo(() => {
    if (!wx) return null
    const d = Math.min(decision, wx.days.length - 1)
    return Object.fromEntries(farm.fields.map((f) => [f.id, analyzeField(f, wx.days, practices, d, mode.kind === 'live' ? 0.35 : 0.0)]))
  }, [wx, practices, decision, farm, mode.kind])

  const advices = useMemo(() => {
    if (!wx || !analyses) return {} as Record<string, Advice>
    return Object.fromEntries(farm.fields.map((f) => [f.id, adviseField(analyses[f.id], wx.days, decision, areas[f.id])])) as Record<string, Advice>
  }, [analyses, wx, decision, farm, areas])

  const gateOpen = useMemo(() => {
    if (!analyses) return {}
    return Object.fromEntries(farm.fields.map((f) => [f.gate, analyses[f.id].smart[decision]?.gateOpen ?? false]))
  }, [analyses, decision, farm])

  const totals = useMemo(() => {
    if (!analyses) return null
    let captured = 0, pln0 = 0, tons = 0, naiveWl = 0, smartWl = 0
    for (const f of farm.fields) {
      const a = analyses[f.id]
      const ha = areas[f.id]
      captured += a.smartSum.capturedMm * ha * 10
      const dy = Math.max(0, a.smartSum.yieldRatio - a.baseSum.yieldRatio) * a.pm.crop.ym * ha
      tons += dy
      pln0 += dy * a.pm.crop.price
      naiveWl += a.naiveSum.waterlogDays
      smartWl += a.smartSum.waterlogDays
    }
    return { captured, pln: pln0, tons, naiveWl, smartWl }
  }, [analyses, farm, areas])

  const a = analyses?.[selected]
  const adv = advices[selected]
  const field = farm.fields.find((f) => f.id === selected)!
  const today = wx?.days[decision]
  const ordered = farm.fields.map((f) => advices[f.id]).filter(Boolean).sort((x, y) => levelRank(y.level) - levelRank(x.level))
  const scopeLabel = mode.kind === 'season' ? `sezon ${mode.year}` : 'ostatnie 3 mies. + prognoza'

  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-16">
      {/* ---------- header ---------- */}
      <header className="flex flex-wrap items-center justify-between gap-4 py-5">
        <Logo />
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-ink-900/80 p-1">
          {MODES.map((m, i) => (
            <button
              key={m.label}
              onClick={() => setModeIdx(i)}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${i === modeIdx ? 'bg-water text-ink-950' : 'text-slate-400 hover:text-white'}`}
            >
              {m.mode.kind === 'live' ? <Radio size={13} /> : <CalendarClock size={13} />}
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[12px] text-slate-400">
          <span className="flex items-center gap-1.5"><LocateFixed size={13} /> {center.lat.toFixed(3)}°N, {center.lng.toFixed(3)}°E</span>
          {wx && (wx.source === 'open-meteo'
            ? <Chip color="#34d399"><Wifi size={11} /> Open-Meteo · dane rzeczywiste</Chip>
            : <Chip color="#fbbf24"><WifiOff size={11} /> tryb offline · dane syntetyczne</Chip>)}
        </div>
      </header>

      {/* ---------- pitch strip ---------- */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <h1 className="max-w-3xl text-[34px] font-extrabold leading-[1.05] tracking-tight text-white">
          Zatrzymaj wodę, <span className="bg-gradient-to-r from-water to-leaf bg-clip-text text-transparent">zanim odpłynie rowem.</span>
        </h1>
        <p className="max-w-md text-[13px] leading-relaxed text-slate-400">
          Ok. 6 mln ha pól w Polsce jest zmeliorowanych — rowy budowano, by <i>odprowadzać</i> wodę. ZASTAWKA mówi każdego dnia,
          kiedy ją zatrzymać, a kiedy zrzucić, i ile to jest warte w złotówkach.
        </p>
      </div>

      {!wx || !a || !adv || !today || !totals ? (
        <div className="panel grid h-[520px] place-items-center text-slate-400">
          <div className="flex items-center gap-3"><CloudRain className="animate-pulse text-water" /> Pobieram pogodę i liczę bilans wody…</div>
        </div>
      ) : (
        <div className={`space-y-5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {/* ---------- row 1 ---------- */}
          <div className="grid grid-cols-12 gap-5">
            <div className="panel relative col-span-12 h-[560px] overflow-hidden p-0 lg:col-span-7">
              <FarmMap
                farm={farm}
                center={center}
                advices={advices}
                gateOpen={gateOpen}
                selected={selected}
                onSelect={setSelected}
                onRelocate={(lat, lng) => setCenter({ lat, lng })}
              />
              <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-xl border border-white/10 bg-ink-950/80 px-4 py-3 backdrop-blur-md">
                <div className="label">{farm.name}</div>
                <div className="mt-1 text-sm font-semibold text-white">{farm.place}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400"><MousePointerClick size={12} /> 2× klik na mapie = przenieś gospodarstwo</div>
              </div>
              <div className="absolute inset-x-4 bottom-4 z-[500]">
                <FieldTabs fields={farm.fields} advices={advices} areas={areas} selected={selected} onSelect={setSelected} />
              </div>
            </div>

            <div className="col-span-12 flex flex-col gap-5 lg:col-span-5">
              <ActionCard adv={adv} dateLabel={longDate(today.date)} />
              <Panel
                title={`Przekrój pola · ${field.name}`}
                right={<span className="font-mono text-[11px] text-slate-400">{CROPS[field.crop].emoji} {CROPS[field.crop].name} · {SOILS[field.soil].name}</span>}
                className="flex-1"
              >
                <SoilBucket s={a.smart[decision]} gate={field.gate} />
              </Panel>
            </div>
          </div>

          {/* ---------- timeline ---------- */}
          <Panel
            title={mode.kind === 'season' ? `Wehikuł czasu · ${scopeLabel} — przeciągnij, aby zobaczyć decyzję z dowolnego dnia` : 'Ostatnie 3 miesiące i prognoza 16 dni'}
            right={
              <div className="flex items-center gap-4 text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-alarm" /> bez retencji</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-water" /> z ZASTAWKĄ</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 bg-sky-400/40" /> opad</span>
                <span className="flex items-center gap-1.5"><span className="h-1 w-3 bg-alarm" /> dni stresu</span>
              </div>
            }
          >
            <SeasonTimeline a={a} decision={decision} onChange={setDecision} />
          </Panel>

          {/* ---------- row 2 ---------- */}
          <div className="grid grid-cols-12 gap-5">
            <Panel title={`Najbliższe 14 dni · ${field.name}: woda dostępna dla roślin`} className="col-span-12 lg:col-span-8"
              right={<span className="text-[11px] text-slate-400">{a.branchSmart.some((d) => d.forecast) || mode.kind === 'live' ? 'prognoza Open-Meteo' : 'prognoza odtworzona z archiwum'}</span>}>
              <ForecastChart a={a} decision={decision} />
            </Panel>
            <Panel title="Plan na dziś — całe gospodarstwo" className="col-span-12 lg:col-span-4">
              <div className="space-y-2">
                {ordered.map((o) => {
                  const f = farm.fields.find((x) => x.name === o.fieldName)!
                  return (
                    <button key={o.gate} onClick={() => setSelected(f.id)} className={`w-full rounded-xl border p-3 text-left transition hover:bg-white/[0.04] ${f.id === selected ? 'border-white/15 bg-white/[0.03]' : 'border-white/5'}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] font-semibold" style={{ color: LEVEL_COLOR[o.level] }}>{o.verb} · {o.gate}</span>
                        <span className="text-[11px] text-slate-500">{o.fieldName}</span>
                      </div>
                      <div className="mt-1 text-[13px] leading-snug text-slate-200">{o.title}</div>
                    </button>
                  )
                })}
              </div>
              {adv.tips.length > 0 && (
                <div className="mt-4 border-t border-white/5 pt-4">
                  <div className="label mb-2">Wskazówki · {field.name}</div>
                  <ul className="space-y-1.5 text-[12.5px] leading-snug text-slate-400">
                    {adv.tips.map((t) => <li key={t} className="flex gap-2"><Sprout size={13} className="mt-0.5 shrink-0 text-leaf" />{t}</li>)}
                  </ul>
                </div>
              )}
            </Panel>
          </div>

          {/* ---------- KPI ---------- */}
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            <Kpi icon={<Droplets size={12} />} label={`Woda zatrzymana · ${scopeLabel}`} value={m3(totals.captured)} sub={`≈ ${nf0.format(totals.captured / 2500)} basenów olimpijskich`} color="#22d3ee" />
            <Kpi icon={<Sprout size={12} />} label={`Dni stresu mniej · ${field.name}`} value={`${a.baseSum.stressDays - a.smartSum.stressDays}`} sub={`${a.baseSum.stressDays} dni bez retencji → ${a.smartSum.stressDays} z ZASTAWKĄ`} color="#34d399" />
            <Kpi icon={<TrendingUp size={12} />} label="Plon uratowany · gospodarstwo" value={pln(totals.pln)} sub={`+${nf1.format(totals.tons)} t przy cenach demo`} color="#fbbf24" />
            <Kpi icon={<ShieldAlert size={12} />} label="Dni podtopień" value={`${totals.smartWl}`} sub={`zastawka zamknięta na stałe: ${totals.naiveWl} dni`} color="#f43f5e" />
          </div>

          {/* ---------- row 3 ---------- */}
          <div className="grid grid-cols-12 gap-5">
            <div className="col-span-12 lg:col-span-4">
              <ScenarioPanel value={practices} onChange={setPractices} naiveWl={totals.naiveWl} smartWl={totals.smartWl} />
            </div>
            <div className="col-span-12 md:col-span-5 lg:col-span-3">
              <SmsPanel adv={adv} />
            </div>
            <div className="col-span-12 md:col-span-7 lg:col-span-5">
              <ProgramsPanel programs={PROGRAMS} field={field} />
            </div>
          </div>

          <footer className="pt-4 text-[11px] leading-relaxed text-slate-500">
            Model: dobowy bilans wody w strefie korzeniowej wg FAO-56 (ET₀ Penman-Monteith z Open-Meteo, Kc wg fazy rozwoju), magazyn retencji w rowie
            z podsiąkiem kapilarnym, wpływ niedoboru na plon wg FAO-33 (Ky). Parametry gleb, plony i ceny są orientacyjne. Prototyp na HackNation 2026 —
            kampania KOWR „Zatrzymaj wodę, chroń plony”.
          </footer>
        </div>
      )}
    </div>
  )
}
