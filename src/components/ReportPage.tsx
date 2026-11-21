import { useMemo, useState, type ReactNode } from 'react'
import { type Cause, type FarmerInput, type Rec } from '../geo/assess'
import { CROPS } from '../geo/crops'
import { STEPS, type Result, type StepId } from '../geo/loader'
import { polygonArea } from '../geo/analyze'
import { cropToParcel, drawLayer, hillshade, satDryCanvas } from '../geo/render'
import { HistoryChart, PrecipYears, SeasonChart } from './Charts'
import { FieldView } from './FieldView'
import { Info, Pill, Spinner, sevOf } from './ui'
import { RefinePanel } from './RefinePanel'
import { CropRank, PeriodPanel } from './Extras'
import { SeasonPanel } from './SeasonPanel'

export type StepState = Partial<Record<StepId, { state: 'run' | 'ok' | 'skip' | 'err'; note?: string }>>

const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
const ICON: Record<string, string> = { gleba: '🌱', klimat: '🌦️', wilgotnosc: '💧', satelita: '🛰️' }

type TabId = 'start' | 'analiza' | 'kroki' | 'mapa' | 'pogoda' | 'uprawy' | 'zrodla'
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'start', label: 'Podsumowanie', icon: '📋' },
  { id: 'analiza', label: 'Analiza działki', icon: '🔍' },
  { id: 'kroki', label: 'Co zrobić', icon: '✅' },
  { id: 'mapa', label: 'Mapa pola', icon: '🗺️' },
  { id: 'pogoda', label: 'Pogoda i woda', icon: '🌦️' },
  { id: 'uprawy', label: 'Uprawy i 10 lat', icon: '🌾' },
  { id: 'zrodla', label: 'Źródła', icon: 'ℹ️' },
]

const GROUPS: { id: Rec['group']; title: string; icon: string }[] = [
  { id: 'retencja', title: 'Zatrzymaj wodę', icon: '💧' },
  { id: 'agrotechnika', title: 'Uprawa, która oszczędza wodę', icon: '🚜' },
  { id: 'nawadnianie', title: 'Nawadnianie i woda w gospodarstwie', icon: '🚿' },
]

/** Prognoza, nie pewność — pokazywane na górze raportu i na wydruku. */
function Disclaimer() {
  return (
    <div className="mt-4 flex gap-3 rounded-xl border border-[#e8c66a] bg-[#fff8e1] px-4 py-3 text-[15px] leading-snug text-[#6b5200]">
      <span className="text-[20px]">⚠️</span>
      <span><b>To przewidywanie, a nie pewność.</b> Raport szacuje sytuację na podstawie danych satelitarnych, pogodowych i modeli. Przed decyzją sprawdź stan pola na miejscu.</span>
    </div>
  )
}

