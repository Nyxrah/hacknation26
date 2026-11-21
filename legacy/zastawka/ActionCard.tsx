import { ArrowRight, DoorClosed, DoorOpen, Droplets, ShieldCheck, Sprout } from 'lucide-react'
import type { Advice } from '../lib/advisor'
import { m3, pln } from '../lib/format'
import { Chip, LEVEL_COLOR, LEVEL_LABEL } from './ui'

const ICON = { ZAMKNIJ: DoorClosed, OTWÓRZ: DoorOpen, TRZYMAJ: ShieldCheck, NAWADNIAJ: Sprout }

export function ActionCard({ adv, dateLabel }: { adv: Advice; dateLabel: string }) {
  const c = LEVEL_COLOR[adv.level]
  const Icon = ICON[adv.verb]
  return (
    <div className="relative overflow-hidden rounded-2xl border p-6" style={{ borderColor: c + '55', background: `linear-gradient(135deg, ${c}22, transparent 55%), #081621` }}>
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ background: c, opacity: 0.18 }} />
      <div className="flex items-center justify-between">
        <span className="label">Decyzja na {dateLabel}</span>
        <Chip color={c}>{LEVEL_LABEL[adv.level]}</Chip>
      </div>

      <div className="mt-5 flex items-start gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl" style={{ background: c + '22', color: c, boxShadow: `0 0 30px ${c}40` }}>
          <Icon size={28} strokeWidth={2.2} />
        </div>
        <div>
          <div className="font-mono text-sm font-semibold tracking-widest" style={{ color: c }}>
            {adv.verb} · {adv.gate}
          </div>
          <h3 className="mt-1 text-2xl font-bold leading-tight text-white">{adv.title}</h3>
        </div>
      </div>

      <ul className="mt-5 space-y-2">
        {adv.why.map((w, i) => (
          <li key={i} className="flex gap-2 text-[13.5px] leading-snug text-slate-300">
            <ArrowRight size={14} className="mt-0.5 shrink-0" style={{ color: c }} />
            {w}
          </li>
        ))}
      </ul>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/[0.04] p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Droplets size={12} /> woda w grze (14 dni)</div>
          <div className="kpi mt-1 text-xl text-water">{m3(adv.gainM3)}</div>
        </div>
        <div className="rounded-xl bg-white/[0.04] p-3">
          <div className="text-[11px] text-slate-400">dni stresu mniej</div>
          <div className="kpi mt-1 text-xl text-leaf">
            {adv.stressAvoided}
            <span className="ml-1 text-sm text-slate-400">{adv.gainPln > 50 ? `≈ ${pln(adv.gainPln)}` : ''}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
