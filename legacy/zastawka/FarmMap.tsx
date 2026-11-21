import { useEffect } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import type { Farm } from '../lib/data'
import type { Advice } from '../lib/advisor'
import { LEVEL_COLOR } from './ui'

interface Props {
  farm: Farm
  center: { lat: number; lng: number }
  advices: Record<string, Advice>
  gateOpen: Record<string, boolean>
  selected: string
  onSelect: (id: string) => void
  onRelocate: (lat: number, lng: number) => void
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo([lat, lng], map.getZoom(), { duration: 1.2 })
  }, [lat, lng, map])
  return null
}

function ClickToMove({ onRelocate }: { onRelocate: Props['onRelocate'] }) {
  useMapEvents({
    dblclick(e) {
      onRelocate(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function gateIcon(id: string, open: boolean) {
  const c = open ? '#fbbf24' : '#22d3ee'
  return L.divIcon({
    className: '',
    iconSize: [0, 0],
    html: `<div style="transform:translate(-50%,-50%);display:flex;align-items:center;gap:6px;white-space:nowrap">
      <div class="gate-pulse" style="position:relative;color:${c};width:14px;height:14px;border-radius:9999px;background:${c};box-shadow:0 0 14px ${c}"></div>
      <div style="font:600 10px 'JetBrains Mono',monospace;color:${c};background:rgba(5,13,20,.85);padding:2px 6px;border-radius:6px;border:1px solid ${c}55">
        ${id} · ${open ? 'OTWARTA' : 'ZAMKNIĘTA'}
      </div></div>`,
  })
}

export function FarmMap({ farm, center, advices, gateOpen, selected, onSelect, onRelocate }: Props) {
  const at = (o: [number, number]): [number, number] => [center.lat + o[0], center.lng + o[1]]
  const ditch = farm.ditch.map(at)
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={16}
      doubleClickZoom={false}
      scrollWheelZoom={false}
      zoomControl={false}
      className="h-full w-full"
    >
      <TileLayer
        attribution="Tiles &copy; Esri — World Imagery"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxZoom={18}
      />
      <Recenter lat={center.lat} lng={center.lng} />
      <ClickToMove onRelocate={onRelocate} />

      {farm.fields.map((f) => {
        const adv = advices[f.id]
        const c = adv ? LEVEL_COLOR[adv.level] : '#94a3b8'
        const sel = f.id === selected
        return (
          <Polygon
            key={f.id}
            positions={f.shape.map(at)}
            pathOptions={{ color: c, weight: sel ? 3 : 1.5, fillColor: c, fillOpacity: sel ? 0.32 : 0.14, dashArray: sel ? undefined : '4 4' }}
            eventHandlers={{ click: () => onSelect(f.id) }}
          >
            <Tooltip permanent direction="center" className="field-tip">
              {f.name}
            </Tooltip>
          </Polygon>
        )
      })}

      <Polyline positions={ditch} pathOptions={{ color: '#22d3ee', weight: 10, opacity: 0.18 }} />
      <Polyline positions={ditch} pathOptions={{ color: '#67e8f9', weight: 2.5, opacity: 0.95 }} />

      {farm.gates.map((g) => (
        <Marker key={g.id} position={at(g.at)} icon={gateIcon(g.id, !!gateOpen[g.id])} />
      ))}
    </MapContainer>
  )
}
