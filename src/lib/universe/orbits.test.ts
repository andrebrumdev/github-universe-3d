import { describe, expect, it } from 'vitest'
import { MAX_PLANET_RADIUS, MIN_PLANET_RADIUS } from './planets'
import {
  buildOrbits,
  MAX_INCLINATION,
  orbitPosition,
  planetPosition,
  type Ring,
  solveKepler,
  SUN_RADIUS,
  type Vec3,
} from './orbits'

const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

const ring = (over: Partial<Ring> = {}): Ring => ({
  index: 0,
  a: 10,
  e: 0.08,
  inclination: 0.1,
  node: 0.7,
  periapsis: 1.3,
  period: 60,
  maxRadius: 1,
  ...over,
})

describe('solveKepler', () => {
  it('resolve M = E − e·sin E com erro desprezível', () => {
    for (const e of [0, 0.02, 0.08, 0.1]) {
      for (let M = -Math.PI; M <= Math.PI; M += 0.37) {
        const E = solveKepler(M, e)
        expect(Math.abs(E - e * Math.sin(E) - M)).toBeLessThan(1e-9)
      }
    }
  })
})

describe('posição na órbita', () => {
  it('periélio a(1−e) em M=0 e afélio a(1+e) em M=π', () => {
    const r = ring()
    expect(len(orbitPosition(r, 0))).toBeCloseTo(r.a * (1 - r.e), 9)
    expect(len(orbitPosition(r, Math.PI))).toBeCloseTo(r.a * (1 + r.e), 9)
  })

  it('volta ao mesmo ponto depois de um período', () => {
    const r = ring()
    const orbit = { name: 'p', ring: 0, radius: 1, phase: 0.4 }
    const p0 = planetPosition(r, orbit, 12.3)
    const p1 = planetPosition(r, orbit, 12.3 + r.period)
    expect(dist(p0, p1)).toBeLessThan(1e-9)
  })

  it('órbita sem inclinação fica no plano y = 0', () => {
    const r = ring({ inclination: 0 })
    for (let M = 0; M < 6; M += 0.5) expect(Math.abs(orbitPosition(r, M)[1])).toBeLessThan(1e-12)
  })
})

describe('buildOrbits', () => {
  it('sistema vazio e sistema com um planeta', () => {
    expect(buildOrbits([])).toEqual({ rings: [], orbits: [] })
    const one = buildOrbits([{ name: 'solo', radius: 1 }])
    expect(one.rings).toHaveLength(1)
    expect(one.orbits[0]).toMatchObject({ name: 'solo', ring: 0 })
  })

  it('preenche anéis com 3 + 2k planetas, na ordem do ranking', () => {
    const planets = Array.from({ length: 40 }, (_, i) => ({ name: `p${i}`, radius: 1 }))
    const { rings, orbits } = buildOrbits(planets)
    const sizes = rings.map((r) => orbits.filter((o) => o.ring === r.index).length)
    expect(sizes).toEqual([3, 5, 7, 9, 11, 5])
    expect(orbits.map((o) => o.name)).toEqual(planets.map((p) => p.name))
  })

  it('segue a 3ª lei de Kepler e os limites de e e inclinação', () => {
    const { rings } = buildOrbits(Array.from({ length: 20 }, (_, i) => ({ name: `p${i}`, radius: 1.5 })))
    for (const r of rings) {
      expect(r.period / rings[0].period).toBeCloseTo(Math.pow(r.a / rings[0].a, 1.5), 9)
      expect(r.e).toBeGreaterThanOrEqual(0.02)
      expect(r.e).toBeLessThanOrEqual(0.08)
      expect(Math.abs(r.inclination)).toBeLessThanOrEqual(MAX_INCLINATION)
    }
  })

  it.each([
    ['raios mistos', (i: number) => (i % 2 ? MAX_PLANET_RADIUS : MIN_PLANET_RADIUS)],
    ['todos máximos', () => MAX_PLANET_RADIUS],
  ])('nenhuma colisão ao longo de um período do anel externo (%s)', (_, radiusOf) => {
    const planets = Array.from({ length: 40 }, (_, i) => ({ name: `p${i}`, radius: radiusOf(i) }))
    const { rings, orbits } = buildOrbits(planets)
    const outer = rings[rings.length - 1]
    for (let s = 0; s < 400; s++) {
      const t = (s / 400) * outer.period
      const pos = orbits.map((o) => planetPosition(rings[o.ring], o, t))
      for (let i = 0; i < orbits.length; i++) {
        expect(len(pos[i])).toBeGreaterThan(SUN_RADIUS + orbits[i].radius)
        for (let j = i + 1; j < orbits.length; j++) {
          expect(dist(pos[i], pos[j])).toBeGreaterThan(orbits[i].radius + orbits[j].radius)
        }
      }
    }
  }, 60_000)
})
