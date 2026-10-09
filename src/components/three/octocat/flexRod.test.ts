import * as THREE from 'three'
import { circleProfile, curvePath, sweep, transportFrames } from 'three-low-poly'
import { describe, expect, it } from 'vitest'
import { applyImpulse } from '@/lib/ship/verlet'
import { FlexRod, InertiaProbe } from './flexRod'

/** Tentáculo de teste: arco no plano xy, raiz na origem, varrido como os do piloto (hexágono afinando). */
const POINTS: [number, number, number][] = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 5) * (Math.PI / 2)
  return [Math.sin(a), 1 - Math.cos(a), 0]
})
const SEGMENTS = 12

function tube() {
  const curve = new THREE.CatmullRomCurve3(POINTS.map((p) => new THREE.Vector3(...p)), false, 'centripetal')
  const stations = transportFrames(curvePath(curve, SEGMENTS), new THREE.Vector3(0, 0, 1))
  const geometry = sweep(circleProfile(1, 6), stations, { scale: (t) => 0.13 - 0.09 * t, cap: true }).toNonIndexed()
  const ts = Array.from({ length: SEGMENTS + 1 }, (_, i) => curve.getUtoTmapping(i / SEGMENTS, 0))
  return { geometry, ts }
}

const positionsOf = (geometry: THREE.BufferGeometry) => Array.from(geometry.attributes.position.array)

describe('FlexRod (malha dobrada pela cadeia)', () => {
  it('na pose de descanso remonta exatamente a malha desenhada', () => {
    const { geometry, ts } = tube()
    const original = positionsOf(geometry)
    const rod = new FlexRod(POINTS, ts, [geometry])
    // força a remontagem mesmo sem movimento
    rod.chain.pos[3] += 1
    rod.sync()
    rod.pose()
    positionsOf(geometry).forEach((v, i) => expect(v).toBeCloseTo(original[i], 5))
  })

  it('a malha segue a cadeia: girar tudo em torno da raiz gira a malha junto', () => {
    const { geometry, ts } = tube()
    const original = positionsOf(geometry)
    const rod = new FlexRod(POINTS, ts, [geometry])
    const [c, s] = [Math.cos(0.4), Math.sin(0.4)]
    for (let i = 0; i < rod.chain.count; i++) {
      const [x, y] = [rod.chain.rest[i * 3], rod.chain.rest[i * 3 + 1]]
      rod.chain.pos[i * 3] = c * x - s * y
      rod.chain.pos[i * 3 + 1] = s * x + c * y
    }
    rod.sync()
    const moved = positionsOf(geometry)
    for (let v = 0; v < moved.length; v += 3) {
      const [x, y, z] = original.slice(v, v + 3)
      expect(moved[v]).toBeCloseTo(c * x - s * y, 3)
      expect(moved[v + 1]).toBeCloseTo(s * x + c * y, 3)
      expect(moved[v + 2]).toBeCloseTo(z, 3)
    }
    // e a ponta acompanha o último nó
    const tip = rod.tip(new THREE.Vector3())
    expect(tip.distanceTo(new THREE.Vector3().fromArray(rod.chain.pos, (rod.chain.count - 1) * 3))).toBeLessThan(1e-5)
  })

  it('balança com um tranco e assenta de volta na malha original', () => {
    const { geometry, ts } = tube()
    const original = positionsOf(geometry)
    const rod = new FlexRod(POINTS, ts, [geometry], { stiffness: 120, damping: 4 })
    applyImpulse(rod.chain, 2, 2, 1)
    const still = { linear: [0, 0, 0], angular: [0, 0, 0] } as const
    rod.step(0.1, still)
    const swing = Math.max(...positionsOf(geometry).map((v, i) => Math.abs(v - original[i])))
    expect(swing).toBeGreaterThan(0.05)
    for (let k = 0; k < 300; k++) rod.step(1 / 60, still)
    positionsOf(geometry).forEach((v, i) => expect(v).toBeCloseTo(original[i], 3))
  })
})

describe('InertiaProbe', () => {
  const probe = () => new InertiaProbe({ gain: 1, maxLinear: 1e6, angularGain: 1, maxAngular: 1e6, smoothing: 1e-6 })

  it('acelerar em +x no mundo empurra a cadeia para −x no referencial local (girado)', () => {
    const sonda = probe()
    const object = new THREE.Object3D()
    object.rotation.y = Math.PI / 2 // o +z local aponta para o +x do mundo
    object.scale.setScalar(0.5)
    const dt = 1 / 60
    for (let k = 0; k < 4; k++) {
      const t = k * dt
      object.position.set(5 * t * t, 0, 0) // a = 10 no mundo
      object.updateMatrixWorld()
      sonda.sample(object, dt)
    }
    const [x, y, z] = sonda.input.linear
    // −a, no local, em unidades locais: 10 / 0,5 = 20 ao longo de −z local
    expect(z).toBeCloseTo(-20, 1)
    expect(Math.abs(x) + Math.abs(y)).toBeLessThan(1e-3)
  })

  it('parado (ou em velocidade constante) não sente nada', () => {
    const sonda = probe()
    const object = new THREE.Object3D()
    for (let k = 0; k < 5; k++) {
      object.position.set(k * 0.3, 0, 0)
      object.updateMatrixWorld()
      sonda.sample(object, 1 / 60)
    }
    expect(Math.hypot(...sonda.input.linear)).toBeLessThan(1e-3)
    expect(Math.hypot(...sonda.input.angular)).toBeLessThan(1e-3)
  })

  it('em viagem rápida (dezenas de unidades por quadro) ainda sente a aceleração', () => {
    const sonda = probe()
    const object = new THREE.Object3D()
    const dt = 1 / 60
    for (let k = 0; k < 5; k++) {
      const t = k * dt
      object.position.set(3000 * t + 15 * t * t, 0, 0) // 50 unidades por quadro, a = 30
      object.updateMatrixWorld()
      sonda.sample(object, dt)
    }
    expect(sonda.input.linear[0]).toBeCloseTo(-30, 0)
  })

  it('um salto grande não vira tranco', () => {
    const sonda = probe()
    const object = new THREE.Object3D()
    for (const x of [0, 0, 0, 500, 500]) {
      object.position.set(x, 0, 0)
      object.updateMatrixWorld()
      sonda.sample(object, 1 / 60)
    }
    expect(Math.hypot(...sonda.input.linear)).toBe(0)
  })

  it('satura suavemente as acelerações enormes', () => {
    const sonda = new InertiaProbe({ gain: 1, maxLinear: 10, angularGain: 1, maxAngular: 2, smoothing: 1e-6 })
    const object = new THREE.Object3D()
    const dt = 1 / 60
    for (let k = 0; k < 4; k++) {
      object.position.set(1000 * (k * dt) ** 2, 0, 0)
      object.rotation.z = 50 * (k * dt) ** 2
      object.updateMatrixWorld()
      sonda.sample(object, dt)
    }
    expect(Math.hypot(...sonda.input.linear)).toBeLessThan(10)
    expect(Math.hypot(...sonda.input.linear)).toBeGreaterThan(9)
    // aceleração angular em z (100 rad/s²) saturada abaixo de 2
    expect(sonda.input.angular[2]).toBeGreaterThan(1.9)
    expect(sonda.input.angular[2]).toBeLessThan(2)
  })
})