export function ReportPage({ res, steps, elapsed, onRefine, onUpgradeTerrain }: { res: Result; steps: StepState; elapsed: number; onRefine: (f: FarmerInput) => void; onUpgradeTerrain: () => Promise<void> }) {
  const [tab, setTab] = useState<TabId>('start')
  const [seen, setSeen] = useState<Set<TabId>>(new Set(['start']))
  const [focus, setFocus] = useState<Int32Array | null>(null)
  const go = (t: TabId) => { setTab(t); setSeen((s) => new Set(s).add(t)); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const crop = CROPS[res.cropId]
  const ha = polygonArea(res.parcel.ring) / 1e4

  // ---------- ekran ładowania: zakładki dopiero po przeliczeniu ----------
  if (!res.done || !res.R) return <Loading res={res} steps={steps} elapsed={elapsed} />
  const R = res.R

  const panel = (id: TabId, title: string, body: ReactNode) => (
    <section className="tab-panel appear" data-active={tab === id} role="tabpanel" aria-label={title}>
      <h2 className="print-only mt-8 border-b border-line pb-1 text-[22px] font-bold">{title}</h2>
      {body}
    </section>
  )

  const showOnMap = (r: Rec) => {
    const kind = r.icon === '🚧' ? 'zastawka' : r.icon === '💧' ? 'oczko' : r.icon === '🌳' ? 'zadrzewienie' : null
    const iv = res.A?.interventions.find((x) => x.kind === kind)
    setFocus(iv?.cells ?? null)
    go('mapa')
  }
  const top3 = [...R.recs].filter((r) => r.icon !== '🚿').sort((a, b) => a.priority - b.priority).slice(0, 3)
  const mine = R.cropRank.find((c) => c.chosen)

  return (
    <div className="pb-20">
      {/* nagłówek */}
      <div className="pt-5">
        <div className="eyebrow">Raport wodny · {res.from ? `${fmtDate(res.from)} – ${fmtDate(res.date)}` : fmtDate(res.date)}</div>
        <h1 className="mt-1.5 text-[28px] font-bold leading-tight md:text-[34px]">{crop.icon} {crop.name} · działka {res.parcel.id}</h1>
        <div className="mt-0.5 text-[15px] text-muted">gm. {res.parcel.commune}, obręb {res.parcel.region} · {ha.toFixed(2)} ha · policzono w {res.seconds.toFixed(0)} s</div>
        <Disclaimer />
      </div>

      {/* zakładki */}
      <nav className="no-print sticky top-[64px] z-[900] -mx-4 mt-4 border-b border-line bg-paper/95 px-4 backdrop-blur md:-mx-6 md:px-6" role="tablist">
        <div className="flex gap-1.5 overflow-x-auto py-2.5 [scrollbar-width:none]">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => go(t.id)}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-[15.5px] font-semibold transition ${tab === t.id ? 'bg-field text-white shadow-md' : 'bg-white text-ink ring-1 ring-line hover:bg-field-soft'}`}>
              <span className="text-[18px] leading-none">{t.icon}</span>{t.label}
              {t.id === 'kroki' && <span className={`rounded-full px-2 text-[12.5px] ${tab === t.id ? 'bg-white/25' : 'bg-field-soft text-field-dark'}`}>{R.recs.length}</span>}
            </button>
          ))}
        </div>
      </nav>

      <div className="pt-5">
        {/* ---------- 1. Podsumowanie ---------- */}
        {panel('start', 'Podsumowanie', (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.25fr_1fr]">
              <div className="card p-6" style={{ borderColor: sevOf(R.status.sev).color, borderWidth: 2 }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Pill color={sevOf(R.status.sev).color} bg={sevOf(R.status.sev).bg}>{sevOf(R.status.sev).icon} {R.status.title}</Pill>
                  <span className="text-[14px] text-muted">pewność szacunku: <b className="text-ink">{R.status.confidence}</b></span>
                </div>
                <p className="mt-3 text-[21px] leading-snug">{R.status.text}</p>
                {R.active && (
                  <div className="mt-4">
                    <div className="relative h-5 overflow-hidden rounded-full bg-paper">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${R.current.availPct}%`, background: sevOf(R.indicators[0].sev ?? 0).color }} />
                      <div className="absolute inset-y-0 border-l-2 border-dashed border-ink/60" style={{ left: `${100 - Math.round(crop.p * 100)}%` }} />
                    </div>
                    <div className="mt-1 flex justify-between text-[13px] text-muted"><span>woda dla roślin w glebie (szacunek) · kreska = próg stresu</span><b className="num text-ink">{R.current.availPct}%</b></div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {R.indicators.map((i) => {
                  const s = sevOf(i.sev)
                  return (
                    <div key={i.key} className="card p-3.5">
                      <div className="flex items-center gap-2 text-[14px] text-muted"><span className="text-[18px]">{ICON[i.key]}</span>{i.label}</div>
                      <div className="num mt-1 text-[24px] font-bold" style={{ color: s.color }}>{i.value}</div>
                      <div className="line-clamp-2 text-[12.5px] leading-snug text-muted">{i.detail}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {R.period && res.from && (
              <div>
                <h3 className="mb-2 text-[20px] font-bold">Wybrany okres w liczbach</h3>
                <PeriodPanel P={R.period} areaHa={ha} />
              </div>
            )}

            <div className="card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[20px] font-bold">✅ Najważniejsze kroki</h3>
                <button className="no-print text-[15px] font-semibold text-field underline" onClick={() => go('kroki')}>Wszystkie zalecenia ({R.recs.length}) →</button>
              </div>
              <ol className="mt-3 space-y-2.5">
                {top3.map((r, k) => (
                  <li key={r.title} className="flex gap-3 rounded-xl bg-paper p-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-field font-bold text-white">{k + 1}</span>
                    <div><div className="font-semibold leading-snug">{r.icon} {r.title}</div>{r.effect && <div className="mt-0.5 text-[14px] text-muted">{r.effect}</div>}</div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Fact icon="🚿" title={R.irrigation.title} sub="nawadnianie" onClick={() => go('kroki')} />
              <Fact icon="📈" title={`Susza w ${R.history.droughtYears} z ${R.history.rows.length} lat`} sub={`najczęściej: ${R.history.riskMonths}`} onClick={() => go('uprawy')} />
              <Fact icon="🌾" title={`Najlepiej pasuje: ${R.cropRank[0].name}`} sub={`${crop.short}: ok. ${mine?.yieldPct ?? '—'}% możliwego plonu bez nawadniania`} onClick={() => go('uprawy')} />
            </div>
          </div>
        ))}

        {/* ---------- 2. Analiza działki ---------- */}
        {panel('analiza', 'Analiza działki', (
          <div className="space-y-5">
            <p className="text-[16px] text-muted">Co według danych i modeli <b>może</b> wpływać na wodę na Twoim polu. To szacunek — Ty znasz pole najlepiej.</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[...R.causes].sort((a, b) => rank(b) - rank(a)).map((c) => <FactorCard key={c.id} c={c} />)}
            </div>
            <RefinePanel value={res.farmer} onChange={onRefine} disabled={false} soilFromData={res.soil?.source === 'rolnik' ? 'podana przez Ciebie' : (res.soil?.texture ?? '—')} />
          </div>
        ))}

        {/* ---------- 3. Co zrobić ---------- */}
        {panel('kroki', 'Co zrobić', (
          <div className="space-y-6">
            <p className="text-[16px] text-muted">Kolejność ma znaczenie: najpierw zatrzymać wodę, potem ją oszczędzać, na końcu — jeśli trzeba — nawadniać.</p>
            {GROUPS.map((g) => {
              const list = R.recs.filter((r) => r.group === g.id && r.icon !== '🚿')
              if (!list.length && g.id !== 'nawadnianie') return null
              return (
                <div key={g.id}>
                  <h3 className="mb-2 flex items-center gap-2 text-[21px] font-bold"><span>{g.icon}</span>{g.title}</h3>
                  {g.id === 'nawadnianie' && <IrrigationCard res={res} />}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {list.map((r) => <RecCard key={r.title} r={r} onMap={g.id === 'retencja' && ['🚧', '💧', '🌳'].includes(r.icon) && res.A ? () => showOnMap(r) : undefined} />)}
                  </div>
                </div>
              )
            })}
          </div>
        ))}

        {/* ---------- 4. Mapa ---------- */}
        {panel('mapa', 'Mapa pola', (
          <div>
            {!res.demFine && <TerrainUpgrade onUpgrade={onUpgradeTerrain} />}
            {res.A && res.soil && (seen.has('mapa')
              ? <FieldView A={res.A} hsg={res.soil.hsg} highlight={focus} />
              : <div className="card grid h-[300px] place-items-center text-muted">Mapa wczyta się po otwarciu zakładki.</div>)}
            {!res.A && <div className="card p-6 text-muted">Brak danych o ukształtowaniu terenu dla tej działki.</div>}
            <Info>Model terenu: {res.demLabel}. Mapa pokazuje szacowany spływ wody — rzeczywisty zależy też od drenażu, kolein i stanu gleby.</Info>
          </div>
        ))}

        {/* ---------- 5. Pogoda i woda ---------- */}
        {panel('pogoda', 'Pogoda i woda', <SeasonPanel res={res} />)}

        {/* ---------- 6. Uprawy i 10 lat ---------- */}
        {panel('uprawy', 'Uprawy i 10 lat', (
          <div className="space-y-5">
            <CropRank R={R} />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="card p-5">
                <h3 className="text-[19px] font-bold">Susza w okresie krytycznym: {R.history.droughtYears} z {R.history.rows.length} lat</h3>
                <Info>Szacowane dni, w których {crop.short} miała za mało wody („{crop.criticalName}”). Pomarańczowe — lata suche.</Info>
                <div className="mt-3"><HistoryChart R={R} /></div>
              </div>
              <div className="card p-5">
                <h3 className="text-[19px] font-bold">Kiedy najczęściej brakuje wody</h3>
                {R.active && R.series.length > 0 && <div className="mt-3"><SeasonChart R={R} /></div>}
                <div className="mt-3 text-[15px]">Najbardziej ryzykowny okres: <b>{R.history.riskMonths}</b></div>
                <div className="mt-2 grid grid-cols-7 gap-1">
                  {R.history.months.map((m) => (
                    <div key={m.name} className="rounded-lg py-2 text-center" style={{ background: `rgba(217,105,15,${0.08 + m.prob * 0.8})` }}>
                      <div className="text-[13px] font-semibold">{m.name}</div>
                      <div className="num text-[12px]">{Math.round(m.prob * 100)}%</div>
                    </div>
                  ))}
                </div>
                <Info>% lat, w których w danym miesiącu {crop.short} miała niedobór wody (szacunek).</Info>
              </div>
            </div>
            <div className="card p-5">
              <h3 className="text-[19px] font-bold">Ile wody spadło w kolejnych latach</h3>
              <div className="mt-3"><PrecipYears years={R.seasonal.precipYears} /></div>
              {(() => { const full = R.seasonal.precipYears.filter((y) => !y.partial); const m = full.reduce((a, y) => a + y.total, 0) / Math.max(1, full.length); return <p className="mt-2 text-[15px]">Średnio tu <b>{Math.round(m)} mm</b> rocznie — {m < 550 ? 'mniej niż przeciętnie w Polsce (ok. 600 mm).' : m > 700 ? 'więcej niż przeciętnie w Polsce (ok. 600 mm).' : 'mniej więcej tyle, ile przeciętnie w Polsce (ok. 600 mm).'}</p> })()}
            </div>
          </div>
        ))}

        {/* ---------- 7. Źródła ---------- */}
        {panel('zrodla', 'Źródła i dokładność', (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="card p-5">
                <h3 className="text-[19px] font-bold">Skąd dane (pobrane {res.generatedAt})</h3>
                <ul className="mt-3 space-y-2 text-[14.5px]">
                  {res.sources.map((s) => <li key={s.name}><b>{s.name}</b><br /><span className="text-muted">{s.what} · {s.license}</span></li>)}
                </ul>
              </div>
              <div className="card p-5">
                <h3 className="text-[19px] font-bold">Czego nie wiemy na pewno</h3>
                <ul className="mt-3 space-y-1.5 text-[14.5px]">
                  <li className="flex gap-2"><span>⚠️</span><span>Wszystkie wyniki to <b>szacunki z modeli</b> (FAO-56, SCS-CN, dane satelitarne i pogodowe), a nie pomiary na polu.</span></li>
                  {R.limits.map((l) => <li key={l} className="flex gap-2"><span>⚠️</span><span>{l}</span></li>)}
                </ul>
              </div>
            </div>
            {res.A && res.A.validation.rho !== null && <Proof res={res} />}
          </div>
        ))}
      </div>
    </div>
  )
}

const rank = (c: Cause) => (c.active ? (c.strength === 'silny' ? 3 : 2) : c.strength === 'słaby' ? 0 : 1)

function FactorCard({ c }: { c: Cause }) {
  const [open, setOpen] = useState(false)
  const lvl = c.pending ? null : c.active ? (c.strength === 'silny' ? { t: 'prawdopodobnie istotne', col: '#c25a0a', bg: '#fde9d9' } : { t: 'możliwy wpływ', col: '#9a7400', bg: '#fbf3d6' }) : { t: 'raczej bez wpływu', col: '#2e7d32', bg: '#e8f3e6' }
  return (
    <div className={`card p-5 ${c.active ? '' : 'opacity-75'}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[18px] font-bold leading-tight">{c.title}</h3>
        {lvl ? <Pill color={lvl.col} bg={lvl.bg}>{lvl.t}</Pill> : <Spinner />}
      </div>
      <p className="mt-2 text-[15px] leading-snug">{c.text}</p>
      {c.evidence.length > 0 && (
        <button className="no-print mt-2 text-[14px] font-semibold text-field" onClick={() => setOpen((o) => !o)}>{open ? 'Ukryj dane ▴' : 'Na podstawie jakich danych? ▾'}</button>
      )}
      {open && <ul className="mt-1.5 space-y-0.5 text-[13px] text-muted">{c.evidence.map((e) => <li key={e}>• {e}</li>)}</ul>}
    </div>
  )
}

function RecCard({ r, onMap }: { r: Rec; onMap?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card flex gap-4 p-5">
      <div className="text-[30px] leading-none">{r.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-[17.5px] font-bold leading-tight">{r.title}</h4>
          {r.priority === 1 && <Pill color="#1f4d29" bg="#e6efe0">najważniejsze</Pill>}
        </div>
        {r.effect && <p className="mt-1.5 text-[15px]"><b className="text-water">Efekt:</b> {r.effect}</p>}
        <div className="no-print mt-2 flex flex-wrap gap-3">
          <button className="text-[14px] font-semibold text-field" onClick={() => setOpen((o) => !o)}>{open ? 'Mniej ▴' : 'Dlaczego i jak? ▾'}</button>
          {onMap && <button className="text-[14px] font-semibold text-water" onClick={onMap}>Pokaż na mapie →</button>}
        </div>
        <div className={open ? 'mt-2 space-y-1.5 text-[14.5px] leading-snug' : 'print-only mt-2 space-y-1.5 text-[14.5px] leading-snug'}>
          <p>{r.why}</p>
          {r.when && <p><b className="text-field">Kiedy / jak:</b> {r.when}</p>}
        </div>
      </div>
    </div>
  )
}

function Fact({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card flex items-center gap-3 p-4 text-left transition hover:ring-2 hover:ring-field/30">
      <span className="text-[26px]">{icon}</span>
      <span><span className="block font-semibold leading-snug">{title}</span><span className="block text-[13.5px] text-muted">{sub}</span></span>
    </button>
  )
}

function TerrainUpgrade({ onUpgrade }: { onUpgrade: () => Promise<void> }) {
  const [st, setSt] = useState<'no' | 'run' | 'err'>('no')
  return (
    <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/70 px-4 py-3 text-[15px]">
      <span>Teren z europejskiego modelu 30 m (szybki). Dokładniejsze rowy i zagłębienia daje model 1 m.</span>
      <button className="btn-ghost !py-2 !text-[15px]" disabled={st === 'run'} onClick={async () => { setSt('run'); try { await onUpgrade(); setSt('no') } catch { setSt('err') } }}>
        {st === 'run' ? <><Spinner /> Pobieram model 1 m (zwykle 20–90 s)…</> : '🔍 Szczegółowy teren 1 m'}
      </button>
      {st === 'err' && <span className="text-bad">Geoportal nie odpowiedział — spróbuj później.</span>}
    </div>
  )
}

function Loading({ res, steps, elapsed }: { res: Result; steps: StepState; elapsed: number }) {
  const crop = CROPS[res.cropId]
  return (
    <div className="mx-auto max-w-xl pt-12">
      <div className="card p-7">
        <div className="text-center">
          <div className="text-[40px]">{crop.icon}</div>
          <h1 className="mt-1 text-[26px] font-bold">Sprawdzam Twoje pole…</h1>
          <p className="mt-1 text-muted">działka {res.parcel.id} · {crop.name} · {res.from ? `${fmtDate(res.from)} – ` : ''}{fmtDate(res.date)}</p>
          <div className="num mt-2 text-[15px] font-semibold text-field">{(elapsed / 1000).toFixed(0)} s</div>
        </div>
        <ul className="mt-5 space-y-2">
          {STEPS.slice(1).map((s) => {
            const st = steps[s.id]?.state
            return (
              <li key={s.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${st === 'run' ? 'bg-field-soft' : 'bg-paper'}`}>
                <span className="grid h-8 w-8 shrink-0 place-items-center text-[20px]">{st === 'ok' ? '✅' : st === 'skip' ? '⚠️' : st === 'err' ? '❌' : st === 'run' ? <Spinner size={18} /> : s.icon}</span>
                <span className="flex-1"><span className="block font-semibold">{s.title}</span><span className="block text-[13px] text-muted">{steps[s.id]?.note ?? s.src}</span></span>
              </li>
            )
          })}
        </ul>
        <p className="mt-4 text-center text-[14px] text-muted">Zwykle trwa to 10–20 sekund. Raport pojawi się w zakładkach.</p>
      </div>
    </div>
  )
}

