import { Area, Bar, BarChart, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Assessment } from '../geo/assess'

const tip = { contentStyle: { borderRadius: 12, border: '1px solid #e3ddcd', fontSize: 14 } }
const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']
const short = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`

/** Dni stresu wodnego w okresie krytycznym — każdy z 10 lat */
export function HistoryChart({ R }: { R: Assessment }) {
  const data = R.history.rows.map((r) => ({ ...r, label: String(r.year) }))
  return (
    <div className="h-[230px]">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 6, left: -18, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 13, fill: '#5b6658' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 13, fill: '#5b6658' }} axisLine={false} tickLine={false} />
          <Tooltip {...tip} formatter={(v) => [`${v} dni`, 'stres wodny w okresie krytycznym']} labelFormatter={(l) => `rok ${l}`} cursor={{ fill: '#f6f3ea' }} />
          <Bar dataKey="stressCrit" radius={[6, 6, 0, 0]}>
            {data.map((d) => <Cell key={d.year} fill={d.drought ? '#d9690f' : '#9cc59a'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Zapas wody w glebie w bieżącym sezonie (model) */
export function SeasonChart({ R }: { R: Assessment }) {
  const data = R.series.map((s) => ({ ...s, past: s.forecast ? null : s.avail, fut: s.forecast ? s.avail : null }))
  const iDate = data.findIndex((d) => d.date >= R.date)
  if (iDate > 0 && data[iDate]) data[iDate].fut = data[iDate].avail
  const thr = R.series[0]?.thr ?? 50
  return (
    <div className="h-[230px]">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 6, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="gW" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1f6fa8" stopOpacity={0.35} /><stop offset="1" stopColor="#1f6fa8" stopOpacity={0.02} /></linearGradient>
          </defs>
          <XAxis dataKey="date" tickFormatter={short} tick={{ fontSize: 13, fill: '#5b6658' }} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 13, fill: '#5b6658' }} axisLine={false} tickLine={false} />
          <Tooltip {...tip} labelFormatter={(l) => short(String(l))} formatter={(v, n) => [`${v}%`, n === 'fut' ? 'prognoza' : 'woda w glebie']} />
          <ReferenceLine y={thr} stroke="#d9690f" strokeDasharray="6 5" label={{ value: 'poniżej: rośliny w stresie', fill: '#c25a0a', fontSize: 12, position: 'insideBottomLeft' }} />
          <ReferenceLine x={R.date} stroke="#1d2a20" strokeOpacity={0.5} label={{ value: 'dzień analizy', fill: '#1d2a20', fontSize: 12, position: 'top' }} />
          <Area dataKey="past" stroke="#1f6fa8" strokeWidth={2.5} fill="url(#gW)" connectNulls={false} />
          <Line dataKey="fut" stroke="#1f6fa8" strokeDasharray="5 4" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Szybki wykres: bilans opad − parowanie (kwiecień–wrzesień) w każdym roku */
export function SeasonsKbw({ seasons }: { seasons: { year: number; kbw: number; partial: boolean }[] }) {
  return (
    <div className="h-[190px]">
      <ResponsiveContainer>
        <BarChart data={seasons} margin={{ top: 10, right: 6, left: -10, bottom: 0 }}>
          <XAxis dataKey="year" tick={{ fontSize: 13, fill: '#5b6658' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 13, fill: '#5b6658' }} axisLine={false} tickLine={false} />
          <ReferenceLine y={0} stroke="#cfc7b2" />
          <Tooltip {...tip} formatter={(v) => [`${Math.round(Number(v))} mm`, 'opad − parowanie (IV–IX)']} cursor={{ fill: '#f6f3ea' }} />
          <Bar dataKey="kbw" radius={[4, 4, 4, 4]}>
            {seasons.map((s) => <Cell key={s.year} fill={s.partial ? '#1f6fa8' : s.kbw < -250 ? '#d9690f' : '#b9cdb4'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Opady w kolejnych latach hydrologicznych (XI–X): deszcz + śnieg */
export function PrecipYears({ years }: { years: { label: string; rain: number; snow: number; total: number; partial: boolean }[] }) {
  const full = years.filter((y) => !y.partial)
  const norm = full.reduce((s, y) => s + y.total, 0) / Math.max(1, full.length)
  return (
    <div className="h-[230px]">
      <ResponsiveContainer>
        <BarChart data={years} margin={{ top: 10, right: 6, left: -10, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 12.5, fill: '#5b6658' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 13, fill: '#5b6658' }} axisLine={false} tickLine={false} />
          <ReferenceLine y={norm} stroke="#1d2a20" strokeDasharray="5 4" label={{ value: `średnio ${Math.round(norm)} mm`, fill: '#1d2a20', fontSize: 12, position: 'insideTopRight' }} />
          <Tooltip {...tip} formatter={(v, n) => [`${Math.round(Number(v))} mm`, n === 'rain' ? 'deszcz' : 'śnieg (woda)']} labelFormatter={(l) => `rok hydrologiczny ${l} (XI–X)`} cursor={{ fill: '#f6f3ea' }} />
          <Bar dataKey="rain" stackId="a" fill="#1f6fa8" />
          <Bar dataKey="snow" stackId="a" fill="#a9c8e8" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
