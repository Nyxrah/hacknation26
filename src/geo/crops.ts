// Uprawy: współczynniki FAO-56 (Kc, p, Zr), FAO-33 (Ky), fenologia dla Polski oraz przybliżone
// referencyjne przebiegi NDVI (Sentinel-2) zdrowego łanu — do interpretacji zdjęć z uwzględnieniem uprawy.
export type CropId = 'pszenica' | 'zyto' | 'jeczmien' | 'rzepak' | 'kukurydza' | 'ziemniak' | 'burak' | 'laka'

export interface Crop {
  id: CropId
  name: string
  short: string
  icon: string
  kc: [number, number][] // [dzień roku, Kc]
  zr: number // głębokość korzeni [m]
  p: number // frakcja łatwo dostępnej wody (FAO-56)
  ky: number // wrażliwość plonu na niedobór wody (FAO-33)
  season: [number, number] // okres wegetacji czynnej (dzień roku)
  harvest: number // typowy termin zbioru
  critical: [number, number] // okres krytyczny dla wody
  criticalName: string
  ndvi: [number, number][] // referencyjny NDVI zdrowego łanu
  catchCrop: boolean // czy po zbiorze jest miejsce na międzyplon
  sowing?: number // siew jesienny (uprawy ozime)
  irrigationSense: 'wysoka' | 'średnia' | 'niska' // opłacalność nawadniania w Polsce
}

export const CROPS: Record<CropId, Crop> = {
  pszenica: {
    id: 'pszenica', name: 'Pszenica ozima', short: 'pszenica', icon: '🌾',
    kc: [[60, 0.35], [100, 0.55], [135, 1.15], [180, 1.15], [205, 0.4], [212, 0.25]],
    zr: 1.3, p: 0.55, ky: 1.05, season: [75, 205], harvest: 210, critical: [125, 175], criticalName: 'strzelanie w źdźbło – kłoszenie – kwitnienie',
    ndvi: [[60, 0.35], [100, 0.55], [130, 0.8], [160, 0.84], [185, 0.6], [205, 0.35], [215, 0.22]],
    sowing: 268, catchCrop: true, irrigationSense: 'niska',
  },
  zyto: {
    id: 'zyto', name: 'Żyto / pszenżyto ozime', short: 'żyto', icon: '🌾',
    kc: [[60, 0.35], [95, 0.6], [130, 1.1], [175, 1.1], [200, 0.35]],
    zr: 1.3, p: 0.6, ky: 0.9, season: [70, 200], harvest: 205, critical: [115, 165], criticalName: 'strzelanie w źdźbło – kłoszenie',
    ndvi: [[60, 0.35], [95, 0.6], [125, 0.8], [155, 0.78], [180, 0.5], [205, 0.25]],
    sowing: 262, catchCrop: true, irrigationSense: 'niska',
  },
  jeczmien: {
    id: 'jeczmien', name: 'Jęczmień jary', short: 'jęczmień', icon: '🌾',
    kc: [[95, 0.3], [125, 0.6], [155, 1.15], [190, 1.1], [210, 0.3]],
    zr: 0.9, p: 0.55, ky: 1.0, season: [105, 210], harvest: 212, critical: [140, 180], criticalName: 'krzewienie – kłoszenie',
    ndvi: [[95, 0.15], [125, 0.4], [155, 0.8], [185, 0.7], [205, 0.35]],
    catchCrop: true, irrigationSense: 'niska',
  },
  rzepak: {
    id: 'rzepak', name: 'Rzepak ozimy', short: 'rzepak', icon: '🌼',
    kc: [[60, 0.4], [95, 0.65], [125, 1.15], [170, 1.1], [195, 0.35]],
    zr: 1.3, p: 0.6, ky: 1.0, season: [70, 195], harvest: 200, critical: [110, 160], criticalName: 'kwitnienie – zawiązywanie łuszczyn',
    ndvi: [[60, 0.4], [100, 0.72], [125, 0.7], [150, 0.8], [180, 0.5], [200, 0.25]],
    sowing: 235, catchCrop: true, irrigationSense: 'niska',
  },
  kukurydza: {
    id: 'kukurydza', name: 'Kukurydza', short: 'kukurydza', icon: '🌽',
    kc: [[115, 0.25], [145, 0.4], [185, 1.2], [235, 1.2], [275, 0.6]],
    zr: 1.2, p: 0.55, ky: 1.25, season: [130, 275], harvest: 285, critical: [190, 230], criticalName: 'wiechowanie – kwitnienie – zawiązywanie ziarna',
    ndvi: [[120, 0.15], [150, 0.3], [180, 0.7], [210, 0.85], [245, 0.75], [275, 0.4]],
    catchCrop: false, irrigationSense: 'średnia',
  },
  ziemniak: {
    id: 'ziemniak', name: 'Ziemniak', short: 'ziemniak', icon: '🥔',
    kc: [[115, 0.3], [150, 0.6], [180, 1.15], [225, 1.1], [255, 0.7]],
    zr: 0.6, p: 0.35, ky: 1.1, season: [135, 250], harvest: 255, critical: [165, 215], criticalName: 'zawiązywanie i przyrost bulw',
    ndvi: [[120, 0.15], [155, 0.5], [185, 0.85], [220, 0.75], [250, 0.4]],
    catchCrop: true, irrigationSense: 'wysoka',
  },
  burak: {
    id: 'burak', name: 'Burak cukrowy', short: 'burak', icon: '🟣',
    kc: [[100, 0.3], [150, 0.6], [190, 1.2], [260, 1.15], [290, 0.8]],
    zr: 1.0, p: 0.55, ky: 1.0, season: [130, 290], harvest: 290, critical: [180, 240], criticalName: 'zakrywanie międzyrzędzi – przyrost korzeni',
    ndvi: [[110, 0.15], [150, 0.45], [190, 0.85], [250, 0.8], [290, 0.6]],
    catchCrop: false, irrigationSense: 'średnia',
  },
  laka: {
    id: 'laka', name: 'Łąka / pastwisko', short: 'łąka', icon: '🌿',
    kc: [[80, 0.6], [120, 1.0], [280, 1.0], [300, 0.7]],
    zr: 0.5, p: 0.5, ky: 1.0, season: [95, 290], harvest: 300, critical: [130, 200], criticalName: 'odrost po I i II pokosie',
    ndvi: [[80, 0.5], [120, 0.8], [160, 0.72], [200, 0.72], [250, 0.7], [300, 0.6]],
    catchCrop: false, irrigationSense: 'średnia',
  },
}

