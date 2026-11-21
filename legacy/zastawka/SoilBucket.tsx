import type { DayState } from '../lib/model'

// Przekrój: gleba ze strefą korzeni (ile wody mają rośliny) + rów z zastawką.
export function SoilBucket({ s, gate }: { s: DayState; gate: string }) {
  const W = 300, H = 210
  const soilX = 14, soilW = 178, top = 34, bottom = 196
  const h = bottom - top
  const avail = Math.max(0, (s.taw - s.dr) / s.taw)
  const thr = (s.taw - s.raw) / s.taw
  const waterY = bottom - avail * h
  const thrY = bottom - thr * h
  const stressed = s.ks < 0.98
  const wc = stressed ? '#f43f5e' : '#22d3ee'

  const ditchX = 214, ditchW = 70
  const fill = s.storeCap > 0 ? s.store / s.storeCap : 0
  const dTop = 70, dBottom = 196
  const dY = dBottom - fill * (dBottom - dTop)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto h-[220px] w-full">
      <defs>
        <linearGradient id="soil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b2a1d" />
          <stop offset="1" stopColor="#1c140d" />
        </linearGradient>
        <linearGradient id="wat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={wc} stopOpacity="0.75" />
          <stop offset="1" stopColor={wc} stopOpacity="0.25" />
        </linearGradient>
        <clipPath id="soilClip"><rect x={soilX} y={top} width={soilW} height={h} rx="10" /></clipPath>
        <clipPath id="ditchClip"><path d={`M${ditchX} ${dTop} L${ditchX + ditchW} ${dTop} L${ditchX + ditchW - 14} ${dBottom} L${ditchX + 14} ${dBottom} Z`} /></clipPath>
        <pattern id="dots" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.8" fill="#ffffff" opacity="0.08" />
        </pattern>
      </defs>

      {/* uprawa */}
      {Array.from({ length: 9 }).map((_, i) => {
        const x = soilX + 12 + i * 19
        const droop = stressed ? 6 : 0
        return (
          <g key={i} stroke={stressed ? '#a3a36a' : '#34d399'} strokeWidth="2" fill="none" strokeLinecap="round">
            <path d={`M${x} ${top} Q${x} ${top - 14} ${x - 7} ${top - 20 + droop}`} />
            <path d={`M${x} ${top} Q${x} ${top - 16} ${x + 7} ${top - 24 + droop}`} />
          </g>
        )
      })}

      <g clipPath="url(#soilClip)">
        <rect x={soilX} y={top} width={soilW} height={h} fill="url(#soil)" />
        <rect x={soilX} y={top} width={soilW} height={h} fill="url(#dots)" />
        <rect x={soilX} y={waterY} width={soilW} height={bottom - waterY} fill="url(#wat)" style={{ transition: 'all .6s ease' }} />
        <g transform={`translate(0 ${waterY - 4})`} style={{ transition: 'transform .6s ease' }}>
          <path d={`M${soilX} 4 ${'q 9 -5 18 0 t 18 0 '.repeat(7)} V 10 H ${soilX} Z`} fill={wc} opacity="0.5">
            <animateTransform attributeName="transform" type="translate" from="0 0" to="-36 0" dur="2.4s" repeatCount="indefinite" />
          </path>
        </g>
        {/* korzenie */}
        {Array.from({ length: 9 }).map((_, i) => {
          const x = soilX + 12 + i * 19
          return <path key={i} d={`M${x} ${top} q -4 30 2 60 m -2 -40 q 10 10 8 30`} stroke="#d6b98c" strokeOpacity="0.35" fill="none" />
        })}
      </g>
      <rect x={soilX} y={top} width={soilW} height={h} rx="10" fill="none" stroke="rgba(255,255,255,0.12)" />

      <line x1={soilX - 4} x2={soilX + soilW + 4} y1={thrY} y2={thrY} stroke="#fbbf24" strokeDasharray="4 4" />
      <text x={soilX + soilW - 4} y={thrY - 5} textAnchor="end" fontSize="9" fill="#fbbf24" fontFamily="JetBrains Mono">próg stresu</text>
      <text x={soilX + 10} y={bottom - 10} fontSize="22" fontWeight="700" fill="#fff" fontFamily="JetBrains Mono">{Math.round(avail * 100)}%</text>
      <text x={soilX + 10} y={bottom - 38} fontSize="9" fill="#cbd5e1" fontFamily="Inter">woda dostępna dla roślin</text>

      {/* rów i zastawka */}
      <path d={`M${ditchX - 8} ${dTop} L${ditchX + ditchW + 8} ${dTop}`} stroke="#3b2a1d" strokeWidth="4" />
      <g clipPath="url(#ditchClip)">
        <rect x={ditchX} y={dTop} width={ditchW} height={dBottom - dTop} fill="#120d08" />
        <rect x={ditchX} y={dY} width={ditchW} height={dBottom - dY} fill="#0891b2" opacity="0.75" style={{ transition: 'all .6s ease' }} />
      </g>
      <path d={`M${ditchX} ${dTop} L${ditchX + 14} ${dBottom} L${ditchX + ditchW - 14} ${dBottom} L${ditchX + ditchW} ${dTop}`} fill="none" stroke="rgba(255,255,255,0.15)" />
      {/* deska zastawki */}
      <rect
        x={ditchX + ditchW / 2 - 3}
        y={s.gateOpen ? dTop - 40 : dTop - 12}
        width="6"
        height={s.gateOpen ? 50 : dBottom - dTop + 10}
        rx="2"
        fill={s.gateOpen ? '#fbbf24' : '#f43f5e'}
        style={{ transition: 'all .6s ease' }}
      />
      <text x={ditchX + ditchW / 2} y={dTop - 48} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="JetBrains Mono">{gate}</text>
      <text x={ditchX + ditchW / 2} y={dBottom + 12} textAnchor="middle" fontSize="9" fill="#67e8f9" fontFamily="JetBrains Mono">
        rów {Math.round(fill * 100)}%
      </text>
      {/* podsiąk */}
      {s.cr > 0.05 &&
        [0, 1, 2].map((i) => (
          <path key={i} d={`M${ditchX - 4} ${dBottom - 20 - i * 18} q -10 -4 -20 0`} stroke="#67e8f9" strokeWidth="1.5" fill="none" markerEnd="" opacity={0.8 - i * 0.2}>
            <animate attributeName="opacity" values="0;0.9;0" dur="1.6s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
          </path>
        ))}
    </svg>
  )
}
