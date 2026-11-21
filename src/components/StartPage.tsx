import { useEffect, useState } from 'react'
import { from4326 } from '../geo/crs'
import { CROPS, type CropId } from '../geo/crops'
import { findParcel, prefetch } from '../geo/loader'
import { parcelByXY } from '../geo/sources'
import { polygonArea } from '../geo/analyze'
import type { Parcel } from '../geo/types'
import { Spinner } from './ui'
import { ParcelMap } from './ParcelMap'

const EXAMPLES = [
  { id: '160201_5.0001.23', label: 'Babice (opolskie)' },
  { id: '321004_5.0010.110/15', label: 'Kruszwin (zachodniopomorskie)' },
  { id: '061404_4.0005.582', label: 'Wylągi (lubelskie)' },
]

const today = () => new Date().toISOString().slice(0, 10)
const minDate = () => `${new Date().getFullYear() - 10}-01-01`

export function StartPage({ onRun, initial }: { onRun: (p: Parcel, crop: CropId, date: string) => void; initial?: { parcel: Parcel; crop: CropId; date: string } | null }) {
  const [q, setQ] = useState(initial?.parcel.id ?? '')
  const [parcel, setParcel] = useState<Parcel | null>(initial?.parcel ?? null)
  const [crop, setCrop] = useState<CropId | null>(initial?.crop ?? null)
  const [date, setDate] = useState(initial?.date ?? today())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const search = async (id = q) => {
    if (!id.trim()) return
    setBusy(true); setErr(null)
    try {
      const p = await findParcel(id)
      if (!p) setErr('Nie znaleziono takiej działki. Sprawdź numer — powinien wyglądać np. tak: 160201_5.0001.23')
      setParcel(p)
    } catch {
      setErr('Serwis z działkami (GUGiK) nie odpowiada. Spróbuj za chwilę albo kliknij pole na mapie.')
    }
    setBusy(false)
  }
  const pick = async (lat: number, lng: number) => {
    setBusy(true); setErr(null)
    try {
      const [x, y] = from4326(lat, lng)
      const p = await parcelByXY(x, y)
      if (!p) setErr('W tym miejscu nie ma działki ewidencyjnej.')
      else { setParcel(p); setQ(p.id) }
    } catch { setErr('Serwis z działkami (GUGiK) nie odpowiada.') }
    setBusy(false)
  }

  // teren i gleba zaczynają się pobierać od razu — zanim rolnik wybierze uprawę i datę
  useEffect(() => { if (parcel) prefetch(parcel) }, [parcel])

  const ready = parcel && crop && date
  return (
    <div className="pb-16">
      <div className="py-8 md:py-12">
        <div className="eyebrow">Doradca wodny dla rolnika · bezpłatnie · bez logowania</div>
        <h1 className="mt-3 max-w-3xl text-[36px] font-bold leading-[1.1] text-ink md:text-[48px]">
          Czy Twoje pole ma dość wody — i&nbsp;jak jej nie tracić?
        </h1>
        <p className="mt-4 max-w-2xl text-[18px] leading-relaxed text-muted">
          Wskaż działkę i uprawę. Sprawdzimy pogodę z ostatnich 10 lat, glebę, zdjęcia satelitarne i ukształtowanie terenu,
          a potem powiemy prostymi słowami, co zrobić.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* krok 1 */}
        <div className="card min-w-0 p-5 md:p-6">
          <Step n={1} title="Wskaż swoje pole" done={!!parcel} />
          <label className="mt-4 block text-[15px] font-semibold text-ink" htmlFor="parcel">Numer działki ewidencyjnej</label>
          <div className="mt-2 flex gap-2">
            <input
              id="parcel"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="np. 160201_5.0001.23"
              className="min-w-0 flex-1 rounded-xl border-2 border-line bg-white px-4 py-2.5 font-mono text-[17px] leading-[1.6] outline-none focus:border-field"
            />
            <button className="btn-primary" onClick={() => search()} disabled={busy || !q.trim()}>{busy ? <Spinner /> : 'Szukaj'}</button>
          </div>
          <p className="mt-2 text-[14px] text-muted">Numer jest w wypisie z rejestru gruntów albo we wniosku o dopłaty. Nie masz go pod ręką? <b>Kliknij pole na mapie.</b></p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[14px]">
            <span className="text-muted">Przykłady:</span>
            {EXAMPLES.map((e) => (
              <button key={e.id} onClick={() => { setQ(e.id); search(e.id) }} className="rounded-full border border-line bg-paper px-3 py-1 font-semibold text-field hover:bg-field-soft">{e.label}</button>
            ))}
          </div>
          {err && <div className="mt-3 rounded-xl bg-[#fbe1de] px-4 py-3 text-[15px] text-bad">{err}</div>}
          {parcel && (
            <div className="appear mt-4 flex items-center gap-3 rounded-xl bg-field-soft px-4 py-3">
              <span className="text-[24px]">✅</span>
              <div>
                <div className="font-bold text-field-dark">Działka {parcel.id}</div>
                <div className="text-[15px] text-muted">gm. {parcel.commune}, obręb {parcel.region} · {(polygonArea(parcel.ring) / 1e4).toFixed(2)} ha</div>
              </div>
            </div>
          )}

          {/* krok 2 */}
          <div className="mt-8"><Step n={2} title="Co rośnie na polu?" done={!!crop} /></div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.values(CROPS).map((c) => (
              <button key={c.id} onClick={() => setCrop(c.id)}
                className={`rounded-xl border-2 px-2 py-3 text-center transition ${crop === c.id ? 'border-field bg-field-soft' : 'border-line bg-white hover:border-field/40'}`}>
                <div className="text-[28px] leading-none">{c.icon}</div>
                <div className="mt-1.5 text-[14.5px] font-semibold leading-tight">{c.name}</div>
              </button>
            ))}
          </div>

          {/* krok 3 */}
          <div className="mt-8"><Step n={3} title="Na jaki dzień?" done /></div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button onClick={() => setDate(today())} className={`rounded-xl border-2 px-4 py-2.5 font-semibold ${date === today() ? 'border-field bg-field-soft text-field-dark' : 'border-line bg-white'}`}>Dziś</button>
            <label className="flex items-center gap-2 text-[15px] text-muted">
              albo inny dzień:
              <input type="date" value={date} min={minDate()} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} className="rounded-xl border-2 border-line bg-white px-3 py-2 text-[16px] text-ink outline-none focus:border-field" />
            </label>
          </div>
          <p className="mt-2 text-[14px] text-muted">Możesz sprawdzić dowolny dzień z ostatnich 10 lat — np. jak było w suszy 2018 r.</p>

          <button className="btn-primary mt-8 w-full py-4 text-[19px]" disabled={!ready} onClick={() => ready && onRun(parcel!, crop!, date)}>
            Sprawdź moje pole →
          </button>
          {!ready && <p className="mt-2 text-center text-[14px] text-muted">{!parcel ? 'Najpierw wskaż działkę.' : 'Wybierz uprawę.'}</p>}
        </div>

        {/* mapa */}
        <div className="card relative h-[420px] overflow-hidden lg:h-auto lg:min-h-[640px]">
          <ParcelMap parcel={parcel} onPick={pick} />
          <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-xl bg-white/95 px-4 py-2 text-[15px] font-semibold shadow">
            🖱️ Przybliż mapę i kliknij swoje pole
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-4">
        {[
          ['🌦️', 'Pogoda z 10 lat', 'opady, parowanie i upały na tle wielolecia'],
          ['🟫', 'Gleba', 'ile wody zmieści się w strefie korzeni'],
          ['🛰️', 'Zdjęcie satelitarne', 'czy rośliny na polu są przesuszone'],
          ['⛰️', 'Teren i cieki', 'którędy woda ucieka i gdzie ją zatrzymać'],
        ].map(([i, t, d]) => (
          <div key={t} className="flex gap-3 rounded-xl bg-white/60 p-4">
            <span className="text-[26px]">{i}</span>
            <div><div className="font-bold">{t}</div><div className="text-[14.5px] text-muted">{d}</div></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Step({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`grid h-9 w-9 place-items-center rounded-full text-[17px] font-bold ${done ? 'bg-field text-white' : 'bg-paper text-field ring-2 ring-field/30'}`}>{n}</span>
      <h2 className="text-[23px] font-bold">{title}</h2>
    </div>
  )
}
