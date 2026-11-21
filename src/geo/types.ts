export type XY = [number, number]

/** Siatka rastrowa w EPSG:2180. Komórka (r, c) ma środek w (x0 + (c+.5)·res, y0 − (r+.5)·res). */
export interface Grid {
  w: number
  h: number
  x0: number // zachodnia krawędź (E)
  y0: number // północna krawędź (N)
  res: number
  data: Float32Array
}

export interface Parcel {
  id: string
  ring: XY[] // EPSG:2180
  voivodeship?: string
  county?: string
  commune?: string
  region?: string
  number?: string
}

export interface NdmiScene {
  year: number
  date: string
  sceneId: string
  cloud: number
  grid: Grid // NDMI, NaN = brak (chmury/cień)
  ndvi?: Grid // NDVI (B8A, B04)
  validShare?: number // udział działki bez chmur
}

export interface RawInputs {
  parcel: Parcel
  dem: Grid
  ortho?: string // URL obrazu (bbox = siatka dem)
  ndmi: NdmiScene[]
  rain?: { start: string; p: number[] }
  waterways?: XY[][]
  neighbors?: Parcel[]
  hsg?: 'A' | 'B' | 'C' | 'D'
  lat: number
  lng: number
  cached?: boolean
}
