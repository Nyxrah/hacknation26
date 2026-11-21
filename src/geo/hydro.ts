// Analiza spływu na NMT: wypełnienie zagłębień → kierunek D8 → akumulacja → TWI
// → punkty wyjścia wody z działki → symulacja zastawki (piętrzenie do rzędnej korony).
import type { Grid, XY } from './types.ts'

const DR = [-1, -1, 0, 1, 1, 1, 0, -1]
const DC = [0, 1, 1, 1, 0, -1, -1, -1]
const DIST = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2]

// ---------- kopiec min po wartości ----------
class MinHeap {
  idx: Int32Array
  key: Float32Array
  n = 0
  constructor(cap: number) {
    this.idx = new Int32Array(cap)
    this.key = new Float32Array(cap)
  }
  push(i: number, k: number) {
    let p = this.n++
    while (p > 0) {
      const q = (p - 1) >> 1
      if (this.key[q] <= k) break
      this.idx[p] = this.idx[q]
      this.key[p] = this.key[q]
      p = q
    }
    this.idx[p] = i
    this.key[p] = k
  }
  pop(): number {
    const top = this.idx[0]
    const li = this.idx[--this.n]
    const lk = this.key[this.n]
    let p = 0
    for (;;) {
      let c = 2 * p + 1
      if (c >= this.n) break
      if (c + 1 < this.n && this.key[c + 1] < this.key[c]) c++
      if (this.key[c] >= lk) break
      this.idx[p] = this.idx[c]
      this.key[p] = this.key[c]
      p = c
    }
    this.idx[p] = li
    this.key[p] = lk
    return top
  }
}

/** Priority-flood (Barnes 2014) z epsilonem — usuwa zagłębienia bezodpływowe, zachowując spadek na płaskich. */
export function fillDepressions(z: Float32Array, w: number, h: number, eps = 1e-3): Float32Array {
  const f = Float32Array.from(z)
  const closed = new Uint8Array(w * h)
  const heap = new MinHeap(w * h)
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++)
      if (r === 0 || c === 0 || r === h - 1 || c === w - 1) {
        const i = r * w + c
        closed[i] = 1
        heap.push(i, f[i])
      }
  while (heap.n) {
    const i = heap.pop()
    const r = (i / w) | 0, c = i - r * w
    for (let k = 0; k < 8; k++) {
      const rr = r + DR[k], cc = c + DC[k]
      if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue
      const j = rr * w + cc
      if (closed[j]) continue
      closed[j] = 1
      if (f[j] <= f[i]) f[j] = f[i] + eps
      heap.push(j, f[j])
    }
  }
  return f
}

/** Kierunek D8: indeks komórki odbiorczej albo −1 (wypływ poza siatkę). */
export function flowDirD8(f: Float32Array, w: number, h: number): Int32Array {
  const dir = new Int32Array(w * h).fill(-1)
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const i = r * w + c
      let best = 0, bj = -1
      for (let k = 0; k < 8; k++) {
        const rr = r + DR[k], cc = c + DC[k]
        if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue
        const j = rr * w + cc
        const s = (f[i] - f[j]) / DIST[k]
        if (s > best) { best = s; bj = j }
      }
      dir[i] = bj
    }
  return dir
}

/** Akumulacja spływu (liczba komórek, ewentualnie z wagami) — sortowanie topologiczne. */
export function accumulate(dir: Int32Array, weight?: Float32Array | Uint8Array): Float32Array {
  const n = dir.length
  const acc = new Float32Array(n)
  const indeg = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    acc[i] = weight ? weight[i] : 1
    if (dir[i] >= 0) indeg[dir[i]]++
  }
  const q = new Int32Array(n)
  let qh = 0, qt = 0
  for (let i = 0; i < n; i++) if (!indeg[i]) q[qt++] = i
  while (qh < qt) {
    const i = q[qh++]
    const j = dir[i]
    if (j >= 0) {
      acc[j] += acc[i]
      if (--indeg[j] === 0) q[qt++] = j
    }
  }
  return acc
}

