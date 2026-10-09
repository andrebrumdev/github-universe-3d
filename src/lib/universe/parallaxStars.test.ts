import { describe, expect, it } from 'vitest'
import { generateParallaxStars } from './parallaxStars'

const opts = { count: 500, seed: 11, innerRadius: 120, outerRadius: 300 }

describe('generateParallaxStars', () => {
  it('é determinístico para a mesma semente e tem o tamanho certo', () => {
    const a = generateParallaxStars(opts)
    const b = generateParallaxStars(opts)
    expect(a.positions).toHaveLength(1500)
    expect(a.sizes).toHaveLength(500)
    expect(a.colors).toHaveLength(1500)
    expect(Array.from(b.positions)).toEqual(Array.from(a.positions))
    expect(Array.from(generateParallaxStars({ ...opts, seed: 12 }).positions)).not.toEqual(Array.from(a.positions))
  })

  it('mantém toda estrela dentro de [inner, outer], logo fora do alcance do sistema', () => {
    const { positions } = generateParallaxStars(opts)
    for (let i = 0; i < 500; i++) {
      const r = Math.hypot(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
      expect(r).toBeGreaterThanOrEqual(opts.innerRadius - 1e-3)
      expect(r).toBeLessThanOrEqual(opts.outerRadius + 1e-3)
    }
  })

  it('usa cores abaixo do limiar do bloom e tamanhos positivos', () => {
    const { colors, sizes } = generateParallaxStars(opts)
    expect(Math.max(...colors)).toBeLessThan(0.7)
    expect(Math.min(...sizes)).toBeGreaterThan(0)
  })
})
