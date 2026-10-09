import { describe, expect, it } from 'vitest'
import { FACE_CALM_INNER, FACE_CALM_OUTER, faceCalmWeight, SURFACE_AMPLITUDE } from './surface'

const deg = (d: number) => (d * Math.PI) / 180

describe('faceCalmWeight: quanto a superfície balança, pelo ângulo até a direção do rosto', () => {
  it('0 no centro do rosto e em toda a área dos olhos e da boca; 1 no limbo e atrás', () => {
    expect(faceCalmWeight(0)).toBe(0)
    // olhos, sobrancelhas e boca ficam dentro de ~36° do centro do rosto (até ~50 unidades de 0,7°)
    expect(faceCalmWeight(deg(36))).toBe(0)
    expect(faceCalmWeight(FACE_CALM_INNER)).toBe(0)
    expect(faceCalmWeight(FACE_CALM_OUTER)).toBe(1)
    expect(faceCalmWeight(Math.PI / 2)).toBe(1)
    expect(faceCalmWeight(Math.PI)).toBe(1)
  })

  it('suave: monótona, contínua e com derivada zero nas duas pontas da rampa', () => {
    let prev = 0
    for (let i = 0; i <= 180; i++) {
      const w = faceCalmWeight(deg(i))
      expect(w).toBeGreaterThanOrEqual(prev)
      expect(w - prev).toBeLessThan(0.06)
      prev = w
    }
    const h = 1e-4
    expect((faceCalmWeight(FACE_CALM_INNER + h) - faceCalmWeight(FACE_CALM_INNER)) / h).toBeLessThan(1e-2)
    expect((faceCalmWeight(FACE_CALM_OUTER) - faceCalmWeight(FACE_CALM_OUTER - h)) / h).toBeLessThan(1e-2)
    expect(faceCalmWeight((FACE_CALM_INNER + FACE_CALM_OUTER) / 2)).toBeCloseTo(0.5)
  })

  it('ângulos fora de [0, π] (acos com erro de arredondamento) não escapam de [0, 1]', () => {
    expect(faceCalmWeight(-0.1)).toBe(0)
    expect(faceCalmWeight(4)).toBe(1)
  })

  it('balanço de desenho animado, bem suave: abaixo de 1% do raio (sem fervura)', () => {
    expect(SURFACE_AMPLITUDE).toBeGreaterThan(0.003)
    expect(SURFACE_AMPLITUDE).toBeLessThan(0.01)
  })
})