/** Spadek (tan β) metodą Horna. */
export function slopeTan(z: Float32Array, w: number, h: number, res: number): Float32Array {
  const s = new Float32Array(w * h)
  const Z = (r: number, c: number) => z[Math.min(h - 1, Math.max(0, r)) * w + Math.min(w - 1, Math.max(0, c))]
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const dzdx = ((Z(r - 1, c + 1) + 2 * Z(r, c + 1) + Z(r + 1, c + 1)) - (Z(r - 1, c - 1) + 2 * Z(r, c - 1) + Z(r + 1, c - 1))) / (8 * res)
      const dzdy = ((Z(r + 1, c - 1) + 2 * Z(r + 1, c) + Z(r + 1, c + 1)) - (Z(r - 1, c - 1) + 2 * Z(r - 1, c) + Z(r - 1, c + 1))) / (8 * res)
      s[r * w + c] = Math.hypot(dzdx, dzdy)
    }
  return s
}

/** Topographic Wetness Index: TWI = ln(a / tan β), a = zlewnia jednostkowa [m²/m]. */
export function twiOf(acc: Float32Array, tanb: Float32Array, res: number): Float32Array {
  const t = new Float32Array(acc.length)
  for (let i = 0; i < acc.length; i++) t[i] = Math.log((acc[i] * res) / Math.max(tanb[i], 0.002))
  return t
}

/** Rasteryzacja wielokąta (środki komórek). */
export function rasterize(ring: XY[], g: Omit<Grid, 'data'>): Uint8Array {
  const m = new Uint8Array(g.w * g.h)
  const xs: number[] = []
  for (let r = 0; r < g.h; r++) {
    const y = g.y0 - (r + 0.5) * g.res
    xs.length = 0
    for (let k = 0, l = ring.length - 1; k < ring.length; l = k++) {
      const [x1, y1] = ring[k], [x2, y2] = ring[l]
      if ((y1 > y) !== (y2 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1))
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - g.x0) / g.res - 0.5))
      const c1 = Math.min(g.w - 1, Math.floor((xs[k + 1] - g.x0) / g.res - 0.5))
      for (let c = c0; c <= c1; c++) m[r * g.w + c] = 1
    }
  }
  return m
}

/** Rasteryzacja linii (rowy). */
export function burnLines(lines: XY[][], g: Omit<Grid, 'data'>): Uint8Array {
  const m = new Uint8Array(g.w * g.h)
  for (const ln of lines)
    for (let k = 1; k < ln.length; k++) {
      const [x1, y1] = ln[k - 1], [x2, y2] = ln[k]
      const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (g.res * 0.5)) + 1
      for (let s = 0; s <= steps; s++) {
        const x = x1 + ((x2 - x1) * s) / steps, y = y1 + ((y2 - y1) * s) / steps
        const c = Math.floor((x - g.x0) / g.res), r = Math.floor((g.y0 - y) / g.res)
        if (r >= 0 && c >= 0 && r < g.h && c < g.w) m[r * g.w + c] = 1
      }
    }
  return m
}

/** Przybliżona odległość (w komórkach) od maski — chamfer 3-4. */
export function distanceFrom(mask: Uint8Array, w: number, h: number): Float32Array {
  const d = new Float32Array(w * h).fill(1e9)
  for (let i = 0; i < d.length; i++) if (mask[i]) d[i] = 0
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const i = r * w + c
      if (c > 0) d[i] = Math.min(d[i], d[i - 1] + 1)
      if (r > 0) {
        d[i] = Math.min(d[i], d[i - w] + 1)
        if (c > 0) d[i] = Math.min(d[i], d[i - w - 1] + 1.414)
        if (c < w - 1) d[i] = Math.min(d[i], d[i - w + 1] + 1.414)
      }
    }
  for (let r = h - 1; r >= 0; r--)
    for (let c = w - 1; c >= 0; c--) {
      const i = r * w + c
      if (c < w - 1) d[i] = Math.min(d[i], d[i + 1] + 1)
      if (r < h - 1) {
        d[i] = Math.min(d[i], d[i + w] + 1)
        if (c < w - 1) d[i] = Math.min(d[i], d[i + w + 1] + 1.414)
        if (c > 0) d[i] = Math.min(d[i], d[i + w - 1] + 1.414)
      }
    }
  return d
}