function IrrigationCard({ res }: { res: Result }) {
  const ir = res.R!.irrigation
  const c = ir.decision === 'tak' ? '#b3261e' : ir.decision === 'przygotuj' ? '#c25a0a' : '#2e7d32'
  return (
    <div className="card mb-3 flex flex-wrap items-center gap-5 p-5" style={{ borderLeft: `6px solid ${c}` }}>
      <div className="grid h-14 w-14 place-items-center rounded-2xl text-[28px]" style={{ background: c + '18' }}>{ir.decision === 'tak' ? '🚿' : ir.decision === 'przygotuj' ? '⏳' : '✋'}</div>
      <div className="min-w-0 flex-1">
        <h4 className="text-[20px] font-bold" style={{ color: c }}>{ir.title}</h4>
        <p className="mt-1 text-[15px] leading-snug">{ir.text}</p>
      </div>
      {ir.dose && <div className="text-center"><div className="num text-[30px] font-bold" style={{ color: c }}>{ir.dose} mm</div><div className="text-[13px] text-muted">= {ir.dose * 10} m³/ha</div></div>}
    </div>
  )
}

function Proof({ res }: { res: Result }) {
  const A = res.A!
  const v = A.validation
  const imgs = useMemo(() => {
    const shade = hillshade(A)
    return { m: cropToParcel(A, drawLayer(A, 'proof', { shade, channels: false })).toDataURL(), s: cropToParcel(A, satDryCanvas(A, shade)).toDataURL() }
  }, [A])
  const good = (v.rho ?? 0) >= 0.3, weak = (v.rho ?? 0) >= 0.12
  return (
    <div className="card p-5">
      <h3 className="text-[19px] font-bold">Sprawdzian: czy model terenu trafia?</h3>
      <p className="mt-1 text-[15px] text-muted">Miejsca, które według terenu powinny wysychać najszybciej, porównane z najsuchszymi miejscami na zdjęciu satelitarnym z suszy 2018 r. ({v.drought?.date}).</p>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_1.2fr]">
        <figure><img src={imgs.m} className="h-[200px] w-full rounded-xl bg-paper object-contain" /><figcaption className="mt-1 text-center text-[13.5px] text-muted">wg terenu</figcaption></figure>
        <figure><img src={imgs.s} className="h-[200px] w-full rounded-xl bg-paper object-contain" /><figcaption className="mt-1 text-center text-[13.5px] text-muted">wg satelity (2018)</figcaption></figure>
        <div className="flex flex-col justify-center gap-2 text-[15px]">
          <div className="flex gap-3"><span className="h-4 w-4 rounded bg-[#f97316]" /> najsuchsza 1/3 pola</div>
          <div className="flex gap-3"><span className="h-4 w-4 rounded bg-[#22d3ee]" /> najwilgotniejsza 1/3 pola</div>
          <p className="mt-1">Zgodność: <b>{Math.round((v.precision ?? 0) * 100)}%</b> (przypadkiem: 33%), ρ = <b>{v.rho?.toFixed(2)}</b>.</p>
          <Pill color={good ? '#2e7d32' : weak ? '#9a7400' : '#b3261e'} bg={good ? '#e8f3e6' : weak ? '#fbf3d6' : '#fbe1de'}>{good ? 'model dobrze trafia' : weak ? 'zgodność słaba' : 'brak zgodności'}</Pill>
        </div>
      </div>
    </div>
  )
}
