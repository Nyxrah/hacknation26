// Warstwy rastrowe → canvas (tekstury modelu 3D i mapy 2D).
import type { Analysis } from './analyze.ts'

export type Layer = 'orto' | 'twi' | 'ndmi' | 'flow' | 'proof'

type RGB = [number, number, number]
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
function ramp(stops: string[]) {
  const cs = stops.map(hex)
  return (t: number): RGB => {
    t = Math.min(1, Math.max(0, t)) * (cs.length - 1)
    const i = Math.min(cs.length - 2, Math.floor(t)), f = t - i
    return [0, 1, 2].map((k) => cs[i][k] + (cs[i + 1][k] - cs[i][k]) * f) as RGB
  }
}
export const TWI_RAMP = ramp(['#7c2d12', '#c2410c', '#fbbf24', '#a7f3d0', '#22d3ee', '#1d4ed8'])
export const NDMI_RAMP = ramp(['#b91c1c', '#f97316', '#facc15', '#84cc16', '#15803d'])

export function hillshade(A: Analysis) {
  const { z, g } = A
  const { w, h, res } = g
  const out = new Float32Array(w * h)
  const az = (315 * Math.PI) / 180, alt = (40 * Math.PI) / 180
  const Z = (r: number, c: number) => z[Math.min(h - 1, Math.max(0, r)) * w + Math.min(w - 1, Math.max(0, c))]
  const ex = 3
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const dzdx = ((Z(r, c + 1) - Z(r, c - 1)) / (2 * res)) * ex
      const dzdy = ((Z(r + 1, c) - Z(r - 1, c)) / (2 * res)) * ex
      const slope = Math.atan(Math.hypot(dzdx, dzdy))
      const aspect = Math.atan2(dzdy, -dzdx)
      out[r * w + c] = Math.max(0, Math.cos(alt) * Math.cos(slope) + Math.sin(alt) * Math.sin(slope) * Math.cos(az - aspect))
    }
  return out
}

function percentiles(v: ArrayLike<number>, mask?: Uint8Array) {
  const a: number[] = []
  for (let i = 0; i < v.length; i++) if ((!mask || mask[i]) && Number.isFinite(v[i])) a.push(v[i])
  a.sort((x, y) => x - y)
  return [a[Math.floor(a.length * 0.03)] ?? 0, a[Math.floor(a.length * 0.97)] ?? 1]
}

export interface TexOpts {
  ortho?: HTMLImageElement | null
  shade: Float32Array
  highlight?: Int32Array | null
  highlightColor?: string
  scale?: number
  outline?: boolean
  channels?: boolean
  ndmiYear?: number
}

