// Parametry upraw i gleb. Wartości przybliżone na podstawie FAO-56 (Kc, p, Zr)
// i FAO-33 (Ky). Plony i ceny to orientacyjne wartości demo — do edycji.

export type CropId = 'pszenica' | 'kukurydza' | 'rzepak' | 'ziemniak' | 'burak' | 'tuz'
export type SoilId = 'piasek' | 'piasek_glin' | 'glina' | 'il' | 'torf'

export interface Crop {
  id: CropId
  name: string
  emoji: string
  /** punkty [dzień roku, Kc] — interpolacja liniowa */
  kc: [number, number][]
  zr: number // głębokość korzeni [m]
  p: number // frakcja łatwo dostępnej wody
  ky: number // współczynnik reakcji plonu na niedobór wody
  ym: number // plon potencjalny [t/ha]
  price: number // cena [zł/t]
}

export interface Soil {
  id: SoilId
  name: string
  short: string
  fc: number // pojemność polowa [m3/m3]
  wp: number // punkt trwałego więdnięcia [m3/m3]
  infil: number // dobowa zdolność wsiąkania [mm]
  crMax: number // maks. podsiąk kapilarny z rowu/płytkiej wody [mm/d]
  capture: number // jaka część odpływu drenarskiego da się zatrzymać zastawką
}

export const CROPS: Record<CropId, Crop> = {
  pszenica: {
    id: 'pszenica', name: 'Pszenica ozima', emoji: '🌾',
    kc: [[60, 0.35], [100, 0.55], [135, 1.15], [180, 1.15], [205, 0.4], [212, 0.25]],
    zr: 1.0, p: 0.55, ky: 1.05, ym: 7.5, price: 850,
  },
  kukurydza: {
    id: 'kukurydza', name: 'Kukurydza na ziarno', emoji: '🌽',
    kc: [[115, 0.25], [145, 0.4], [185, 1.2], [235, 1.2], [275, 0.6]],
    zr: 1.0, p: 0.55, ky: 1.25, ym: 9.5, price: 780,
  },
  rzepak: {
    id: 'rzepak', name: 'Rzepak ozimy', emoji: '🌼',
    kc: [[60, 0.4], [95, 0.65], [125, 1.15], [170, 1.1], [195, 0.35]],
    zr: 1.0, p: 0.6, ky: 1.0, ym: 3.6, price: 1900,
  },
  ziemniak: {
    id: 'ziemniak', name: 'Ziemniak', emoji: '🥔',
    kc: [[115, 0.3], [150, 0.6], [180, 1.15], [225, 1.1], [255, 0.7]],
    zr: 0.6, p: 0.35, ky: 1.1, ym: 38, price: 650,
  },
  burak: {
    id: 'burak', name: 'Burak cukrowy', emoji: '🟣',
    kc: [[100, 0.3], [150, 0.6], [190, 1.2], [260, 1.15], [290, 0.8]],
    zr: 1.0, p: 0.55, ky: 1.0, ym: 70, price: 210,
  },
  tuz: {
    id: 'tuz', name: 'Łąka (TUZ)', emoji: '🌿',
    kc: [[80, 0.6], [120, 1.0], [280, 1.0], [300, 0.7]],
    zr: 0.5, p: 0.5, ky: 1.0, ym: 8, price: 450,
  },
}

export const SOILS: Record<SoilId, Soil> = {
  piasek: { id: 'piasek', name: 'Piasek (b. lekka)', short: 'piasek', fc: 0.13, wp: 0.05, infil: 60, crMax: 0.6, capture: 0.45 },
  piasek_glin: { id: 'piasek_glin', name: 'Piasek gliniasty (lekka)', short: 'pg', fc: 0.2, wp: 0.07, infil: 45, crMax: 1.2, capture: 0.6 },
  glina: { id: 'glina', name: 'Glina lekka (średnia)', short: 'gl', fc: 0.29, wp: 0.12, infil: 32, crMax: 1.8, capture: 0.75 },
  il: { id: 'il', name: 'Ił / glina ciężka', short: 'ił', fc: 0.37, wp: 0.21, infil: 22, crMax: 1.0, capture: 0.8 },
  torf: { id: 'torf', name: 'Gleba organiczna (mursz)', short: 'org', fc: 0.5, wp: 0.24, infil: 40, crMax: 2.6, capture: 0.85 },
}

