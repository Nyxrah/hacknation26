import { useState } from 'react'
import type { FarmerInput } from '../geo/assess'

const SOILS: FarmerInput['soil'][] = [null, 'bardzo lekka', 'lekka', 'średnia', 'ciężka']
const SOIL_HINT: Record<string, string> = {
  'bardzo lekka': 'piasek, klasy V–VI',
  lekka: 'piasek gliniasty, klasy IVb–V',
  'średnia': 'glina lekka, less, klasy III–IVa',
  'ciężka': 'glina ciężka, ił, klasy I–III',
}

/** Trzy pytania, na które rolnik zna odpowiedź lepiej niż jakakolwiek baza danych. */
export function RefinePanel({ value, onChange, disabled, soilFromData }: { value: FarmerInput; onChange: (f: FarmerInput) => void; disabled: boolean; soilFromData: string }) {
  const [rain, setRain] = useState(value.rain7 === null ? '' : String(value.rain7))
  const btn = (on: boolean) => `rounded-xl border-2 px-3.5 py-2 text-[15px] font-semibold transition ${on ? 'border-field bg-field-soft text-field-dark' : 'border-line bg-white hover:border-field/40'}`
  return (
    <div className={`card no-print mt-5 p-5 ${disabled ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[21px] font-bold">✍️ Doprecyzuj raport — jeśli wiesz</h3>
        <span className="text-[14px] text-muted">{disabled ? 'dostępne po zakończeniu analizy' : 'raport przeliczy się od razu, bez pobierania danych'}</span>
      </div>
      <div className="mt-4 grid gap-5 lg:grid-cols-3">
        <fieldset disabled={disabled}>
          <legend className="font-semibold">Czy pole jest zdrenowane?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['tak', 'nie', 'nie wiem'] as const).map((d) => (
              <button key={d} className={btn(value.drainage === d)} onClick={() => onChange({ ...value, drainage: d })}>{d}</button>
            ))}
          </div>
          <p className="mt-1.5 text-[13.5px] text-muted">Dreny są niewidoczne na mapach i zdjęciach, a mocno zmieniają gospodarkę wodą.</p>
        </fieldset>
        <fieldset disabled={disabled}>
          <legend className="font-semibold">Jaka jest gleba na tym polu?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SOILS.map((k) => (
              <button key={k ?? 'auto'} className={btn(value.soil === k)} title={k ? SOIL_HINT[k] : ''} onClick={() => onChange({ ...value, soil: k })}>{k ?? 'jak w danych'}</button>
            ))}
          </div>
          <p className="mt-1.5 text-[13.5px] text-muted">{value.soil ? SOIL_HINT[value.soil] : `Z danych satelitarno-glebowych: ${soilFromData}.`}</p>
        </fieldset>
        <fieldset disabled={disabled}>
          <legend className="font-semibold">Ile deszczu spadło w ostatnim tygodniu?</legend>
          <div className="mt-2 flex items-center gap-2">
            <input type="number" min={0} max={300} inputMode="decimal" value={rain} onChange={(e) => setRain(e.target.value)} placeholder="np. 12"
              className="w-28 rounded-xl border-2 border-line bg-white px-3 py-2 text-[16px] outline-none focus:border-field" />
            <span className="text-muted">mm</span>
            <button className="btn-primary !px-4 !py-2 !text-[15px]" onClick={() => onChange({ ...value, rain7: rain === '' ? null : Math.max(0, Number(rain.replace(',', '.'))) })}>Przelicz</button>
            {value.rain7 !== null && <button className="text-[14px] text-muted underline" onClick={() => { setRain(''); onChange({ ...value, rain7: null }) }}>usuń</button>}
          </div>
          <p className="mt-1.5 text-[13.5px] text-muted">Z własnego deszczomierza — dokładniej niż model pogody dla Twojej okolicy.</p>
        </fieldset>
      </div>
      <div className="mt-5 grid gap-5 border-t border-line pt-4 lg:grid-cols-3">
        <fieldset disabled={disabled}>
          <legend className="font-semibold">Jak uprawiasz glebę?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['orka', 'bezorkowa', 'nie wiem'] as const).map((t) => (
              <button key={t} className={btn(value.tillage === t)} onClick={() => onChange({ ...value, tillage: t })}>{t === 'bezorkowa' ? 'bezorkowo / uproszczona' : t === 'nie wiem' ? 'różnie' : 'orka'}</button>
            ))}
          </div>
          <p className="mt-1.5 text-[13.5px] text-muted">Uprawa bezorkowa zostawia resztki na powierzchni: mniej parowania i spływu.</p>
        </fieldset>
        <fieldset disabled={disabled}>
          <legend className="font-semibold">Czy przy polu rosną wierzby lub topole?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['tak', 'nie', 'nie wiem'] as const).map((t) => (
              <button key={t} className={btn(value.trees === t)} onClick={() => onChange({ ...value, trees: t })}>{t}</button>
            ))}
          </div>
          <p className="mt-1.5 text-[13.5px] text-muted">To bardzo wodochłonne drzewa — w suchych latach konkurują z uprawą o wodę.</p>
        </fieldset>
      </div>
    </div>
  )
}
