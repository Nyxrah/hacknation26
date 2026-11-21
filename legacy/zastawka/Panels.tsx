import { BadgeCheck, Leaf, Layers, MessageSquareText, Phone, Waves, Warehouse } from 'lucide-react'
import type { Advice } from '../lib/advisor'
import type { Field, Program } from '../lib/data'
import type { Practices } from '../lib/model'
import { Chip, LEVEL_COLOR, Panel } from './ui'

// ---------- KPI ----------
export function Kpi({ label, value, sub, color = '#e2e8f0', icon }: { label: string; value: string; sub?: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="panel relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full blur-2xl" style={{ background: color, opacity: 0.12 }} />
      <div className="flex items-center gap-2 label">{icon}{label}</div>
      <div className="kpi mt-3 text-3xl" style={{ color }}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  )
}

// ---------- Scenariusze ----------
const OPTIONS: { key: keyof Practices; title: string; desc: string; icon: React.ReactNode }[] = [
  { key: 'retention', title: 'Sterowana zastawka', desc: 'Piętrzenie wody w rowie, zrzut tylko przed ulewą', icon: <Waves size={16} /> },
  { key: 'cover', title: 'Międzyplon / mulcz', desc: 'Mniej parowania z gleby, lepsze wsiąkanie', icon: <Leaf size={16} /> },
  { key: 'organic', title: 'Uprawa bezorkowa', desc: '+materia organiczna → gleba trzyma więcej wody', icon: <Layers size={16} /> },
  { key: 'pond', title: 'Oczko / zbiornik', desc: 'Dodatkowy magazyn wody przy rowie', icon: <Warehouse size={16} /> },
]

export function ScenarioPanel({ value, onChange, naiveWl, smartWl }: { value: Practices; onChange: (p: Practices) => void; naiveWl: number; smartWl: number }) {
  return (
    <Panel title="Symulator „co jeśli”">
      <div className="space-y-2">
        {OPTIONS.map((o) => {
          const on = value[o.key]
          return (
            <button
              key={o.key}
              onClick={() => onChange({ ...value, [o.key]: !on })}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${on ? 'border-water/40 bg-water/10' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'}`}
            >
              <div className={`grid h-8 w-8 place-items-center rounded-lg ${on ? 'bg-water/20 text-water' : 'bg-white/5 text-slate-400'}`}>{o.icon}</div>
              <div className="flex-1">
                <div className={`text-sm font-semibold ${on ? 'text-white' : 'text-slate-300'}`}>{o.title}</div>
                <div className="text-[11.5px] text-slate-400">{o.desc}</div>
              </div>
              <div className={`relative h-5 w-9 rounded-full transition ${on ? 'bg-water' : 'bg-white/10'}`}>
                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
              </div>
            </button>
          )
        })}
      </div>
      {value.retention && (
        <div className="mt-4 rounded-xl border border-white/5 bg-ink-950/60 p-3 text-[12px] leading-relaxed text-slate-400">
          Dlaczego <b className="text-slate-200">sterowanie</b>, a nie po prostu „zamknij i zapomnij”? Zastawka zamknięta na stałe w tym sezonie:{' '}
          <b className="text-alarm">{naiveWl} dni podtopień</b>. Ze sterowaniem przed ulewami: <b className="text-leaf">{smartWl}</b>.
        </div>
      )}
    </Panel>
  )
}

// ---------- SMS ----------
export function SmsPanel({ adv, farmer = 'Panie Janie' }: { adv: Advice; farmer?: string }) {
  const text = `ZASTAWKA: ${farmer}, ${adv.verb.toLowerCase()} zastawkę ${adv.gate} (${adv.fieldName}). ${adv.why[0]} Odpisz 1 = zrobione, 2 = zadzwoń.`
  return (
    <Panel title="Kanał dla każdego" right={<Chip color="#34d399">bez smartfona</Chip>}>
      <div className="mx-auto w-full max-w-[250px] rounded-[28px] border border-white/10 bg-ink-950 p-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-white/10" />
        <div className="mb-2 text-center text-[10px] text-slate-500">SMS · 6:40</div>
        <div className="rounded-2xl rounded-tl-sm bg-ink-800 p-3 text-[12.5px] leading-snug text-slate-200">{text}</div>
        <div className="ml-auto mt-2 w-fit rounded-2xl rounded-tr-sm bg-water px-3 py-1.5 text-[12.5px] font-semibold text-ink-950">1</div>
        <div className="mt-1 text-right text-[10px] text-slate-500">✓ odnotowano w dzienniku</div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[11.5px]">
        <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] p-2 text-slate-300"><MessageSquareText size={14} className="text-water" /> SMS o 6:40</div>
        <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] p-2 text-slate-300"><Phone size={14} className="text-water" /> komunikat głosowy</div>
      </div>
    </Panel>
  )
}

// ---------- Programy ----------
export function ProgramsPanel({ programs, field }: { programs: Program[]; field: Field }) {
  const list = programs.filter((p) => p.match(field))
  return (
    <Panel title="Na to są pieniądze" right={<span className="text-[11px] text-slate-500">dopasowane do: {field.name}</span>}>
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((p) => (
          <div key={p.name} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="flex items-start gap-2">
              <BadgeCheck size={16} className="mt-0.5 shrink-0 text-leaf" />
              <div>
                <div className="text-sm font-semibold text-white">{p.name}</div>
                <div className="mt-0.5 font-mono text-[10.5px] text-slate-500">{p.who}</div>
                <p className="mt-2 text-[12.5px] leading-snug text-slate-400">{p.what}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-500">Warunki i stawki sprawdź w aktualnym naborze — ZASTAWKA przygotuje dziennik retencji jako załącznik do wniosku.</p>
    </Panel>
  )
}

// ---------- Lista pól ----------
export function FieldTabs({ fields, advices, areas, selected, onSelect }: { fields: Field[]; advices: Record<string, Advice>; areas: Record<string, number>; selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="flex gap-2">
      {fields.map((f) => {
        const adv = advices[f.id]
        const c = adv ? LEVEL_COLOR[adv.level] : '#94a3b8'
        const sel = f.id === selected
        return (
          <button
            key={f.id}
            onClick={() => onSelect(f.id)}
            className={`flex-1 rounded-xl border px-3 py-2 text-left backdrop-blur-md transition ${sel ? 'bg-ink-950/90' : 'bg-ink-950/70 hover:bg-ink-950/85'}`}
            style={{ borderColor: sel ? c : 'rgba(255,255,255,0.08)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-semibold text-white">{f.name}</span>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c, boxShadow: `0 0 10px ${c}` }} />
            </div>
            <div className="mt-0.5 flex items-center justify-between font-mono text-[10.5px] text-slate-400">
              <span>{areas[f.id]?.toFixed(1)} ha</span>
              <span style={{ color: c }}>{adv?.verb}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