export interface Field {
  id: string
  name: string
  crop: CropId
  soil: SoilId
  gate: string // id zastawki na rowie
  /** offsety wielokąta względem centrum gospodarstwa [dLat, dLng] */
  shape: [number, number][]
}

export interface Farm {
  name: string
  place: string
  lat: number
  lng: number
  fields: Field[]
  /** rów melioracyjny — offsety [dLat, dLng] */
  ditch: [number, number][]
  gates: { id: string; at: [number, number] }[]
}

// Gospodarstwo demo w Wielkopolsce — regionie najmocniej dotkniętym suszą rolniczą.
const RAW_FARM: Farm = {
  name: 'Gospodarstwo demo',
  place: 'okolice Kościana, Wielkopolska',
  lat: 52.1050,
  lng: 16.5600,
  fields: [
    {
      id: 'f1', name: 'Za stodołą', crop: 'pszenica', soil: 'piasek_glin', gate: 'Z-1',
      shape: [[0.0042, -0.0105], [0.0046, -0.0012], [0.0006, -0.0010], [0.0002, -0.0102]],
    },
    {
      id: 'f2', name: 'Przy rowie', crop: 'kukurydza', soil: 'glina', gate: 'Z-2',
      shape: [[0.0001, -0.0101], [0.0005, 0.0032], [-0.0047, 0.0036], [-0.0050, -0.0098]],
    },
    {
      id: 'f3', name: 'Łąka nad Obrą', crop: 'tuz', soil: 'torf', gate: 'Z-3',
      shape: [[0.0045, -0.0008], [0.0049, 0.0098], [0.0009, 0.0101], [0.0007, 0.0034]],
    },
  ],
  ditch: [[0.0062, -0.0125], [0.0025, -0.0112], [0.0004, -0.0040], [0.0006, 0.0040], [-0.0010, 0.0120], [-0.0030, 0.0180]],
  gates: [
    { id: 'Z-1', at: [0.0022, -0.0110] },
    { id: 'Z-2', at: [0.0004, -0.0030] },
    { id: 'Z-3', at: [0.0003, 0.0060] },
  ],
}

// skala geometrii — dopasowanie wielkości pól do typowego gospodarstwa (10–30 ha/pole)
const K = 0.62
const sc = (p: [number, number]): [number, number] => [p[0] * K, p[1] * K]
export const DEMO_FARM: Farm = {
  ...RAW_FARM,
  fields: RAW_FARM.fields.map((f) => ({ ...f, shape: f.shape.map(sc) })),
  ditch: RAW_FARM.ditch.map(sc),
  gates: RAW_FARM.gates.map((g) => ({ ...g, at: sc(g.at) })),
}

export interface Program {
  name: string
  who: string
  what: string
  match: (f: Field) => boolean
}

// Programy wsparcia — opis orientacyjny, warunki i stawki trzeba sprawdzić w aktualnym naborze.
export const PROGRAMS: Program[] = [
  {
    name: 'Ekoschemat: retencjonowanie wody na TUZ',
    who: 'ARiMR · PS WPR 2023–2027',
    what: 'Płatność za utrzymanie zalania/podtopienia łąk i pastwisk przez min. 12 dni w okresie wegetacji.',
    match: (f) => f.crop === 'tuz',
  },
  {
    name: 'Spółka wodna — przejęcie zastawek',
    who: 'gmina · Wody Polskie',
    what: 'Uzgodnienie piętrzenia na rowach szczegółowych; wspólne sterowanie zastawkami dla całej zlewni.',
    match: () => true,
  },
  {
    name: 'Mała retencja i nawadnianie',
    who: 'WFOŚiGW · ARiMR (nabory regionalne)',
    what: 'Dofinansowanie budowy/odbudowy zastawek, zbiorników i oczek wodnych na terenie gospodarstwa.',
    match: (f) => f.soil !== 'torf',
  },
  {
    name: 'Ekoschemat: międzyplony i wymieszanie słomy',
    who: 'ARiMR · PS WPR 2023–2027',
    what: 'Rolnictwo węglowe: praktyki zwiększające materię organiczną i pojemność wodną gleby.',
    match: (f) => f.crop !== 'tuz',
  },
]
