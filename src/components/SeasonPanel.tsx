import type { Result } from '../geo/loader'
import { polygonArea } from '../geo/analyze'
import { Info, Pill } from './ui'

const r0 = (v: number) => Math.round(v).toLocaleString('pl-PL')
const DOW = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb']
const GW = [
  { c: '#2e7d32', bg: '#e8f3e6' },
  { c: '#9a7400', bg: '#fbf3d6' },
  { c: '#c25a0a', bg: '#fde9d9' },
  { c: '#b3261e', bg: '#fbe1de' },
]

/** Pogoda i przymrozki · zima i roztopy · studnie i wody podziemne */
export function SeasonPanel({ res }: { res: Result }) {
  const S = res.R!.seasonal
  const ha = polygonArea(res.parcel.ring) / 1e4
  const W = S.winter, G = S.groundwater, F = S.frost
  const maxT = Math.max(...F.days.map((d) => d.tmax), 5), minT = Math.min(...F.days.map((d) => d.tmin), -2)
  const y = (t: number) => ((maxT - t) / (maxT - minT)) * 100
  const gw = GW[G.sev]

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      {/* pogoda i przymrozki */}
      <div className="card p-5 xl:col-span-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[20px] font-bold">🌡️ Pogoda: 14 dni wstecz{F.days.some((d) => d.forecast) ? ' i prognoza na 7 dni' : ''}</h3>
          <Pill color={F.next ? (F.sensitive ? '#b3261e' : '#1f6fa8') : '#2e7d32'} bg={F.next ? (F.sensitive ? '#fbe1de' : '#e3eff8') : '#e8f3e6'}>
            {F.next ? `❄️ przymrozek ${F.next.date.slice(8)}.${F.next.date.slice(5, 7)}` : F.days.some((d) => d.forecast) ? 'bez przymrozków w prognozie' : `${F.days.filter((d) => d.tmin <= 0).length} dni z przymrozkiem`}
          </Pill>
        </div>
        <p className="mt-1 text-[15.5px]">{F.text}</p>
        <div className="mt-4 overflow-x-auto">
          <div className="flex min-w-[720px] gap-1">
            {F.days.map((d) => {
              const frost = d.tmin <= 0
              const dt = new Date(d.date + 'T12:00:00')
              return (
                <div key={d.date} className={`flex-1 rounded-lg px-1 pb-1.5 pt-1 text-center ${d.forecast ? 'bg-water-soft' : d.date === res.date ? 'bg-field-soft ring-2 ring-field' : 'bg-paper'}`}>
                  <div className="text-[11.5px] font-semibold text-muted">{DOW[dt.getDay()]}</div>
                  <div className="text-[12.5px] font-bold">{Number(d.date.slice(8))}.{d.date.slice(5, 7)}</div>
                  <div className="relative mx-auto mt-1 h-16 w-3">
                    <div className="absolute inset-x-0 rounded-full" style={{ top: `${y(d.tmax)}%`, bottom: `${100 - y(d.tmin)}%`, background: frost ? 'linear-gradient(#f59e0b,#38bdf8)' : 'linear-gradient(#f59e0b,#fcd34d)' }} />
                  </div>
                  <div className="num text-[12px] font-semibold text-warn">{Math.round(d.tmax)}°</div>
                  <div className={`num text-[12px] font-bold ${frost ? 'text-water' : 'text-muted'}`}>{frost ? '❄' : ''}{Math.round(d.tmin)}°</div>
                  <div className="num mt-0.5 text-[11.5px] text-water">{d.rain >= 0.5 ? `${d.rain.toFixed(0)} mm` : '·'}</div>
                  {d.snowCm >= 0.5 && <div className="num text-[11px] font-semibold text-[#5b7fa8]">🌨 {d.snowCm.toFixed(0)} cm</div>}
                </div>
              )
            })}
          </div>
        </div>
        <Info>{F.days.some((d) => d.forecast) ? 'Niebieskie tło — prognoza (Open-Meteo). ' : ''}Zielona ramka — dzień analizy. ❄ — przymrozek (temperatura minimalna ≤ 0°C na 2 m; przy gruncie bywa o 2–4°C zimniej).</Info>
      </div>

      {/* zima i roztopy */}
      <div className="card p-5">
        <h3 className="text-[20px] font-bold">❄️ Śnieg i roztopy — {W.label}{W.partial ? ' (do dnia analizy)' : ''}</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Stat label="spadło śniegu" value={`${r0(W.snowCm)} cm`} norm={`zwykle ${r0(W.snowCmNorm)} cm`} low={W.snowCm < 0.6 * W.snowCmNorm} />
          <Stat label="dni z pokrywą" value={`${W.coverDays}`} norm={`zwykle ${r0(W.coverDaysNorm)}`} low={W.coverDays < 0.6 * W.coverDaysNorm} />
          <Stat label="woda z roztopów" value={`${r0(W.meltMm)} mm`} norm={`= ${r0(W.meltMm * 10 * ha)} m³ na działce`} />
          <Stat label="teraz w śniegu" value={`${r0(W.sweNow)} mm`} norm={W.meltNext ? `roztopy w 7 dni: ${r0(W.meltNext)} mm` : W.sweNow > 1 ? 'woda czeka na roztopy' : 'brak pokrywy'} />
        </div>
        <p className="mt-3 text-[15px] leading-snug">
          {W.poor ? 'Zima była uboga w śnieg — wiosną gleba i studnie dostaną mniej wody. Warto od początku sezonu oszczędzać wilgoć (mulcz, mniej uprawek).'
            : W.rich ? 'Śnieżna zima — dużo wody z roztopów. Zamknij zastawki i dreny przed odwilżą, żeby jej nie stracić.'
              : 'Śnieg to też woda: roztopy zasilają glebę i wody gruntowe przed sezonem. Na zamarzniętej glebie spływają rowami, jeśli ich nie zatrzymamy.'}
        </p>
        <Info>Model śniegu metodą stopniodni na danych ERA5 (opad śniegu i temperatura dobowa).</Info>
      </div>

      {/* studnie */}
      <div className="card p-5 xl:col-span-2" style={{ borderLeft: `6px solid ${gw.c}` }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[20px] font-bold">🪣 Studnie i wody podziemne</h3>
          <Pill color={gw.c} bg={gw.bg}>{G.title.replace('Wody podziemne: ', '')}</Pill>
        </div>
        <p className="mt-2 text-[15px] leading-snug">{G.why}</p>
        {res.gzwp && res.gzwp.length > 0 && (
          <p className="mt-2 rounded-xl bg-water-soft px-3 py-2 text-[15px]">
            💧 Pod polem: <b>{res.gzwp.map((g) => `${g.kind.replace(' udokumentowane', '').replace(' nieudokumentowane', ' (nieudokumentowany)')} nr ${g.nr}${g.name ? ` „${g.name}”` : ''}`).join(', ')}</b>.
            To rezerwa wody pitnej dla regionu — oszczędny pobór i ostrożność z nawozami oraz środkami ochrony roślin.
          </p>
        )}
        <ul className="mt-3 space-y-1.5 text-[15px]">
          {G.advice.map((a) => <li key={a} className="flex gap-2"><span>•</span><span>{a}</span></li>)}
        </ul>
        <Info>Pomiary poziomu wody w studniach monitoringu PIG-PIB nie są publicznie dostępne, dlatego to wskaźnik pośredni: bilans wodny z 12 miesięcy, wilgotność warstwy 1–2,5 m (ERA5-Land) i zasilanie zimowe na tle 10 lat. Zbiorniki: PIG-PIB (GZWP/LZWP).</Info>
      </div>
    </div>
  )
}

function Stat({ label, value, norm, low }: { label: string; value: string; norm: string; low?: boolean }) {
  return (
    <div className="rounded-xl bg-paper p-3">
      <div className="text-[13px] text-muted">{label}</div>
      <div className={`num text-[22px] font-bold ${low ? 'text-warn' : 'text-ink'}`}>{value}</div>
      <div className="text-[12.5px] text-muted">{norm}</div>
    </div>
  )
}
