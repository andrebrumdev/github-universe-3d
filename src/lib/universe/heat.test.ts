import { describe, expect, it } from 'vitest'
import { HEAT_START, heatFactor } from './heat'
import { planetPosition, type PlanetOrbit, type Ring } from './orbits'

const ring: Ring = {
  index: 0,
  a: 20,
  e: 0.22,
  inclination: 0.15,
  node: 0.9,
  periapsis: 1.7,
  period: 60,
  // precessão bem rápida, para o teste ver o periélio girar
  apsidalRate: 0.05,
  maxRadius: 2,
}
const orbit: PlanetOrbit = { name: 'p', ring: 0, radius: 1, extent: 2, phase: 0.4 }
const len = (v: [number, number, number]) => Math.hypot(v[0], v[1], v[2])
/** Instante da k-ésima passagem pelo periélio (anomalia média múltipla de 2π). */
const periTime = (k: number) => ((2 * Math.PI * k - orbit.phase) / (2 * Math.PI)) * ring.period

describe('heatFactor (aquecimento no periélio)', () => {
  it('vale 1 no periélio e 0 no afélio, inclusive depois de o periélio girar com a precessão', () => {
    for (const k of [1, 3, 40]) {
      const t = periTime(k)
      // o planeta está mesmo no periélio do instante (o ω já girou)
      expect(len(planetPosition(ring, orbit, t))).toBeCloseTo(ring.a * (1 - ring.e), 9)
      expect(heatFactor(ring, orbit, t)).toBeCloseTo(1, 9)
      const aph = t + ring.period / 2
      expect(len(planetPosition(ring, orbit, aph))).toBeCloseTo(ring.a * (1 + ring.e), 9)
      expect(heatFactor(ring, orbit, aph)).toBe(0)
    }
  })

  it('apaga antes da distância média: da metade do caminho até o afélio fica em 0', () => {
    const steps = 2000
    for (let s = 0; s < steps; s++) {
      const t = (s / steps) * ring.period * 3
      const r = len(planetPosition(ring, orbit, t))
      const x = (ring.a * (1 + ring.e) - r) / (2 * ring.a * ring.e)
      const h = heatFactor(ring, orbit, t)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(1)
      if (x <= HEAT_START) expect(h).toBe(0)
      else expect(h).toBeGreaterThan(0)
    }
  })

  it('cai sem degrau do periélio ao afélio (monótono e suave)', () => {
    const t0 = periTime(2)
    let prev = heatFactor(ring, orbit, t0)
    let maxJump = 0
    for (let s = 1; s <= 600; s++) {
      const h = heatFactor(ring, orbit, t0 + (s / 600) * (ring.period / 2))
      expect(h).toBeLessThanOrEqual(prev + 1e-12)
      maxJump = Math.max(maxJump, prev - h)
      prev = h
    }
    expect(prev).toBe(0)
    // passo de 0,15° de anomalia média: nada salta mais que ~2%
    expect(maxJump).toBeLessThan(0.02)
    // e sobe igual na volta (simétrico em torno do periélio)
    expect(heatFactor(ring, orbit, t0 - 3)).toBeCloseTo(heatFactor(ring, orbit, t0 + 3), 9)
  })

  it('órbita circular (e = 0) não aquece nem gera NaN', () => {
    expect(heatFactor({ ...ring, e: 0 }, orbit, 12)).toBe(0)
  })
})
