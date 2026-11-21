export const nf0 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 })
export const nf1 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
export const pln = (v: number) => nf0.format(Math.round(v)) + ' zł'
export const m3 = (v: number) => nf0.format(Math.round(v / 10) * 10) + ' m³'

const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']
export function shortDate(iso: string) {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}
export function longDate(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