export interface DamResult {
  cell: number
  crest: number
  volume: number // m³
  cells: Int32Array // zalane komórki
  depth: Float32Array // głębokość wody w zalanych komórkach
  inParcel: number
}

/** Zastawka w komórce `cell` o wysokości h: wypełniamy teren w górę cieku do rzędnej korony. */
export function simulateDam(z: Float32Array, dir: Int32Array, w: number, h: number, res: number, cell: number, hgt: number, mask?: Uint8Array, maxCells = 40000): DamResult {
  const crest = z[cell] + hgt
  // bez zastawki woda w zagłębieniach i tak stoi do poziomu odpływu (z[cell]) — liczymy tylko przyrost
  const base = z[cell]
  const seen = new Uint8Array(w * h)
  const q: number[] = [cell]
  seen[cell] = 1
  let vol = 0, inParcel = 0
  const out: number[] = []
  const dep: number[] = []
  for (let qi = 0; qi < q.length && q.length < maxCells; qi++) {
    const i = q[qi]
    const d = crest - Math.max(z[i], base)
    if (d > 0) {
      vol += d * res * res
      out.push(i)
      dep.push(d)
      if (mask?.[i]) inParcel++
    }
    const r = (i / w) | 0, c = i - r * w
    for (let k = 0; k < 8; k++) {
      const rr = r + DR[k], cc = c + DC[k]
      if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue
      const j = rr * w + cc
      if (seen[j] || dir[j] !== i || z[j] >= crest) continue
      seen[j] = 1
      q.push(j)
    }
  }
  return { cell, crest, volume: vol, cells: Int32Array.from(out), depth: Float32Array.from(dep), inParcel }
}

/** SCS-CN: odpływ powierzchniowy [mm] z opadu P [mm]. */
export function scsRunoff(P: number, CN: number) {
  const S = 25400 / CN - 254
  const Ia = 0.2 * S
  return P > Ia ? ((P - Ia) * (P - Ia)) / (P - Ia + S) : 0
}

export const CN_ARABLE: Record<'A' | 'B' | 'C' | 'D', number> = { A: 67, B: 78, C: 85, D: 89 }
export const CN_WOOD: Record<'A' | 'B' | 'C' | 'D', number> = { A: 36, B: 60, C: 73, D: 79 }

export function cellXY(i: number, g: Omit<Grid, 'data'>): XY {
  const r = (i / g.w) | 0, c = i - r * g.w
  return [g.x0 + (c + 0.5) * g.res, g.y0 - (r + 0.5) * g.res]
}

/**
 * Poprawka CN na wilgotność poprzedzającą (SCS, AMC I/II/III) — wg sumy opadów z 5 poprzednich dni.
 * Progi: sezon wegetacyjny 36/53 mm, poza sezonem 13/28 mm (USDA NEH-4).
 */
export function cnAmc(cn: number, p5: number, growing: boolean) {
  const [lo, hi] = growing ? [36, 53] : [13, 28]
  if (p5 < lo) return cn / (2.281 - 0.01281 * cn)
  if (p5 > hi) return Math.min(98, cn / (0.427 + 0.00573 * cn))
  return cn
}

/** dobowy spływ [mm] dla serii opadów z poprawką AMC */
export function runoffSeries(p: number[], cn: number, startDoy: (i: number) => number) {
  const out = new Float32Array(p.length)
  for (let i = 0; i < p.length; i++) {
    let p5 = 0
    for (let k = Math.max(0, i - 5); k < i; k++) p5 += p[k]
    const doy = startDoy(i)
    out[i] = scsRunoff(p[i], cnAmc(cn, p5, doy > 105 && doy < 290))
  }
  return out
}
