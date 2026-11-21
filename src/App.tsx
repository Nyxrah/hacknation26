import { useEffect, useRef, useState } from 'react'
import type { CropId } from './geo/crops'
import { CROPS } from './geo/crops'
import { refine, runAnalysis, type Result, type StepId } from './geo/loader'
import { NO_FARMER, type FarmerInput } from './geo/assess'
import type { Parcel } from './geo/types'
import { StartPage } from './components/StartPage'
import { ReportPage, type StepState } from './components/ReportPage'
import { sevOf } from './components/ui'

interface Saved { id: string; parcel: Parcel; crop: CropId; date: string; status: string; sev: number; savedAt: string }
const KEY = 'bank-wody:raporty'
const loadSaved = (): Saved[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] } }

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 32 32" className="h-10 w-10"><rect width="32" height="32" rx="9" fill="#2f6b3a" /><path d="M16 5c4.5 6 7.5 9.6 7.5 13.5a7.5 7.5 0 0 1-15 0C8.5 14.6 11.5 11 16 5z" fill="#cfe6f7" /><path d="M9 21c3 1.6 11 1.6 14 0" stroke="#2f6b3a" strokeWidth="2" fill="none" /></svg>
      <div className="leading-tight">
        <div className="font-display text-[21px] font-bold text-field-dark">Bank Wody</div>
        <div className="text-[13px] text-muted">doradca wodny dla Twojego pola</div>
      </div>
    </div>
  )
}

export default function App() {
  const [phase, setPhase] = useState<'start' | 'report' | 'error'>('start')
  const [res, setRes] = useState<Result | null>(null)
  const [steps, setSteps] = useState<StepState>({})
  const [t0, setT0] = useState(0)
  const [now, setNow] = useState(0)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState<Saved[]>(loadSaved)
  const [showSaved, setShowSaved] = useState(false)
  const [last, setLast] = useState<{ parcel: Parcel; crop: CropId; date: string } | null>(null)
  const runId = useRef(0)

  useEffect(() => {
    if (phase !== 'report' || res?.done) return
    const id = setInterval(() => setNow(performance.now()), 250)
    return () => clearInterval(id)
  }, [phase, res?.done])

  const run = async (parcel: Parcel, crop: CropId, date: string) => {
    const my = ++runId.current
    setLast({ parcel, crop, date })
    setPhase('report')
    setSteps({ uldk: { state: 'ok' } })
    setRes({ parcel, date, cropId: crop, lat: 0, lng: 0, demLabel: '', demFine: false, sources: [], missing: [], seconds: 0, generatedAt: '', done: false, farmer: NO_FARMER })
    setT0(performance.now())
    setNow(performance.now())
    window.scrollTo({ top: 0 })
    try {
      await runAnalysis(parcel, date, crop,
        (s: StepId, st, note) => my === runId.current && setSteps((p) => ({ ...p, [s]: { state: st, note } })),
        (r) => my === runId.current && setRes(r))
    } catch (e) {
      if (my !== runId.current) return
      setErr((e as Error).message)
      setPhase('error')
    }
  }

  const save = () => {
    if (!res?.R) return
    const s: Saved = { id: `${res.parcel.id}|${res.date}|${res.cropId}`, parcel: res.parcel, crop: res.cropId, date: res.date, status: res.R.status.title, sev: res.R.status.sev, savedAt: new Date().toLocaleString('pl-PL') }
    const next = [s, ...saved.filter((x) => x.id !== s.id)].slice(0, 30)
    setSaved(next)
    localStorage.setItem(KEY, JSON.stringify(next))
  }
  const isSaved = !!res && saved.some((x) => x.id === `${res.parcel.id}|${res.date}|${res.cropId}`)

  return (
    <div className="min-h-full">
      <header className="no-print sticky top-0 z-[1000] border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <button onClick={() => setPhase('start')}><Logo /></button>
          <div className="flex flex-wrap items-center gap-2">
            {phase === 'report' && res && (
              <>
                <button className="btn-ghost !py-2" onClick={() => setPhase('start')}>← Inne pole</button>
                <button className="btn-ghost !py-2" disabled={!res.R} onClick={save}>{isSaved ? '✓ Zapisano' : '💾 Zapisz raport'}</button>
                <button className="btn-primary !py-2" disabled={!res.done} onClick={() => window.print()}>🖨️ Drukuj / PDF</button>
              </>
            )}
            <button className="btn-ghost !py-2" onClick={() => setShowSaved((v) => !v)}>📁 Moje raporty ({saved.length})</button>
          </div>
        </div>
        {showSaved && (
          <div className="mx-auto max-w-[1240px] px-4 pb-4 md:px-6">
            <div className="card max-h-[50vh] overflow-auto p-3">
              {!saved.length && <div className="p-3 text-muted">Nie masz jeszcze zapisanych raportów. Zapisują się tylko na tym komputerze (bez konta, bez danych osobowych).</div>}
              {saved.map((s) => (
                <button key={s.id} onClick={() => { setShowSaved(false); run(s.parcel, s.crop, s.date) }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-paper">
                  <span className="text-[22px]">{CROPS[s.crop].icon}</span>
                  <span className="flex-1"><b>{s.parcel.id}</b> · {CROPS[s.crop].name} · {s.date}<br /><span className="text-[14px] text-muted">gm. {s.parcel.commune} · zapisano {s.savedAt}</span></span>
                  <span className="text-[14px] font-semibold" style={{ color: sevOf(s.sev as 0).color }}>{s.status}</span>
                  <span className="text-[14px] font-semibold text-field">przelicz ponownie →</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* nagłówek wydruku */}
      <div className="print-only mx-auto max-w-[1240px] px-6 pt-4">
        <div className="flex items-center justify-between border-b-2 border-field pb-2">
          <Logo />
          <div className="text-right text-[12px] text-muted">Raport wygenerowany {res?.generatedAt}<br />na podstawie danych pobranych na żywo z serwisów publicznych</div>
        </div>
      </div>

      <main className="mx-auto max-w-[1240px] px-4 md:px-6">
        {phase === 'start' && <StartPage onRun={run} initial={last} />}
        {phase === 'report' && res && <ReportPage res={res} steps={steps} elapsed={now - t0} onRefine={(f: FarmerInput) => setRes((r) => (r ? refine(r, f) : r))} />}
        {phase === 'error' && (
          <div className="card mx-auto mt-16 max-w-xl p-8 text-center">
            <div className="text-[40px]">😕</div>
            <h2 className="mt-2 text-[24px] font-bold">Nie udało się przygotować raportu</h2>
            <p className="mt-2 text-muted">{err}</p>
            <div className="mt-6 flex justify-center gap-3">
              <button className="btn-ghost" onClick={() => setPhase('start')}>Wróć</button>
              {last && <button className="btn-primary" onClick={() => run(last.parcel, last.crop, last.date)}>Spróbuj ponownie</button>}
            </div>
          </div>
        )}
      </main>

      <footer className="no-print mx-auto mt-10 max-w-[1240px] border-t border-line px-4 py-6 text-[13.5px] text-muted md:px-6">
        Bank Wody — prototyp na HackNation 2026 (zadanie KOWR „Zatrzymaj wodę, chroń plony”). Dane: GUGiK (ULDK, NMT, ortofotomapa), Copernicus Sentinel-2 i DEM, Open-Meteo (ERA5), ISRIC SoilGrids, OpenStreetMap.
        Narzędzie wspiera decyzje, nie zastępuje doradcy rolnego. Nie zbieramy danych osobowych.
      </footer>
    </div>
  )
}
