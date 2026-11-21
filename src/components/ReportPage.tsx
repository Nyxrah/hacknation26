import { useMemo, useState } from 'react'
import { quickClimate, type FarmerInput, type Rec } from '../geo/assess'
import { CROPS } from '../geo/crops'
import { STEPS, type Result, type StepId } from '../geo/loader'
import { polygonArea } from '../geo/analyze'
import { cropToParcel, drawLayer, hillshade, satDryCanvas } from '../geo/render'
import { HistoryChart, PrecipYears, SeasonChart, SeasonsKbw } from './Charts'
import { SeasonPanel } from './SeasonPanel'
import { FieldView } from './FieldView'
import { Info, Pill, Section, Skeleton, Spinner, sevOf } from './ui'
import { RefinePanel } from './RefinePanel'

export type StepState = Partial<Record<StepId, { state: 'run' | 'ok' | 'skip' | 'err'; note?: string }>>

const r0 = (v: number) => Math.round(v).toLocaleString('pl-PL')
const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
const GROUPS: { id: Rec['group']; title: string; sub: string; icon: string }[] = [
  { id: 'retencja', title: 'Zatrzymaj wodę w krajobrazie', sub: 'najpierw nie pozwól, by deszcz uciekał z pola', icon: '💧' },
  { id: 'agrotechnika', title: 'Uprawa, która oszczędza wodę', sub: 'zabiegi zwiększające retencję w glebie i ograniczające parowanie', icon: '🚜' },
  { id: 'nawadnianie', title: 'Nawadnianie i woda w gospodarstwie', sub: 'nawadniać dopiero, gdy zabraknie wody mimo retencji; studnię oszczędzać', icon: '🚿' },
]

