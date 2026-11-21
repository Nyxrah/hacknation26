// Mapa wyboru działki — czysty Leaflet (BSD-2-Clause), bez dodatkowych wrapperów.
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { toLatLng } from '../geo/crs'
import type { Parcel } from '../geo/types'

export function ParcelMap({ parcel, onPick }: { parcel: Parcel | null; onPick: (lat: number, lng: number) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const poly = useRef<L.Polygon | null>(null)
  const pick = useRef(onPick)
  pick.current = onPick

  useEffect(() => {
    const m = L.map(el.current!, { center: [52.0, 19.2], zoom: 6 })
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri World Imagery' }).addTo(m)
    L.tileLayer.wms('https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow', {
      layers: 'dzialki,numery_dzialek', format: 'image/png', transparent: true, version: '1.1.1', minZoom: 15, opacity: 0.9, attribution: 'działki: KIEG GUGiK',
    }).addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => pick.current(e.latlng.lat, e.latlng.lng))
    map.current = m
    return () => { m.remove(); map.current = null }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m) return
    poly.current?.remove()
    if (!parcel) return
    const ll = parcel.ring.map((p) => toLatLng(p))
    poly.current = L.polygon(ll, { color: '#facc15', weight: 3, fillOpacity: 0.15 }).addTo(m)
    m.flyToBounds(L.latLngBounds(ll), { padding: [50, 50], duration: 1, maxZoom: 17 })
  }, [parcel])

  return <div ref={el} className="h-full w-full" />
}
