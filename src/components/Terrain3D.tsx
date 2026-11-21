import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { Analysis } from '../geo/analyze'
import type { DamResult } from '../geo/hydro'

interface Props {
  A: Analysis
  texture: HTMLCanvasElement
  rain: number
  raining: boolean
  dam: DamResult | null
  damOn: boolean
  focus: number | null
}

interface World {
  renderer: THREE.WebGLRenderer
  labels: CSS2DRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  terrain: THREE.Mesh
  mat: THREE.MeshStandardMaterial
  water: THREE.Group
  marker: THREE.Group
  ex: number
  pos: (cell: number, lift?: number) => THREE.Vector3
  zmin: number
}

const N = 3200

export function Terrain3D({ A, texture, rain, raining, dam, damOn, focus }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const world = useRef<World | null>(null)
  const live = useRef({ rain, raining, damSet: new Set<number>(), damOn, waterT: 0 })
  live.current.rain = rain
  live.current.raining = raining
  live.current.damOn = damOn

  // ---------- scena ----------
  useEffect(() => {
    const el = host.current!
    const { g, z, zmin, zmax, dir, mask, tanb } = A
    const { w, h, res } = g
    const L = Math.max(w, h) * res
    const ex = Math.min(6, Math.max(1.5, (0.1 * L) / Math.max(1, zmax - zmin)))
    const base = -Math.max(8, (zmax - zmin) * ex * 0.25)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)
    const labels = new CSS2DRenderer()
    labels.setSize(el.clientWidth, el.clientHeight)
    labels.domElement.style.position = 'absolute'
    labels.domElement.style.inset = '0'
    labels.domElement.style.pointerEvents = 'none'
    el.appendChild(labels.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0xf6f3ea, L * 1.6, L * 3.6)
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 1, L * 10)
    camera.position.set(-L * 0.42, L * 0.52, L * 0.78)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI * 0.47
    controls.minDistance = L * 0.2
    controls.maxDistance = L * 2.2
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.35
    controls.addEventListener('start', () => (controls.autoRotate = false))

    scene.add(new THREE.HemisphereLight(0xd8efff, 0x3a2a1a, 1.25))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(-L, L * 1.1, -L * 0.4)
    scene.add(sun)

    // teren
    // gładka powierzchnia: siatka zagęszczona (interpolacja dwuliniowa), gdy model terenu jest rzadki (np. 10–30 m)
    const F = Math.max(1, Math.min(6, Math.round(Math.sqrt(160000 / (w * h)))))
    const W2 = (w - 1) * F + 1, H2 = (h - 1) * F + 1
    const geo = new THREE.PlaneGeometry((w - 1) * res, (h - 1) * res, W2 - 1, H2 - 1)
    geo.rotateX(-Math.PI / 2)
    const P = geo.attributes.position as THREE.BufferAttribute
    for (let r = 0; r < H2; r++)
      for (let c = 0; c < W2; c++) {
        const fr = r / F, fc = c / F
        const r0 = Math.min(h - 2, Math.floor(fr)), c0 = Math.min(w - 2, Math.floor(fc))
        const tr = fr - r0, tc = fc - c0
        const Z = (rr: number, cc: number) => z[rr * w + cc]
        const v = (Z(r0, c0) * (1 - tc) + Z(r0, c0 + 1) * tc) * (1 - tr) + (Z(r0 + 1, c0) * (1 - tc) + Z(r0 + 1, c0 + 1) * tc) * tr
        P.setY(r * W2 + c, (v - zmin) * ex)
      }
    geo.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 })
    const terrain = new THREE.Mesh(geo, mat)
    scene.add(terrain)

    // „makieta”: ścianki boczne
    const skirt: number[] = []
    const edge = (i: number) => [P.getX(i), P.getY(i), P.getZ(i)]
    const side = (ids: number[]) => {
      for (let k = 1; k < ids.length; k++) {
        const [ax, ay, az] = edge(ids[k - 1]), [bx, by, bz] = edge(ids[k])
        skirt.push(ax, ay, az, bx, by, bz, ax, base, az, bx, by, bz, bx, base, bz, ax, base, az)
      }
    }
    const top = [...Array(W2).keys()], bottom = top.map((c) => (H2 - 1) * W2 + c)
    const left = [...Array(H2).keys()].map((r) => r * W2), right = left.map((i) => i + W2 - 1)
    side(top); side(bottom.reverse()); side(left.reverse()); side(right)
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.Float32BufferAttribute(skirt, 3))
    sg.computeVertexNormals()
    scene.add(new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x8a6a48, side: THREE.DoubleSide, roughness: 1 })))
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(L * 6, L * 6), new THREE.MeshBasicMaterial({ color: 0xf6f3ea }))
    floor.rotation.x = -Math.PI / 2
    floor.position.y = base - 0.5
    scene.add(floor)

    const pos = (cell: number, lift = 0) => {
      const r = (cell / w) | 0, c = cell - r * w
      return new THREE.Vector3((c - (w - 1) / 2) * res, (z[cell] - zmin) * ex + lift, (r - (h - 1) / 2) * res)
    }

    // punkty wyjścia wody
    A.exits.forEach((e, k) => {
      const div = document.createElement('div')
      div.className = 'exit-label'
      div.innerHTML = `<span class="dot"></span><b>${Math.round(e.share * 100)}%</b> wody ucieka${k === 0 ? ' tędy' : ''}`
      const o = new CSS2DObject(div)
      o.position.copy(pos(e.cell, 6 * ex))
      scene.add(o)
      // linia dalszej drogi wody
      const pts = e.path.filter((_, i) => i % 2 === 0).map((c) => pos(c, 0.8))
      if (pts.length > 1) {
        const lg = new THREE.BufferGeometry().setFromPoints(pts)
        scene.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xb3261e, transparent: true, opacity: 0.95 })))
      }
    })

    const water = new THREE.Group()
    scene.add(water)
    const marker = new THREE.Group()
    scene.add(marker)

    // ---------- cząsteczki wody ----------
    const pcell = new Int32Array(N).fill(-1)
    const pnext = new Int32Array(N).fill(-1)
    const pt = new Float32Array(N)
    const pout = new Uint8Array(N)
    const psteps = new Int32Array(N)
    const ppos = new Float32Array(N * 3).fill(-1e5)
    const pcol = new Float32Array(N * 3)
    const parcelCells: number[] = []
    for (let i = 0; i < mask.length; i++) if (mask[i]) parcelCells.push(i)
    const pg = new THREE.BufferGeometry()
    pg.setAttribute('position', new THREE.BufferAttribute(ppos, 3))
    pg.setAttribute('color', new THREE.BufferAttribute(pcol, 3))
    const sprite = document.createElement('canvas')
    sprite.width = sprite.height = 32
    const sx = sprite.getContext('2d')!
    const grd = sx.createRadialGradient(16, 16, 0, 16, 16, 16)
    grd.addColorStop(0, 'rgba(255,255,255,1)')
    grd.addColorStop(0.35, 'rgba(255,255,255,0.8)')
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    sx.fillStyle = grd
    sx.fillRect(0, 0, 32, 32)
    const points = new THREE.Points(pg, new THREE.PointsMaterial({
      size: Math.max(3, L / 120), map: new THREE.CanvasTexture(sprite), vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending, opacity: 0.95,
    }))
    scene.add(points)
    const spawn = (k: number) => {
      const c = parcelCells[(Math.random() * parcelCells.length) | 0]
      pcell[k] = c
      pnext[k] = dir[c]
      pt[k] = Math.random()
      pout[k] = 0
      psteps[k] = 0
    }

    // kamera celuje w środek działki
    {
      let sx = 0, sz = 0, sy = 0, n = 0
      for (let i = 0; i < mask.length; i += 3) if (mask[i]) { const v = pos(i); sx += v.x; sy += v.y; sz += v.z; n++ }
      if (n) {
        controls.target.set(sx / n, sy / n, sz / n)
        camera.position.set(sx / n - L * 0.38, sy / n + L * 0.48, sz / n + L * 0.66)
      }
    }

    world.current = { renderer, labels, scene, camera, controls, terrain, mat, water, marker, ex, pos, zmin }

    let raf = 0
    let last = performance.now()
    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const S = live.current
      const active = S.raining ? Math.round(N * Math.min(1, 0.15 + S.rain / 45)) : 0
      for (let k = 0; k < N; k++) {
        if (pcell[k] < 0) {
          if (k < active && Math.random() < 0.04) spawn(k)
          else { ppos[k * 3 + 1] = -1e5; continue }
        }
        const c = pcell[k], n = pnext[k]
        if (n < 0 || psteps[k] > 260 || (S.damOn && S.damSet.has(c))) {
          pcell[k] = -1
          ppos[k * 3 + 1] = -1e5
          continue
        }
        const v = 18 + 420 * Math.sqrt(tanb[c])
        pt[k] += (v * dt) / res
        while (pt[k] >= 1 && pnext[k] >= 0) {
          pt[k] -= 1
          pcell[k] = pnext[k]
          pnext[k] = dir[pcell[k]]
          psteps[k]++
          if (!mask[pcell[k]]) pout[k] = 1
        }
        const a = pos(pcell[k], 0.7), b = pnext[k] >= 0 ? pos(pnext[k], 0.7) : a
        tmp.copy(a).lerp(b, Math.min(1, pt[k]))
        ppos[k * 3] = tmp.x
        ppos[k * 3 + 1] = tmp.y
        ppos[k * 3 + 2] = tmp.z
        if (pout[k]) { pcol[k * 3] = 0.85; pcol[k * 3 + 1] = 0.15; pcol[k * 3 + 2] = 0.12 }
        else { pcol[k * 3] = 0.25; pcol[k * 3 + 1] = 0.75; pcol[k * 3 + 2] = 1 }
      }
      pg.attributes.position.needsUpdate = true
      pg.attributes.color.needsUpdate = true

      // podnoszenie lustra wody za zastawką
      const target = S.damOn ? 1 : 0
      S.waterT += (target - S.waterT) * Math.min(1, dt * 0.9)
      const wm = water.children[0] as THREE.Mesh | undefined
      if (wm) {
        const depth = (wm.userData.depth as number) ?? 1
        wm.position.y = -(1 - S.waterT) * depth * ex - 0.05
        wm.visible = S.waterT > 0.02
      }
      void tmp2
      controls.update()
      renderer.render(scene, camera)
      labels.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    const ro = new ResizeObserver(() => {
      const W = el.clientWidth, H = el.clientHeight
      renderer.setSize(W, H)
      labels.setSize(W, H)
      camera.aspect = W / H
      camera.updateProjectionMatrix()
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      geo.dispose()
      el.innerHTML = ''
      world.current = null
    }
  }, [A])

  // ---------- tekstura ----------
  useEffect(() => {
    const W = world.current
    if (!W) return
    const t = new THREE.CanvasTexture(texture)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    const old = W.mat.map
    W.mat.map = t
    W.mat.needsUpdate = true
    old?.dispose()
  }, [texture, A])

  // ---------- zastawka i woda ----------
  useEffect(() => {
    const W = world.current
    if (!W) return
    W.water.clear()
    live.current.damSet = new Set(dam ? Array.from(dam.cells) : [])
    if (!dam || !dam.cells.length) return
    const { g } = A
    const { w, h, res } = g
    const y = (dam.crest - W.zmin) * W.ex
    const verts: number[] = []
    const hr = res / 2
    for (const i of dam.cells) {
      const r = (i / w) | 0, c = i - r * w
      const X = (c - (w - 1) / 2) * res, Z = (r - (h - 1) / 2) * res
      verts.push(X - hr, y, Z - hr, X - hr, y, Z + hr, X + hr, y, Z + hr, X - hr, y, Z - hr, X + hr, y, Z + hr, X + hr, y, Z - hr)
    }
    const wg = new THREE.BufferGeometry()
    wg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    wg.computeVertexNormals()
    const wm = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0e7490, emissiveIntensity: 0.6, transparent: true, opacity: 0.82, roughness: 0.15, metalness: 0.1 }))
    let maxDepth = 0
    for (const d of dam.depth) maxDepth = Math.max(maxDepth, d)
    wm.userData.depth = maxDepth
    W.water.add(wm)
    // sama zastawka
    const p = W.pos(dam.cell)
    const r = (dam.cell / w) | 0, c = dam.cell - r * w
    const n = A.dir[dam.cell]
    let ang = 0
    if (n >= 0) {
      const nr = (n / w) | 0, nc = n - nr * w
      ang = Math.atan2(nr - r, nc - c)
    }
    const hh = (dam.crest - A.z[dam.cell]) * W.ex
    const box = new THREE.Mesh(new THREE.BoxGeometry(res * 1.2, hh + 1.5, res * 7), new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0x9f1239, emissiveIntensity: 0.5 }))
    box.position.set(p.x, p.y + hh / 2 - 0.5, p.z)
    box.rotation.y = -ang
    box.visible = damOn
    W.water.add(box)
  }, [dam, A, damOn])

  // ---------- znacznik wybranej interwencji ----------
  useEffect(() => {
    const W = world.current
    if (!W) return
    W.marker.clear()
    if (focus === null || focus < 0) return
    const p = W.pos(focus)
    const L = Math.max(A.g.w, A.g.h) * A.g.res
    const cone = new THREE.Mesh(new THREE.ConeGeometry(L / 90, L / 30, 24), new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xa16207, emissiveIntensity: 0.6 }))
    cone.rotation.x = Math.PI
    cone.position.set(p.x, p.y + L / 40, p.z)
    W.marker.add(cone)
  }, [focus, A])

  return <div ref={host} className="relative h-full w-full" />
}