export function interp(pts: [number, number][], doy: number, outside: number) {
  if (doy <= pts[0][0] || doy >= pts[pts.length - 1][0]) return outside
  for (let i = 1; i < pts.length; i++)
    if (doy <= pts[i][0]) {
      const [d0, k0] = pts[i - 1], [d1, k1] = pts[i]
      return k0 + ((k1 - k0) * (doy - d0)) / (d1 - d0)
    }
  return outside
}

export const kcAt = (c: Crop, doy: number) => interp(c.kc, doy, 0.3)
export const ndviRef = (c: Crop, doy: number) => interp(c.ndvi, doy, NaN)
/** przybliżona relacja NDMI zdrowego łanu do NDVI (Sentinel-2, uprawy polowe) */
export const ndmiRef = (ndvi: number) => 0.68 * ndvi - 0.12
export const inSeason = (c: Crop, doy: number) => doy >= c.season[0] && doy <= c.season[1]

export function phaseAt(c: Crop, doy: number) {
  if (c.sowing && doy >= c.sowing) return 'po siewie — jesienna wegetacja i spoczynek zimowy'
  if (c.sowing && doy < c.season[0]) return 'w spoczynku zimowym'
  if (doy < c.season[0]) return 'przed siewem lub ruszeniem wegetacji'
  if (doy > c.harvest) return 'po zbiorze'
  if (doy >= c.critical[0] && doy <= c.critical[1]) return `okres krytyczny: ${c.criticalName}`
  if (doy < c.critical[0]) return 'wzrost przed okresem krytycznym'
  return 'dojrzewanie'
}

/** Liczba CN zależna od uprawy (USDA TR-55): okopowe w rzędach spływają najbardziej, łąka najmniej. */
export type Hsg = 'A' | 'B' | 'C' | 'D'
const CN_ROW: Record<Hsg, number> = { A: 67, B: 78, C: 85, D: 89 }
const CN_GRAIN: Record<Hsg, number> = { A: 63, B: 75, C: 83, D: 87 }
const CN_MEADOW: Record<Hsg, number> = { A: 30, B: 58, C: 71, D: 78 }
export function cnFor(c: Crop): Record<Hsg, number> {
  return c.id === 'kukurydza' || c.id === 'ziemniak' || c.id === 'burak' ? CN_ROW : c.id === 'laka' ? CN_MEADOW : CN_GRAIN
}
export const cnGroupName = (c: Crop) => (c.id === 'kukurydza' || c.id === 'ziemniak' || c.id === 'burak' ? 'uprawa w rzędach (okopowa)' : c.id === 'laka' ? 'trwała roślinność (łąka)' : 'zboża / rzepak (łan zwarty)')
