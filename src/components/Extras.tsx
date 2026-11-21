import type { Assessment, PeriodSummary } from '../geo/assess'
import { Info, Pill } from './ui'

const r0 = (v: number) => Math.round(v).toLocaleString('pl-PL')
const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })

/** Podsumowanie wybranego okresu (od–do) na tle 10 wcześniejszych lat */
export function PeriodPanel({ P, areaHa }: { P: PeriodSummary; areaHa: number }) {
  const n = P.norm
  const tiles: [string, string, string, boolean?][] = [
    ['opad', `${r0(P.p)} mm`, n ? `zwykle ${r0(n.p)} mm · mniej padało w ${n.drierP} z ${n.n} lat` : `średnio ${r0(P.p / Math.max(1, P.days / 365))} mm/rok`, n ? P.p < 0.8 * n.p : false],
    ['opad − parowanie', `${P.kbw > 0 ? '+' : ''}${r0(P.kbw)} mm`, n ? `zwykle ${n.kbw > 0 ? '+' : ''}${r0(n.kbw)} mm · bardziej sucho było w ${n.drierKbw} z ${n.n} lat` : `parowanie ${r0(P.et0)} mm`, n ? P.kbw < n.kbw - 30 : P.kbw < 0],
    ['dni stresu wodnego uprawy', `${P.stressDays}`, P.seasonDays ? `z ${P.seasonDays} dni wegetacji w tym okresie` : 'uprawa poza sezonem w tym okresie', P.stressDays > 10],
    ['zabrakło wody roślinom', `${r0(P.deficit)} mm`, `= ${r0(P.deficit * 10 * areaHa)} m³ na działce (potrzeba nawadniania)`, P.deficit > 30],
    ['spłynęło z pola', `${r0(P.runoffMm)} mm`, `= ${r0(P.runoffMm * 10 * areaHa)} m³ — woda do zatrzymania`],
    ['najdłużej bez deszczu', `${P.longestDry} dni`, `przymrozki: ${P.frostDays} dni · upały ≥ 30°C: ${P.hotDays} dni${P.snowCm >= 1 ? ` · śnieg: ${r0(P.snowCm)} cm` : ''}`],
  ]
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(([l, v, d, warn]) => (
          <div key={l} className="card p-4">
            <div className="text-[14px] text-muted">{l}</div>
            <div className={`num text-[28px] font-bold ${warn ? 'text-warn' : 'text-ink'}`}>{v}</div>
            <div className="text-[13.5px] leading-snug text-muted">{d}</div>
          </div>
        ))}
      </div>
      {P.years.length > 1 && (
        <div className="card overflow-x-auto p-5">
          <h3 className="text-[19px] font-bold">Rok po roku w wybranym okresie</h3>
          <table className="mt-3 w-full min-w-[520px] text-[15px]">
            <thead className="text-left text-[13px] text-muted"><tr><th className="py-1.5">rok</th><th>opad</th><th>opad − parowanie</th><th>dni stresu uprawy</th><th /></tr></thead>
            <tbody>
              {P.years.map((y) => (
                <tr key={y.year} className="border-t border-line">
                  <td className="py-2 font-semibold">{y.year}</td>
                  <td className="num">{r0(y.p)} mm</td>
                  <td className="num">{y.kbw > 0 ? '+' : ''}{r0(y.kbw)} mm</td>
                  <td className="num">{y.stress}</td>
                  <td>{y.drought && <Pill color="#c25a0a" bg="#fde9d9">rok suchy</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Info>Pierwszy i ostatni rok liczone tylko w granicach wybranego okresu.</Info>
        </div>
      )}
      <Info>Okres {fmt(P.from)} – {fmt(P.to)} ({P.days} dni). {n ? `Porównanie z tym samym okresem w ${n.n} wcześniejszych latach.` : 'Okres dłuższy niż rok — porównanie rok po roku.'}</Info>
    </div>
  )
}

/** Która uprawa najlepiej pasuje do wody na tej działce */
export function CropRank({ R }: { R: Assessment }) {
  const best = R.cropRank[0]
  return (
    <div className="card p-5">
      <h3 className="text-[19px] font-bold">Która uprawa najlepiej pasuje do wody na tej działce?</h3>
      <Info>Ta sama gleba, teren i pogoda z ostatnich {R.history.rows.length} lat — symulacja dla każdej uprawy bez nawadniania. Plon pokazany jako % plonu możliwego przy pełnym zaopatrzeniu w wodę.</Info>
      <div className="mt-3 space-y-2">
        {R.cropRank.map((c) => (
          <div key={c.id} className={`grid grid-cols-[1.6fr_2fr_auto_auto] items-center gap-3 rounded-xl px-3 py-2 ${c.chosen ? 'bg-field-soft ring-2 ring-field' : 'bg-paper'}`}>
            <span className="font-semibold">{c.icon} {c.name}{c.chosen && <span className="ml-2 text-[13px] text-field-dark">(Twoja)</span>}</span>
            <div className="h-3 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full" style={{ width: `${c.yieldPct}%`, background: c.yieldPct >= 90 ? '#2e7d32' : c.yieldPct >= 80 ? '#b88a00' : '#c25a0a' }} />
            </div>
            <span className="num w-14 text-right font-bold">{c.yieldPct}%</span>
            <span className="w-60 text-right text-[13.5px] text-muted">susza: {c.droughtYears}/{R.history.rows.length} lat · nawadnianie {c.irrigMm} mm</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[15px]">Najlepiej do zasobów wody tej działki pasuje: <b>{best.icon} {best.name}</b> ({best.yieldPct}% plonu możliwego bez nawadniania).</p>
    </div>
  )
}
