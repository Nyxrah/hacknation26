import proj4 from 'proj4'

proj4.defs('EPSG:2180', '+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs')
for (const z of [32, 33, 34, 35]) proj4.defs(`EPSG:326${z}`, `+proj=utm +zone=${z} +datum=WGS84 +units=m +no_defs`)

export type XY = [number, number]

/** EPSG:2180 (E, N) → WGS84 [lat, lng] */
export function toLatLng(p: XY): [number, number] {
  const [lng, lat] = proj4('EPSG:2180', 'EPSG:4326', p)
  return [lat, lng]
}
export function from4326(lat: number, lng: number): XY {
  return proj4('EPSG:4326', 'EPSG:2180', [lng, lat]) as XY
}
export function converter(from: string, to: string) {
  const c = proj4(from, to)
  return (p: XY) => c.forward(p) as XY
}
