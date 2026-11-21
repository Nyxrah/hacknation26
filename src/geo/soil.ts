// Gleba z ISRIC SoilGrids 2.0 (250 m) → uziarnienie, próchnica → pojemność wodna (Saxton & Rawls 2006)
// → kategoria podatności na suszę (wg logiki IUNG: im lżejsza gleba, tym większa podatność).
export interface Soil {
  source: 'SoilGrids' | 'brak' | 'rolnik'
  clay: number // %
  sand: number
  silt: number
  soc: number // % węgla organicznego (0–30 cm)
  om: number // % materii organicznej
  fc: number // pojemność polowa [m3/m3]
  wp: number // punkt trwałego więdnięcia [m3/m3]
  awc: number // woda dostępna [mm na 1 m]
  texture: string // nazwa po polsku
  category: 'I' | 'II' | 'III' | 'IV'
  categoryName: string
  hsg: 'A' | 'B' | 'C' | 'D' // grupa hydrologiczna (SCS-CN)
}

/** Saxton & Rawls (2006): S, C — ułamki, OM — % */
export function saxtonRawls(S: number, C: number, OM: number) {
  const t1500 = -0.024 * S + 0.487 * C + 0.006 * OM + 0.005 * S * OM - 0.013 * C * OM + 0.068 * S * C + 0.031
  const wp = t1500 + (0.14 * t1500 - 0.02)
  const t33 = -0.251 * S + 0.195 * C + 0.011 * OM + 0.006 * S * OM - 0.027 * C * OM + 0.452 * S * C + 0.299
  const fc = t33 + (1.283 * t33 * t33 - 0.374 * t33 - 0.015)
  return { fc, wp }
}

function textureName(sand: number, clay: number, silt: number) {
  if (sand >= 85) return 'piasek'
  if (sand >= 70 && clay < 15) return 'piasek gliniasty'
  if (clay >= 40) return 'ił'
  if (silt >= 50 && clay < 27) return 'pył / less'
  if (sand >= 50) return 'glina lekka piaszczysta'
  if (clay >= 27) return 'glina ciężka'
  return 'glina średnia'
}

export function classify(clay: number, sand: number, silt: number, soc: number, source: Soil['source']): Soil {
  const om = soc * 1.72
  const { fc, wp } = saxtonRawls(sand / 100, clay / 100, om)
  const awc = Math.max(40, (fc - wp) * 1000)
  const texture = textureName(sand, clay, silt)
  const category: Soil['category'] = sand >= 80 ? 'I' : sand >= 65 ? 'II' : clay >= 30 ? 'IV' : 'III'
  const categoryName = {
    I: 'bardzo podatna na suszę (gleba bardzo lekka)',
    II: 'podatna na suszę (gleba lekka)',
    III: 'średnio podatna na suszę',
    IV: 'mało podatna na suszę (gleba ciężka)',
  }[category]
  const hsg: Soil['hsg'] = sand >= 75 ? 'A' : clay >= 40 ? 'D' : clay >= 25 || silt >= 60 ? 'C' : 'B'
  return { source, clay, sand, silt, soc, om, fc, wp, awc, texture, category, categoryName, hsg }
}

export const FALLBACK_SOIL = classify(18, 40, 42, 1.1, 'brak')

/** zapas wody łatwo dostępnej po zwiększeniu próchnicy o +dOM pp. — do uzasadniania rekomendacji */
export function awcGainFromOM(s: Soil, dOM: number, zr: number) {
  const a = saxtonRawls(s.sand / 100, s.clay / 100, s.om)
  const b = saxtonRawls(s.sand / 100, s.clay / 100, s.om + dOM)
  return ((b.fc - b.wp) - (a.fc - a.wp)) * 1000 * zr
}

export async function fetchSoil(lat: number, lng: number, timeout = 15000): Promise<Soil> {
  const props = ['clay', 'sand', 'silt', 'soc'].map((p) => `property=${p}`).join('&')
  const depths = ['0-5cm', '5-15cm', '15-30cm', '30-60cm'].map((d) => `depth=${d}`).join('&')
  const url = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lng.toFixed(5)}&lat=${lat.toFixed(5)}&${props}&${depths}&value=mean`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const j = await (await fetch(url, { signal: ctrl.signal })).json()
    const w = { '0-5cm': 5, '5-15cm': 10, '15-30cm': 15, '30-60cm': 30 } as Record<string, number>
    const get = (name: string, maxDepth = 60) => {
      const l = j.properties.layers.find((x: { name: string }) => x.name === name)
      if (!l) return NaN
      let s = 0, n = 0
      for (const d of l.depths) {
        const top = Number(d.label.split('-')[0])
        if (top >= maxDepth || d.values.mean === null) continue
        s += d.values.mean * w[d.label]
        n += w[d.label]
      }
      return n ? s / n / l.unit_measure.d_factor : NaN
    }
    const clay = get('clay'), sand = get('sand'), silt = get('silt'), socGkg = get('soc', 30)
    if ([clay, sand, silt, socGkg].some((v) => Number.isNaN(v))) throw new Error('brak wartości w punkcie')
    return classify(clay, sand, silt, socGkg / 10, 'SoilGrids')
  } finally {
    clearTimeout(t)
  }
}

/** Gleba wskazana przez rolnika (kategoria agronomiczna) — typowe uziarnienie; próchnica z SoilGrids. */
export function farmerSoil(kind: 'bardzo lekka' | 'lekka' | 'średnia' | 'ciężka', soc: number): Soil {
  const t = { 'bardzo lekka': [3, 90, 7], lekka: [8, 72, 20], 'średnia': [18, 45, 37], 'ciężka': [38, 25, 37] }[kind]
  const s = classify(t[0], t[1], t[2], soc, 'rolnik')
  return { ...s, texture: `gleba ${kind} (wg rolnika)` }
}
