import { describe, expect, it } from 'vitest'
import { FACE_CALM_INNER, FACE_CALM_OUTER, faceCalmWeight, SHADE_CORE_Y, sunShade, SURFACE_AMPLITUDE } from './surface'

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

describe('sunShade: do ouro do miolo ao âmbar da borda e da metade de baixo (normal na vista, x/y)', () => {
  it('0 no miolo claro, um pouco acima do centro; 1 na borda de baixo', () => {
    expect(SHADE_CORE_Y).toBeGreaterThan(0.1)
    expect(SHADE_CORE_Y).toBeLessThan(0.35)
    expect(sunShade(0, SHADE_CORE_Y)).toBe(0)
    expect(sunShade(0, 0)).toBeLessThan(0.05) // o centro (onde fica o rosto) ainda é ouro
    expect(sunShade(0, -1)).toBe(1)
  })

  it('a metade de baixo é mais funda que a de cima à mesma distância da borda; os lados ficam no meio e são simétricos', () => {
    const top = sunShade(0, 1)
    const bottom = sunShade(0, -1)
    const side = sunShade(1, 0)
    expect(bottom).toBeGreaterThan(side)
    expect(side).toBeGreaterThan(top - 0.2)
    expect(sunShade(-1, 0)).toBeCloseTo(side, 10)
    expect(sunShade(0.7, -0.7)).toBeGreaterThan(sunShade(0.7, 0.7))
  })

  it('cresce do miolo para a borda, sem saltos, e fica em [0, 1]', () => {
    for (const angle of [0, 1, 2, 3, 4, 5, 6]) {
      let prev = -1
      for (let r = 0; r <= 1.0001; r += 0.02) {
        const t = sunShade(r * Math.sin(angle), SHADE_CORE_Y + r * (Math.cos(angle) - SHADE_CORE_Y))
        expect(t).toBeGreaterThanOrEqual(0)
        expect(t).toBeLessThanOrEqual(1)
        expect(t).toBeGreaterThanOrEqual(prev - 1e-9)
        if (prev >= 0) expect(t - prev).toBeLessThan(0.08)
        prev = t
      }
    }
  })
})
