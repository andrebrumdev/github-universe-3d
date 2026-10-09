import { describe, expect, it } from 'vitest'
import {
  buildOrbits,
  orbitPosition,
  periapsisAt,
  planetPosition,
  SUN_RADIUS,
  TROJAN_ARC,
  TROJAN_CLOUD_RADIUS,
  TROJAN_LEAD,
  type OrbitSystem,
  type Vec3,
} from './orbits'
import { bodyExtent, MAX_MOONS, MAX_PLANET_RADIUS, MIN_PLANET_RADIUS } from './planets'
import { MAX_TROJANS, systemTrojans, trojanLongitude, trojanPosition, trojanSwarm, type Trojan } from './trojans'

const DEG = Math.PI / 180
const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** Amostra parecida com a pública: 14 repos, 11 com forks, anéis de 3, 5 e 6. */
const SAMPLE = [
  [3, 41, 3], [2.67, 30, 2], [2.34, 12, 2], [2.16, 20, 2], [1.72, 4, 4], [1.61, 6, 2], [1.43, 5, 2],
  [1.3, 3, 1], [1.15, 2, 2], [0.97, 1, 3], [0.86, 1, 2], [0.68, 0, 1], [0.59, 0, 0], [0.45, 0, 0],
].map(([radius, forks, moons], i) => ({ name: `p${i}`, radius, forks, extent: bodyExtent(radius, moons), trojans: forks > 0 }))

const WORST = Array.from({ length: 40 }, (_, i) => ({
  name: `p${i}`,
  radius: MAX_PLANET_RADIUS,
  forks: 100,
  extent: bodyExtent(MAX_PLANET_RADIUS, MAX_MOONS),
  trojans: true,
}))

const MIXED = Array.from({ length: 40 }, (_, i) => {
  const radius = MIN_PLANET_RADIUS + (i % 5) * 0.6
  const forks = i % 3 === 0 ? 0 : i
  return { name: `p${i}`, radius, forks, extent: bodyExtent(radius, i % 7), trojans: forks > 0 }
})

describe('trojanSwarm', () => {
  const system = buildOrbits(SAMPLE)

  it('min(forks, 16) asteroides, metade em L4 e metade em L5; sem forks, nenhum', () => {
    expect(trojanSwarm(system, 11, 0)).toEqual([])
    const five = trojanSwarm(system, 0, 5)
    expect(five.filter((t) => t.side === 1)).toHaveLength(3)
    expect(five.filter((t) => t.side === -1)).toHaveLength(2)
    expect(trojanSwarm(system, 0, 41)).toHaveLength(MAX_TROJANS)
    expect(MAX_TROJANS).toBe(16)
    expect(trojanSwarm(system, 0, 41)).toEqual(trojanSwarm(system, 0, 41))
  })

  it('libração lenta de ±5–10° em volta de L4/L5, sem sair do arco reservado', () => {
    for (const [i, o] of system.orbits.entries()) {
      const ring = system.rings[o.ring]
      for (const tr of trojanSwarm(system, i, SAMPLE[i].forks)) {
        expect(tr.amplitude).toBeGreaterThanOrEqual(5 * DEG)
        expect(tr.amplitude).toBeLessThanOrEqual(10 * DEG)
        // lenta: várias voltas do anel por oscilação
        expect(tr.libration).toBeGreaterThanOrEqual(3 * ring.period)
        let lo = Infinity
        let hi = -Infinity
        for (let s = 0; s < 400; s++) {
          const off = trojanLongitude(tr, (s / 400) * tr.libration) - tr.side * TROJAN_LEAD
          lo = Math.min(lo, off)
          hi = Math.max(hi, off)
        }
        expect(hi - lo).toBeGreaterThan(1.9 * tr.amplitude)
        expect(Math.max(Math.abs(lo), Math.abs(hi))).toBeLessThanOrEqual(TROJAN_ARC + 1e-12)
      }
    }
  })

  it('cada asteroide fica na nuvem: perto do ponto da órbita do planeta, a ±60° (mais a libração) em anomalia média', () => {
    const i = 3
    const o = system.orbits[i]
    const ring = system.rings[o.ring]
    const out: Vec3 = [0, 0, 0]
    for (const tr of trojanSwarm(system, i, 16)) {
      for (const t of [0, 13, 97, 400]) {
        const M = o.phase + (2 * Math.PI * t) / ring.period + trojanLongitude(tr, t)
        const onOrbit = orbitPosition({ ...ring, periapsis: periapsisAt(ring, t) }, M)
        expect(trojanPosition(system, tr, t, out)).toBe(out)
        expect(dist(out, onOrbit) + tr.size).toBeLessThanOrEqual(TROJAN_CLOUD_RADIUS + 1e-9)
      }
    }
  })
})

describe('troianos e o espaçamento dos anéis', () => {
  it('anel sem troianos mantém os planetas espaçados por igual', () => {
    const { orbits } = buildOrbits(SAMPLE.map((p) => ({ ...p, trojans: false })))
    const ring1 = orbits.filter((o) => o.ring === 1).map((o) => o.phase)
    for (let i = 1; i < ring1.length; i++) expect(ring1[i] - ring1[i - 1]).toBeCloseTo((2 * Math.PI) / ring1.length, 12)
  })

  it('o alcance do anel cobre a nuvem dos troianos (anéis vizinhos continuam separados)', () => {
    const tiny = buildOrbits(Array.from({ length: 3 }, (_, i) => ({ name: `t${i}`, radius: MIN_PLANET_RADIUS, trojans: true })))
    expect(tiny.rings[0].maxRadius).toBeGreaterThanOrEqual(TROJAN_CLOUD_RADIUS)
  })

  it.each([
    ['amostra (anéis de 3, 5 e 6)', SAMPLE],
    ['40 máximos com 6 luas, todos com forks', WORST],
    ['40 mistos', MIXED],
  ])('%s: nenhum troiano encosta em planeta nenhum (alcance com luas) nem no sol (menor folga)', (_, planets) => {
    const system: OrbitSystem = buildOrbits(planets)
    const trojans: Trojan[] = systemTrojans(system, planets.map((p) => p.forks))
    expect(trojans.length).toBeGreaterThan(0)
    const outer = system.rings[system.rings.length - 1]
    const STEPS = 700
    let planetGap = Infinity
    let sunGap = Infinity
    const tp: Vec3 = [0, 0, 0]
    const pos = system.orbits.map(() => [0, 0, 0] as Vec3)
    for (let s = 0; s < STEPS; s++) {
      const t = (s / STEPS) * outer.period
      system.orbits.forEach((o, i) => planetPosition(system.rings[o.ring], o, t, pos[i]))
      for (const tr of trojans) {
        trojanPosition(system, tr, t, tp)
        sunGap = Math.min(sunGap, len(tp) - SUN_RADIUS - tr.size)
        const ring = system.orbits[tr.planet].ring
        for (let j = 0; j < pos.length; j++) {
          // só o próprio anel: entre anéis, o alcance (maxRadius) já cobre a nuvem e o espaçamento é testado à parte
          if (system.orbits[j].ring !== ring) continue
          planetGap = Math.min(planetGap, dist(tp, pos[j]) - system.orbits[j].extent - tr.size)
        }
      }
    }
    expect(sunGap).toBeGreaterThan(0)
    expect(planetGap).toBeGreaterThan(0)
  }, 20_000)
})
