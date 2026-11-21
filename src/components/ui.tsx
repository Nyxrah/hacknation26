import type { ReactNode } from 'react'
import type { Sev } from '../geo/assess'

export const SEV = [
  { color: '#2e7d32', bg: '#e8f3e6', label: 'w normie', icon: '🟢' },
  { color: '#9a7400', bg: '#fbf3d6', label: 'lekki niedobór', icon: '🟡' },
  { color: '#c25a0a', bg: '#fde9d9', label: 'umiarkowany niedobór', icon: '🟠' },
  { color: '#b3261e', bg: '#fbe1de', label: 'silny niedobór', icon: '🔴' },
]
export const sevOf = (s: Sev | null) => (s === null ? { color: '#6b7280', bg: '#f1f1ee', label: 'brak oceny', icon: '⚪' } : SEV[s])

export function Section({ n, title, sub, children, id }: { n?: string; title: ReactNode; sub?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-24 pt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          {n && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-field text-[17px] font-bold text-white">{n}</span>}
          <h2 className="text-[26px] font-bold leading-tight text-ink">{title}</h2>
        </div>
        {sub && <p className="max-w-xl text-[15px] text-muted">{sub}</p>}
      </div>
      {children}
    </section>
  )
}

export function Skeleton({ h = 120, label }: { h?: number; label?: string }) {
  return (
    <div className="skeleton grid place-items-center text-[15px] font-semibold text-muted" style={{ height: h }}>
      {label && <span className="flex items-center gap-2"><Spinner /> {label}</span>}
    </div>
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent" style={{ width: size, height: size }} />
}

export function Pill({ color, bg, children }: { color: string; bg: string; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[14px] font-semibold" style={{ color, background: bg }}>{children}</span>
}

export function Info({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[13.5px] leading-snug text-muted">{children}</p>
}
