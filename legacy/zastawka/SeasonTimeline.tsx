import type { FieldAnalysis } from '../lib/model'
import { shortDate } from '../lib/format'

const MONTHS = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru']

// Cały sezon jednym rzutem oka: ile wody miały rośliny „jak dziś” vs z retencją.
// Suwak = wehikuł czasu — przesuń, a cała aplikacja pokaże decyzję z tamtego dnia.
export function SeasonTimeline({ a, decision, onChange }: { a: FieldAnalysis; decision: number; onChange: (i: number) => void }) {
  const n = a.smart.length
  const W = 1000, H = 150, padB = 22
  const x = (i: number) => (i / (n - 1)) * W
  const y = (s: { taw: number; dr: number }) => 8 + (1 - (s.taw - s.dr) / s.taw) * (H - padB - 16)
  const line = (arr: typeof a.smart) => arr.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(s).toFixed(1)}`).join(' ')
  const smartPath = line(a.smart)
  const area = `${smartPath} L${W} ${H - padB} L0 ${H - padB} Z`
  const thrY = 8 + (a.pm.raw / a.pm.taw) * (H - padB - 16)
  const maxP = 40

  const monthTicks: { i: number; m: number }[] = []
  a.smart.forEach((s, i) => {
    if (s.date.endsWith('-01')) monthTicks.push({ i, m: Number(s.date.slice(5, 7)) - 1 })
  })

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[150px] w-full">
        <defs>
          <linearGradient id="tlA" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#22d3ee" stopOpacity="0.35" />
            <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* sezon uprawy */}
        {(() => {
          const s = a.smart.findIndex((d) => d.inSeason)
          const e = a.smart.length - 1 - [...a.smart].reverse().findIndex((d) => d.inSeason)
          return s >= 0 ? <rect x={x(s)} y={0} width={x(e) - x(s)} height={H - padB} fill="#34d399" opacity="0.04" /> : null
        })()}
        {/* stres */}
        {a.base.map((s, i) => (s.inSeason && s.ks < 0.98 ? <rect key={i} x={x(i)} y={H - padB - 4} width={W / n + 0.5} height={4} fill="#f43f5e" opacity="0.8" /> : null))}
        {a.smart.map((s, i) => (s.inSeason && s.ks < 0.98 ? <rect key={'s' + i} x={x(i)} y={H - padB} width={W / n + 0.5} height={3} fill="#fbbf24" opacity="0.9" /> : null))}
        {/* opady */}
        {a.smart.map((s, i) => (s.p > 0.5 ? <rect key={'p' + i} x={x(i)} y={H - padB - 4 - Math.min(1, s.p / maxP) * 50} width={Math.max(1.5, W / n - 0.6)} height={Math.min(1, s.p / maxP) * 50} fill="#38bdf8" opacity="0.28" /> : null))}
        <line x1={0} x2={W} y1={thrY} y2={thrY} stroke="#fbbf24" strokeDasharray="6 6" strokeOpacity="0.6" vectorEffect="non-scaling-stroke" />
        <path d={area} fill="url(#tlA)" />
        <path d={line(a.base)} fill="none" stroke="#f43f5e" strokeWidth="1.6" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        <path d={smartPath} fill="none" stroke="#22d3ee" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
        {a.smart.map((s, i) => (s.forecast ? <rect key={'f' + i} x={x(i)} y={0} width={W / n + 0.5} height={H - padB} fill="#fff" opacity="0.035" /> : null))}
        <line x1={x(decision)} x2={x(decision)} y1={0} y2={H - padB} stroke="#e2e8f0" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {monthTicks.map((t) => (
          <text key={t.i} x={x(t.i) + 4} y={H - 6} fontSize="11" fill="#64748b" fontFamily="Inter">
            {MONTHS[t.m]}
          </text>
        ))}
      </svg>
      <div className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-ink-950" style={{ left: `${(decision / (n - 1)) * 100}%` }}>
        {shortDate(a.smart[decision].date)}
      </div>
      <div
        className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-ink-950 bg-water shadow-[0_0_0_2px_#22d3ee,0_0_18px_#22d3ee]"
        style={{ left: `${(decision / (n - 1)) * 100}%`, top: `${y(a.smart[decision])}px` }}
      />
      <input
        type="range"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        min={1}
        max={n - 1}
        value={decision}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Dzień decyzji"
      />
    </div>
  )
}