/** Rysuje warstwę na canvasie w rozdzielczości siatki × scale. */
export function drawLayer(A: Analysis, layer: Layer, o: TexOpts): HTMLCanvasElement {
  const { g, mask } = A
  const { w, h } = g
  const S = o.scale ?? 2
  const base = document.createElement('canvas')
  base.width = w
  base.height = h
  const bx = base.getContext('2d')!
  const img = bx.createImageData(w, h)
  const px = img.data
  const shade = o.shade
  const put = (i: number, c: RGB, s = 1, a = 255) => {
    px[i * 4] = c[0] * s
    px[i * 4 + 1] = c[1] * s
    px[i * 4 + 2] = c[2] * s
    px[i * 4 + 3] = a
  }

  if (layer === 'twi') {
    const [lo, hi] = percentiles(A.twi)
    for (let i = 0; i < w * h; i++) put(i, TWI_RAMP((A.twi[i] - lo) / (hi - lo)), 0.55 + 0.45 * shade[i])
  } else if (layer === 'ndmi') {
    const sc = A.raw.ndmi.find((s) => s.year === (o.ndmiYear ?? 2018)) ?? A.raw.ndmi[0]
    const [lo, hi] = sc ? percentiles(sc.grid.data, mask) : [0, 1]
    for (let i = 0; i < w * h; i++) {
      const v = sc?.grid.data[i]
      if (v === undefined || Number.isNaN(v)) put(i, [60, 66, 74], 0.4 + 0.6 * shade[i])
      else put(i, NDMI_RAMP((v - lo) / (hi - lo)), (0.6 + 0.4 * shade[i]) * (mask[i] ? 1 : 0.55))
    }
  } else if (layer === 'flow') {
    for (let i = 0; i < w * h; i++) {
      const a = Math.log10(A.acc[i])
      const t = Math.min(1, Math.max(0, (a - 1.2) / 2.6))
      const s = 0.18 + 0.5 * shade[i]
      put(i, [12 + 20 * s + 30 * t * t, 22 + 40 * s + 200 * t * t, 34 + 60 * s + 220 * t * t])
    }
  } else if (layer === 'proof') {
    const v = A.validation
    for (let i = 0; i < w * h; i++) {
      const k = v.modelDry[i]
      const s = 0.45 + 0.55 * shade[i]
      put(i, k === 1 ? [249, 115, 22] : k === 2 ? [34, 211, 238] : k === 3 ? [100, 116, 139] : [30, 41, 59], s)
    }
  } else {
    for (let i = 0; i < w * h; i++) put(i, [70, 80, 60], 0.3 + 0.7 * shade[i])
  }
  bx.putImageData(img, 0, 0)

  const cv = document.createElement('canvas')
  cv.width = w * S
  cv.height = h * S
  const cx = cv.getContext('2d')!
  cx.imageSmoothingEnabled = true
  if (layer === 'orto' && o.ortho) {
    cx.drawImage(o.ortho, 0, 0, cv.width, cv.height)
    // delikatne cieniowanie rzeźby na ortofoto
    cx.globalAlpha = 0.25
    cx.globalCompositeOperation = 'multiply'
    cx.drawImage(base, 0, 0, cv.width, cv.height)
    cx.globalAlpha = 1
    cx.globalCompositeOperation = 'source-over'
  } else cx.drawImage(base, 0, 0, cv.width, cv.height)

  if (o.channels !== false && layer !== 'flow') {
    cx.fillStyle = 'rgba(103,232,249,0.55)'
    for (let i = 0; i < w * h; i++) if (A.channel[i]) {
      const r = (i / w) | 0, c = i - r * w
      cx.fillRect(c * S, r * S, S, S)
    }
  }
  if (o.highlight?.length) {
    cx.fillStyle = o.highlightColor ?? 'rgba(250,204,21,0.75)'
    for (const i of o.highlight) {
      const r = (i / w) | 0, c = i - r * w
      cx.fillRect(c * S, r * S, S, S)
    }
  }
  if (o.outline !== false) {
    cx.beginPath()
    A.raw.parcel.ring.forEach(([x, y], k) => {
      const X = ((x - g.x0) / g.res) * S, Y = ((g.y0 - y) / g.res) * S
      if (k) cx.lineTo(X, Y)
      else cx.moveTo(X, Y)
    })
    cx.closePath()
    cx.lineWidth = 3 * (S / 2)
    cx.strokeStyle = '#ffffff'
    cx.shadowColor = 'rgba(0,0,0,0.6)'
    cx.shadowBlur = 6
    cx.stroke()
    cx.shadowBlur = 0
  }
  return cv
}

/** Wycinek z ramką działki (do widoku podzielonego i paszportu). */
export function cropToParcel(A: Analysis, cv: HTMLCanvasElement, pad = 25, S = 2) {
  const { g } = A
  const xs = A.raw.parcel.ring.map((p) => p[0]), ys = A.raw.parcel.ring.map((p) => p[1])
  const c0 = Math.max(0, ((Math.min(...xs) - pad - g.x0) / g.res) * S)
  const c1 = Math.min(cv.width, ((Math.max(...xs) + pad - g.x0) / g.res) * S)
  const r0 = Math.max(0, ((g.y0 - Math.max(...ys) - pad) / g.res) * S)
  const r1 = Math.min(cv.height, ((g.y0 - Math.min(...ys) + pad) / g.res) * S)
  const out = document.createElement('canvas')
  out.width = Math.round(c1 - c0)
  out.height = Math.round(r1 - r0)
  out.getContext('2d')!.drawImage(cv, c0, r0, c1 - c0, r1 - r0, 0, 0, out.width, out.height)
  return out
}

export function satDryCanvas(A: Analysis, shade: Float32Array) {
  // strefy wg satelity: tercyle NDMI 2018 w blokach 20 m
  const fake = { ...A, validation: { ...A.validation, modelDry: A.validation.satDry } }
  return drawLayer(fake as Analysis, 'proof', { shade, channels: false })
}
