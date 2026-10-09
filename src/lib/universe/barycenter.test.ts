import { describe, expect, it } from 'vitest'
import { barycenterOffset, MAX_WOBBLE, planetMass, SUN_MASS } from './barycenter'
import { buildOrbits, planetPosition, type OrbitSystem, type Ring, type Vec3 } from './orbits'
import { bodyExtent, MAX_PLANET_RADIUS, MIN_PLANET_RADIUS } from './planets'

const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2])

const circle: Ring = {
  index: 0,
  a: 12,
  e: 0,
  inclination: 0.2,
  node: 0.4,
  periapsis: 0.9,
  period: 60,
  apsidalRate: 0.01,
  maxRadius: 2,
}

describe('barycenterOffset', () => {
  it('sem planetas, o sol fica na origem', () => {
    expect(barycenterOffset({ rings: [], orbits: [] }, 5)).toEqual([0, 0, 0])
  })

  it('zero para uma configuração simétrica (planetas iguais espaçados por igual numa órbita circular)', () => {
    const system: OrbitSystem = {
      rings: [circle],
      orbits: [0, 1, 2, 3].map((i) => ({ name: `p${i}`, ring: 0, radius: 2, extent: 2, phase: (i * Math.PI) / 2 })),
    }
    for (const t of [0, 7, 33]) expect(len(barycenterOffset(system, t))).toBeLessThan(1e-12)
  })

  it('com um planeta só, fica do lado oposto, na proporção das massas (massa ∝ r³)', () => {
    const orbit = { name: 'solo', ring: 0, radius: 2, extent: 2, phase: 0.3 }
    const system: OrbitSystem = { rings: [circle], orbits: [orbit] }
    const t = 11
    const p = planetPosition(circle, orbit, t)
    const off = barycenterOffset(system, t)
    expect(planetMass(2)).toBe(8)
    for (let k = 0; k < 3; k++) expect(off[k]).toBeCloseTo((-planetMass(2) * p[k]) / SUN_MASS, 12)
    // sentido oposto: o produto escalar é −|p|·|off|
    const dot = off[0] * p[0] + off[1] * p[1] + off[2] * p[2]
    expect(dot / (len(off) * len(p))).toBeCloseTo(-1, 12)
  })

  it('com `out`, escreve nele em vez de alocar', () => {
    const system = buildOrbits([{ name: 'a', radius: 2 }, { name: 'b', radius: 1 }])
    const out: Vec3 = [9, 9, 9]
    expect(barycenterOffset(system, 4, out)).toBe(out)
    expect(out).toEqual(barycenterOffset(system, 4))
  })

  it('na amostra, o bamboleio é sutil mas visível (~0,2–0,6) e nunca passa de MAX_WOBBLE', () => {
    const radii = [3, 2.67, 2.34, 2.16, 1.72, 1.61, 1.43, 1.3, 1.15, 0.97, 0.86, 0.68, 0.59, 0.45]
    const system = buildOrbits(radii.map((radius, i) => ({ name: `p${i}`, radius, extent: bodyExtent(radius, 1 + (i % 4)) })))
    const outer = system.rings[system.rings.length - 1]
    let hi = 0
    let sum = 0
    const STEPS = 2000
    for (let s = 0; s < STEPS; s++) {
      const w = len(barycenterOffset(system, (s / STEPS) * 2 * outer.period))
      hi = Math.max(hi, w)
      sum += w
    }
    expect(hi).toBeLessThanOrEqual(MAX_WOBBLE + 1e-12)
    expect(hi).toBeGreaterThan(0.4)
    expect(sum / STEPS).toBeGreaterThan(0.15)
    expect(MAX_WOBBLE).toBeLessThanOrEqual(0.6)
  })

  it('o pior caso (um planeta máximo, com a força toda num lado só) fica limitado a MAX_WOBBLE', () => {
    const system = buildOrbits([{ name: 'big', radius: MAX_PLANET_RADIUS }, ...Array.from({ length: 2 }, (_, i) => ({ name: `s${i}`, radius: MIN_PLANET_RADIUS }))])
    for (let s = 0; s < 200; s++) expect(len(barycenterOffset(system, s))).toBeLessThanOrEqual(MAX_WOBBLE + 1e-12)
  })
})
