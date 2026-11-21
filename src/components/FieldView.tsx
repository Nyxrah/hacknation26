import { useEffect, useMemo, useState } from 'react'
import type { Analysis } from '../geo/analyze'
import { runoffM3 } from '../geo/analyze'
import { cropToParcel, drawLayer, hillshade, type Layer } from '../geo/render'
import { Terrain3D } from './Terrain3D'

const LAYERS: { id: Layer; label: string; hint: string }[] = [
  { id: 'orto', label: 'Zdjęcie lotnicze', hint: 'ortofotomapa z Geoportalu' },
  { id: 'flow', label: 'Którędy płynie woda', hint: 'jaśniejsze linie = więcej wody' },
  { id: 'twi', label: 'Gdzie jest mokro, a gdzie sucho', hint: 'niebieskie: woda się zbiera · brązowe: szybko wysycha' },
]

export function FieldView({ A, hsg, highlight }: { A: Analysis; hsg: 'A' | 'B' | 'C' | 'D'; highlight: Int32Array | null }) {
  const [layer, setLayer] = useState<Layer>('orto')
  const [ortho, setOrtho] = useState<HTMLImageElement | null>(null)
  const [raining, setRaining] = useState(true)
  const [damOn, setDamOn] = useState(false)
  const shade = useMemo(() => hillshade(A), [A])

  useEffect(() => {
    if (!A.raw.ortho) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setOrtho(img)
    img.src = A.raw.ortho
  }, [A])

  const texture = useMemo(() => drawLayer(A, layer === 'orto' && !ortho ? 'flow' : layer, { ortho, shade, highlight, highlightColor: 'rgba(250,204,21,0.8)' }), [A, layer, ortho, shade, highlight])
  const printMap = useMemo(() => cropToParcel(A, drawLayer(A, ortho ? 'orto' : 'flow', { ortho, shade, highlight: Int32Array.from(A.interventions.flatMap((i) => Array.from(i.cells))) }), 40).toDataURL('image/jpeg', 0.85), [A, ortho, shade])
  const damSim = useMemo(() => (A.dam ? A.dam.sim(0.8) : null), [A])
  const out30 = runoffM3(30, hsg, A.parcelCells, A.g.res)
  const kept = damSim && A.dam ? Math.min(damSim.volume, runoffM3(30, hsg, A.dam.catchmentCells, A.g.res)) : 0
  const r10 = (v: number) => (Math.round(v / 10) * 10).toLocaleString('pl-PL')

  return (
    <div className="card overflow-hidden">
      <div className="no-print relative h-[520px] bg-paper md:h-[600px]">
        <Terrain3D A={A} texture={texture} rain={30} raining={raining} dam={damSim} damOn={damOn} focus={null} />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1 rounded-xl bg-white/95 p-1 shadow">
          {LAYERS.map((l) => (
            <button key={l.id} onClick={() => setLayer(l.id)} className={`rounded-lg px-3 py-1.5 text-[14.5px] font-semibold ${layer === l.id ? 'bg-field text-white' : 'text-ink hover:bg-paper'}`}>{l.label}</button>
          ))}
        </div>
        <div className="absolute right-3 top-3 max-w-[260px] rounded-xl bg-white/95 px-3 py-2 text-[13.5px] shadow">
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#40bfff]" /> deszcz, który zostaje na polu</div>
          <div className="mt-1 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-bad" /> woda, która ucieka z pola</div>
          <div className="mt-1 flex items-center gap-2"><span className="h-0.5 w-4 bg-[#67b8e8]" /> cieki i rowy</div>
          <div className="mt-1 text-muted">{LAYERS.find((l) => l.id === layer)?.hint}</div>
        </div>
        <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-3 rounded-xl bg-white/95 px-4 py-3 shadow">
          <button onClick={() => setRaining((r) => !r)} className={`btn !px-4 !py-2 !text-[15px] ${raining ? 'bg-water text-white' : 'border border-line bg-white'}`}>🌧️ {raining ? 'Ulewa 30 mm: włączona' : 'Pokaż ulewę 30 mm'}</button>
          {A.dam && <button onClick={() => setDamOn((d) => !d)} className={`btn !px-4 !py-2 !text-[15px] ${damOn ? 'bg-field text-white' : 'border border-line bg-white'}`}>🚧 {damOn ? 'Zastawka postawiona' : 'Pokaż efekt zastawki'}</button>}
          <div className="ml-auto text-[15px]">
            Po ulewie 30 mm z pola odpływa ok. <b className="num text-bad">{r10(out30)} m³</b>
            {damOn && kept > 0 && <> · zastawka zatrzyma <b className="num text-water">{r10(kept)} m³</b></>}
          </div>
        </div>
      </div>
      <img src={printMap} className="print-only mx-auto max-h-[380px]" alt="Mapa działki" />
      <div className="border-t border-line px-5 py-3 text-[13.5px] text-muted">
        Model 3D z prawdziwego ukształtowania terenu (przewyższenie pionowe dla czytelności). Kropki to krople deszczu spływające zgodnie ze spadkiem; czerwone uciekają poza działkę. Obróć model myszką lub palcem.
      </div>
    </div>
  )
}
