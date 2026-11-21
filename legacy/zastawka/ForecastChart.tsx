import { Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { FieldAnalysis } from '../lib/model'
import { shortDate } from '../lib/format'

interface Row {
  date: string
  rain: number
  hist?: number
  open?: number
  smart?: number
}

export function ForecastChart({ a, decision, back = 21 }: { a: FieldAnalysis; decision: number; back?: number }) {
  const pct = (taw: number, dr: number) => Math.round(((taw - dr) / taw) * 100)
  const rows: Row[] = []
  const start = Math.max(0, decision - back)
  for (let i = start; i < decision; i++) {
    const s = a.smart[i]
    rows.push({ date: s.date, rain: s.p, hist: pct(s.taw, s.dr) })
  }
  // punkt łączący historię z gałęziami
  if (rows.length) {
    const last = rows[rows.length - 1]
    last.open = last.hist
    last.smart = last.hist
  }
  a.branchSmart.forEach((s, k) => {
    const o = a.branchOpen[k]
    rows.push({ date: s.date, rain: s.p, open: pct(o.taw, o.dr), smart: pct(s.taw, s.dr) })
  })
  const thr = Math.round(((a.pm.taw - a.pm.raw) / a.pm.taw) * 100)
  const today = a.branchSmart[0]?.date

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 22, right: 4, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="gSmart" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#22d3ee" stopOpacity={0.5} />
              <stop offset="1" stopColor="#22d3ee" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <ReferenceArea y1={0} y2={thr} fill="#f43f5e" fillOpacity={0.06} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis yAxisId="w" domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
          <YAxis yAxisId="r" orientation="right" domain={[0, 60]} hide />
          <Tooltip
            contentStyle={{ background: '#081621', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
            labelFormatter={(l) => shortDate(String(l))}
            formatter={(v, n) => [n === 'Opad' ? `${v} mm` : `${v}%`, n]}
          />
          <Bar yAxisId="r" dataKey="rain" name="Opad" fill="#38bdf8" opacity={0.35} radius={[3, 3, 0, 0]} barSize={8} />
          <ReferenceLine yAxisId="w" y={thr} stroke="#fbbf24" strokeDasharray="5 5" label={{ value: 'próg stresu', fill: '#fbbf24', fontSize: 10, position: 'insideTopLeft' }} />
          {today && <ReferenceLine yAxisId="w" x={today} stroke="#e2e8f0" strokeOpacity={0.5} label={{ value: 'DZIŚ', fill: '#e2e8f0', fontSize: 10, position: 'top' }} />}
          <Line yAxisId="w" dataKey="hist" name="Historia" stroke="#94a3b8" strokeWidth={2} dot={false} connectNulls={false} />
          <Line yAxisId="w" dataKey="open" name="Zastawka otwarta" stroke="#f43f5e" strokeWidth={2} strokeDasharray="6 4" dot={false} />
          <Line yAxisId="w" dataKey="smart" name="Z ZASTAWKĄ" stroke="#22d3ee" strokeWidth={3} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
