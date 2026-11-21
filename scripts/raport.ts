// Raport z wiersza poleceń — do weryfikacji wyników bez przeglądarki.
// Użycie: node scripts/raport.ts <id_działki | lat,lng> [RRRR-MM-DD] [uprawa]
//   uprawy: pszenica zyto jeczmien rzepak kukurydza ziemniak burak laka
import { findParcel, runAnalysis } from '../src/geo/loader.ts'
import type { CropId } from '../src/geo/crops.ts'

const [id, date = new Date().toISOString().slice(0, 10), crop = 'pszenica'] = process.argv.slice(2)
const t0 = Date.now()
const T = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`
const parcel = await findParcel(id)
if (!parcel) throw new Error('Nie znaleziono działki ' + id)
const r = await runAnalysis(parcel, date, crop as CropId,
  (s, st, note) => console.log(`  ${T()} ${s}: ${st} ${note ?? ''}`),
  (u) => console.log(`  ${T()} → raport: ${u.R ? u.R.status.title : 'na razie pogoda'}${u.A ? ' + teren' : ''}`))
const R = r.R!, A = r.A, soil = r.soil!
console.log(`\n=== ${parcel.id} · ${parcel.commune} · ${date} · ${R.crop.name} · ${r.seconds.toFixed(1)} s ===`)
console.log(`STATUS: ${R.status.title} (pewność ${R.status.confidence}: ${R.status.confidenceWhy})\n  ${R.status.text}`)
for (const i of R.indicators) console.log(`  · ${i.label}: ${i.value} [poziom ${i.sev}] — ${i.detail}`)
console.log(`Gleba: ${soil.texture}, ${Math.round(soil.awc)} mm/m, kat. ${soil.category}, grupa ${soil.hsg}, próchnica ${soil.om.toFixed(1)}%`)
console.log(`Historia: susza w ${R.history.droughtYears}/${R.history.rows.length} lat; ryzyko: ${R.history.riskMonths}; nawadnianie: mediana ${Math.round(R.history.irrigMedian)} mm, rok suchy ${Math.round(R.history.irrigDry)} mm`)
console.log('  ' + R.history.rows.map((y) => `${y.year}:${y.stressCrit}d${y.drought ? '*' : ''}`).join(' '))
console.log('PRZYCZYNY:'); for (const c of R.causes) console.log(`  ${c.active ? '●' : '○'} ${c.title} (${c.strength}) — ${c.text}`)
console.log('ZALECENIA:'); for (const x of R.recs) console.log(`  [${x.group}/${x.priority}] ${x.title}`)
console.log(`NAWADNIANIE: ${R.irrigation.title} — ${R.irrigation.text}`)
console.log(`Satelita: ${R.sat.note}`)
console.log(`Teren: ${r.demLabel}; walidacja ρ=${A?.validation.rho?.toFixed(2)} trafność=${A?.validation.precision?.toFixed(2)}`)
console.log('Braki:', r.missing)

const S = R.seasonal
console.log(`ZIMA ${S.winter.label}: śnieg ${Math.round(S.winter.snowCm)} cm (norma ${Math.round(S.winter.snowCmNorm)}), pokrywa ${S.winter.coverDays} dni (norma ${Math.round(S.winter.coverDaysNorm)}), roztopy ${Math.round(S.winter.meltMm)} mm (norma ${Math.round(S.winter.meltMmNorm)}), teraz w śniegu ${Math.round(S.winter.sweNow)} mm`)
console.log(`WODY PODZIEMNE: ${S.groundwater.title} — ${S.groundwater.why}`)
console.log(`GZWP: ${JSON.stringify(r.gzwp)}`)
console.log(`PRZYMROZKI: ${S.frost.text}`)
console.log('OPADY ROCZNE: ' + S.precipYears.map((y) => `${y.label}:${Math.round(y.rain)}+${Math.round(y.snow)}`).join(' '))
process.exit(0)