export function ReportPage({ res, steps, elapsed, onRefine }: { res: Result; steps: StepState; elapsed: number; onRefine: (f: FarmerInput) => void }) {
  const R = res.R
  const crop = CROPS[res.cropId]
  const quick = useMemo(() => (res.weather ? quickClimate(res.weather, res.date) : null), [res.weather, res.date])
  const [focus, setFocus] = useState<Int32Array | null>(null)

  return (
    <div className="pb-20">
      {/* nagłówek raportu */}
      <div className="pt-6">
        <div className="eyebrow">Raport wodny działki · {fmtDate(res.date)}</div>
        <h1 className="mt-2 text-[30px] font-bold leading-tight md:text-[38px]">
          {crop.icon} {crop.name} · działka {res.parcel.id}
        </h1>
        <div className="mt-1 text-[16px] text-muted">
          {res.parcel.voivodeship}, pow. {res.parcel.county?.replace('powiat ', '')}, gm. {res.parcel.commune}, obręb {res.parcel.region} · {(polygonArea(res.parcel.ring) / 1e4).toFixed(2)} ha
        </div>
      </div>

      {/* postęp */}
      {!res.done && (
        <div className="no-print card mt-5 p-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="flex items-center gap-2 font-semibold text-field"><Spinner /> Sprawdzam pole… {(elapsed / 1000).toFixed(0)} s</span>
            {STEPS.slice(1).map((s) => {
              const st = steps[s.id]?.state
              return (
                <span key={s.id} className={`flex items-center gap-1.5 text-[14.5px] ${st === 'ok' ? 'text-field-dark' : st === 'skip' || st === 'err' ? 'text-warn' : 'text-muted'}`}>
                  {st === 'ok' ? '✅' : st === 'skip' ? '⚠️' : st === 'err' ? '❌' : st === 'run' ? <Spinner size={13} /> : '○'} {s.title}
                </span>
              )
            })}
          </div>
        </div>
      )}
      {res.done && (
        <div className="no-print mt-4 text-[14px] text-muted">✅ Raport policzony w {res.seconds.toFixed(0)} s z danych pobranych na żywo {res.generatedAt}.{!res.demFine && ' Teren przybliżony (30 m) — szczegółowy model 1 m dociągnie się w tle.'}</div>
      )}

      {/* 1. stan wody */}
      <Section n="1" id="stan" title="Ile wody ma teraz pole?">
        {R ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
            <div className="card appear p-6" style={{ borderColor: sevOf(R.status.sev).color, borderWidth: 2 }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Pill color={sevOf(R.status.sev).color} bg={sevOf(R.status.sev).bg}>{sevOf(R.status.sev).icon} {R.status.title}</Pill>
                <span className="text-[14px] text-muted">pewność oceny: <b className="text-ink">{R.status.confidence}</b></span>
              </div>
              <p className="mt-4 text-[20px] leading-snug text-ink">{R.status.text}</p>
              {R.active && (
                <div className="mt-5">
                  <div className="flex justify-between text-[14px] text-muted"><span>woda dostępna dla roślin w strefie korzeni</span><b className="num text-ink">{R.current.availPct}%</b></div>
                  <div className="relative mt-1.5 h-5 overflow-hidden rounded-full bg-paper">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${R.current.availPct}%`, background: sevOf(R.indicators[0].sev ?? 0).color }} />
                    <div className="absolute inset-y-0 border-l-2 border-dashed border-ink/60" style={{ left: `${100 - Math.round(crop.p * 100)}%` }} />
                  </div>
                  <div className="mt-1 text-[13px] text-muted">linia przerywana — poniżej rośliny zaczynają cierpieć ({crop.short})</div>
                </div>
              )}
              <Info>Dlaczego taka pewność: {R.status.confidenceWhy}.</Info>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {R.indicators.map((i) => {
                const s = sevOf(i.sev)
                return (
                  <div key={i.key} className="card appear flex items-center gap-4 p-4">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[24px]" style={{ background: s.bg }}>{i.key === 'gleba' ? '🌱' : i.key === 'klimat' ? '🌦️' : i.key === 'wilgotnosc' ? '💧' : '🛰️'}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold">{i.label}</span>
                        <span className="num text-[20px] font-bold" style={{ color: s.color }}>{i.value}</span>
                      </div>
                      <div className="text-[14px] leading-snug text-muted">{i.detail}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : quick ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
            <div className="card appear p-6">
              <div className="eyebrow">Pierwsze dane: pogoda</div>
              <p className="mt-3 text-[20px] leading-snug">
                W ostatnich 30 dniach spadło <b>{r0(quick.p30)} mm</b> deszczu (zwykle {r0(quick.p30norm)} mm). Bilans opad − parowanie: <b>{quick.kbw30 > 0 ? '+' : ''}{r0(quick.kbw30)} mm</b> —
                {quick.drier === 0 ? ' najsuchszy taki okres od 10 lat.' : ` bardziej sucho było w ${quick.drier} z ${quick.n} lat.`}
              </p>
              <div className="mt-4"><SeasonsKbw seasons={quick.seasons} /></div>
              <Info>Słupki: bilans opad − parowanie od kwietnia do września w kolejnych latach (pomarańczowe — sezony bardzo suche).</Info>
            </div>
            <Skeleton h={280} label="Sprawdzam glebę i liczę zapas wody…" />
          </div>
        ) : <Skeleton h={260} label="Pobieram pogodę z 10 lat…" />}
        {R && <RefinePanel value={res.farmer} onChange={onRefine} disabled={!res.done} soilFromData={res.soil?.source === 'rolnik' ? 'podana przez Ciebie' : (res.soil?.texture ?? '—')} />}
        {(res.farmer.drainage !== 'nie wiem' || res.farmer.soil || res.farmer.rain7 !== null || res.farmer.tillage !== 'nie wiem' || res.farmer.trees !== 'nie wiem') && (
          <p className="mt-3 text-[14.5px]"><b>Dane podane przez rolnika:</b> drenaż — {res.farmer.drainage}{res.farmer.soil ? `; gleba — ${res.farmer.soil}` : ''}{res.farmer.rain7 !== null ? `; opad z 7 dni — ${res.farmer.rain7} mm` : ''}{res.farmer.tillage !== 'nie wiem' ? `; uprawa — ${res.farmer.tillage}` : ''}{res.farmer.trees !== 'nie wiem' ? `; wierzby/topole przy polu — ${res.farmer.trees}` : ''}.</p>
        )}
      </Section>

      {/* 2. przyczyny */}
      <Section n="2" id="przyczyny" title="Skąd się bierze problem?" sub="Ten sam objaw na polu może mieć różne przyczyny — od nich zależy, co pomoże.">
        {R ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[...R.causes].sort((a, b) => Number(b.active) - Number(a.active)).map((c) => (
              <div key={c.id} className={`card appear p-5 ${c.active ? '' : 'opacity-70'}`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[19px] font-bold leading-tight">{c.title}</h3>
                  {c.pending ? <Spinner /> : <Pill color={c.active ? '#c25a0a' : '#2e7d32'} bg={c.active ? '#fde9d9' : '#e8f3e6'}>{c.active ? (c.strength === 'silny' ? 'główna przyczyna' : 'ma wpływ') : 'nie dotyczy'}</Pill>}
                </div>
                <p className="mt-2 text-[15.5px] leading-snug">{c.text}</p>
                {c.evidence.length > 0 && <ul className="mt-3 space-y-0.5 text-[13px] text-muted">{c.evidence.map((e) => <li key={e}>• {e}</li>)}</ul>}
              </div>
            ))}
          </div>
        ) : <Skeleton h={200} label="Czekam na dane o glebie…" />}
      </Section>

      {/* 3. co robić */}
      <Section n="3" id="zalecenia" title="Co zrobić?" sub="Kolejność ma znaczenie: najpierw zatrzymać wodę, potem ją oszczędzać, na końcu — jeśli trzeba — nawadniać.">
        {R ? (
          <div className="space-y-6">
            {GROUPS.map((g) => {
              const list = R.recs.filter((r) => r.group === g.id)
              const pendingTerrain = g.id === 'retencja' && !res.A
              if (!list.length && !pendingTerrain && g.id !== 'nawadnianie') return null
              return (
                <div key={g.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[24px]">{g.icon}</span>
                    <h3 className="text-[21px] font-bold">{g.title}</h3>
                    <span className="hidden text-[14.5px] text-muted md:inline">— {g.sub}</span>
                  </div>
                  {pendingTerrain && <Skeleton h={110} label="Szukam na mapie miejsc, gdzie można zatrzymać wodę…" />}
                  {g.id === 'nawadnianie' && <IrrigationCard res={res} />}
                  <div className="grid gap-3 md:grid-cols-2">
                    {list.filter((r) => r.icon !== '🚿').map((r) => (
                      <div key={r.title} className="card appear flex gap-4 p-5">
                        <div className="text-[30px] leading-none">{r.icon}</div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-[18px] font-bold leading-tight">{r.title}</h4>
                            {r.priority === 1 && <Pill color="#1f4d29" bg="#e6efe0">najważniejsze</Pill>}
                          </div>
                          <p className="mt-1.5 text-[15.5px] leading-snug">{r.why}</p>
                          {r.effect && <p className="mt-2 text-[14.5px]"><b className="text-water">Efekt:</b> {r.effect}</p>}
                          {r.when && <p className="mt-1 text-[14.5px]"><b className="text-field">Kiedy / jak:</b> {r.when}</p>}
                          {g.id === 'retencja' && res.A && ['🚧', '💧', '🌳'].includes(r.icon) && (
                            <button className="no-print mt-2 text-[14px] font-semibold text-field underline" onClick={() => {
                              const iv = res.A!.interventions.find((x) => (r.icon === '🚧' && x.kind === 'zastawka') || (r.icon === '💧' && x.kind === 'oczko') || (r.icon === '🌳' && x.kind === 'zadrzewienie'))
                              setFocus(iv?.cells ?? null)
                              document.getElementById('mapa')?.scrollIntoView({ behavior: 'smooth' })
                            }}>Pokaż na mapie pola →</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : <Skeleton h={220} label="Zalecenia pojawią się po ocenie stanu wody…" />}
      </Section>

      {/* 4. pogoda, śnieg, studnie */}
      <Section n="4" id="zapas" title="Pogoda, przymrozki, śnieg i studnie" sub="Woda to nie tylko deszcz: śnieg z zimy zasila glebę, a studnie czerpią z wód podziemnych, które też mają gorsze lata.">
        {R ? <SeasonPanel res={res} /> : <Skeleton h={260} label="Liczę zimę, roztopy i stan wód podziemnych…" />}
      </Section>

      {/* 5. mapa */}
      <Section n="5" id="mapa" title="Twoje pole: którędy ucieka woda" sub="Żółte pola na mapie to proponowane miejsca retencji (po kliknięciu „Pokaż na mapie pola”).">
        {res.A && res.soil ? <FieldView A={res.A} hsg={res.soil.hsg} highlight={focus} /> : <Skeleton h={420} label="Pobieram ukształtowanie terenu z Geoportalu…" />}
      </Section>

      {/* 5. historia */}
      <Section n="6" id="historia" title="Jak było w ostatnich 10 latach" sub={`Symulacja bilansu wody dla uprawy ${crop.short} na tej glebie, rok po roku, na podstawie pogody z danego roku.`}>
        {R ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="text-[19px] font-bold">Susza w okresie krytycznym: {R.history.droughtYears} z {R.history.rows.length} lat</h3>
              <Info>Dni, w których {crop.short} miała za mało wody w okresie „{crop.criticalName}”. Pomarańczowe — lata z wyraźną suszą.</Info>
              <div className="mt-3"><HistoryChart R={R} /></div>
            </div>
            <div className="card p-5">
              <h3 className="text-[19px] font-bold">{R.active ? 'Zapas wody w glebie w tym sezonie' : 'Opad minus parowanie w kolejnych sezonach'}</h3>
              {R.active && R.series.length > 0 ? (<><Info>Linia przerywana po dniu analizy — prognoza na 7 dni (tylko dla dnia bieżącego).</Info><div className="mt-3"><SeasonChart R={R} /></div></>)
                : quick && (<><Info>Bilans kwiecień–wrzesień; pomarańczowe — sezony bardzo suche, niebieski — sezon analizowany.</Info><div className="mt-3"><SeasonsKbw seasons={quick.seasons} /></div></>)}
              <div className="mt-4">
                <div className="text-[15px]">Najczęściej brakuje wody: <b>{R.history.riskMonths}</b></div>
                <div className="mt-2 grid grid-cols-7 gap-1">
                  {R.history.months.map((m) => (
                    <div key={m.name} className="rounded-lg py-2 text-center" style={{ background: `rgba(217,105,15,${0.08 + m.prob * 0.8})` }}>
                      <div className="text-[13px] font-semibold">{m.name}</div>
                      <div className="num text-[12px] text-ink/80">{Math.round(m.prob * 100)}%</div>
                    </div>
                  ))}
                </div>
                <Info>Procent lat, w których w danym miesiącu wystąpił niedobór wody dla tej uprawy.</Info>
              </div>
            </div>
          </div>
        ) : <Skeleton h={240} />}
        {R && (
          <div className="card mt-5 p-5">
            <h3 className="text-[19px] font-bold">Ile wody spadło w kolejnych latach (deszcz + śnieg)</h3>
            <Info>Lata hydrologiczne: od listopada do października. Ciemne — deszcz, jasne — woda ze śniegu. Ostatni słupek: do dnia analizy.</Info>
            <div className="mt-3"><PrecipYears years={R.seasonal.precipYears} /></div>
          </div>
        )}
      </Section>

      {/* 6. dane i ograniczenia */}
      <Section n="7" id="dane" title="Skąd te dane i czego nie wiemy">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="card p-5">
            <h3 className="text-[19px] font-bold">Źródła danych (pobrane {res.generatedAt})</h3>
            <ul className="mt-3 space-y-2.5 text-[14.5px]">
              {res.sources.map((s) => (
                <li key={s.name}><b>{s.name}</b><br /><span className="text-muted">{s.what} · licencja: {s.license}</span></li>
              ))}
            </ul>
          </div>
          <div className="card p-5">
            <h3 className="text-[19px] font-bold">Czego nie wiemy na pewno</h3>
            <ul className="mt-3 space-y-1.5 text-[14.5px]">
              {(R?.limits ?? res.missing).map((l) => <li key={l} className="flex gap-2"><span>⚠️</span><span>{l}</span></li>)}
            </ul>
            {R && <p className="mt-3 text-[14.5px]"><b>Satelita:</b> {R.sat.note}</p>}
          </div>
        </div>
        {res.A && res.A.validation.rho !== null && <Proof res={res} />}
      </Section>
    </div>
  )
}

function IrrigationCard({ res }: { res: Result }) {
  const ir = res.R!.irrigation
  const c = ir.decision === 'tak' ? '#b3261e' : ir.decision === 'przygotuj' ? '#c25a0a' : '#2e7d32'
  return (
    <div className="card appear mb-3 flex flex-wrap items-center gap-5 p-5" style={{ borderLeft: `6px solid ${c}` }}>
      <div className="grid h-16 w-16 place-items-center rounded-2xl text-[30px]" style={{ background: c + '18' }}>{ir.decision === 'tak' ? '🚿' : ir.decision === 'przygotuj' ? '⏳' : '✋'}</div>
      <div className="min-w-0 flex-1">
        <h4 className="text-[21px] font-bold" style={{ color: c }}>{ir.title}</h4>
        <p className="mt-1 text-[15.5px] leading-snug">{ir.text}</p>
      </div>
      {ir.dose && <div className="text-center"><div className="num text-[34px] font-bold" style={{ color: c }}>{ir.dose} mm</div><div className="text-[13px] text-muted">= {ir.dose * 10} m³/ha</div></div>}
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
    <div className="card mt-5 p-5">
      <h3 className="text-[19px] font-bold">Sprawdzian: czy model terenu trafia?</h3>
      <p className="mt-1 text-[15px] text-muted">Porównujemy dwa niezależne źródła: miejsca, które według ukształtowania terenu powinny wysychać najszybciej, i miejsca, które naprawdę były najsuchsze na zdjęciu satelitarnym z suszy 2018 r. ({v.drought?.date}).</p>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_1.2fr]">
        <figure><img src={imgs.m} className="h-[220px] w-full rounded-xl bg-paper object-contain" /><figcaption className="mt-1 text-center text-[13.5px] text-muted">wg ukształtowania terenu</figcaption></figure>
        <figure><img src={imgs.s} className="h-[220px] w-full rounded-xl bg-paper object-contain" /><figcaption className="mt-1 text-center text-[13.5px] text-muted">wg satelity (susza 2018)</figcaption></figure>
        <div className="flex flex-col justify-center gap-2 text-[15px]">
          <div className="flex gap-3"><span className="h-4 w-4 rounded bg-[#f97316]" /> najsuchsza 1/3 pola</div>
          <div className="flex gap-3"><span className="h-4 w-4 rounded bg-[#22d3ee]" /> najwilgotniejsza 1/3 pola</div>
          <p className="mt-2">Zgodność: <b>{Math.round((v.precision ?? 0) * 100)}%</b> trafień najsuchszych miejsc (przypadkiem: 33%), korelacja ρ = <b>{v.rho?.toFixed(2)}</b>.</p>
          <Pill color={good ? '#2e7d32' : weak ? '#9a7400' : '#b3261e'} bg={good ? '#e8f3e6' : weak ? '#fbf3d6' : '#fbe1de'}>{good ? 'model trafia' : weak ? 'zgodność słaba' : 'brak zgodności — o wilgotności decyduje tu coś innego niż teren'}</Pill>
        </div>
      </div>
    </div>
  )
}
