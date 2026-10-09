import { describe, expect, it } from 'vitest'
import { ABERRATION_MAX_PX, ABERRATION_MIN_PX, aberrationAt, aberrationLimbPx, fringeRho, sunScreenRadius } from './aberration'

const FOV = (50 * Math.PI) / 180

describe('aberração cromática do sol: força pela distância e pelo ângulo de visão', () => {
  it('raio do sol na tela: inverso da distância, proporcional à altura da tela', () => {
    const r = sunScreenRadius(2.5, 50, FOV, 1600)
    expect(r).toBeCloseTo((800 * 2.5) / (50 * Math.tan(FOV / 2)), 6)
    expect(sunScreenRadius(2.5, 100, FOV, 1600)).toBeCloseTo(r / 2, 6)
    expect(sunScreenRadius(2.5, 50, FOV, 800)).toBeCloseTo(r / 2, 6)
    // câmera dentro do sol ou em cima dele: finito e grande
    expect(Number.isFinite(sunScreenRadius(2.5, 0, FOV, 1600))).toBe(true)
  })

  it('no limbo: ~1–2 px na visão geral; cresce com o tamanho na tela, mas trava no close-up', () => {
    // visão geral: d ≈ 120, tela de 800 px (CSS) com dpr 2
    const overview = aberrationLimbPx(sunScreenRadius(2.5, 120, FOV, 1600))
    expect(overview).toBeGreaterThanOrEqual(1)
    expect(overview).toBeLessThanOrEqual(2)
    const closeup = aberrationLimbPx(sunScreenRadius(2.5, 13, FOV, 1600))
    expect(closeup).toBe(ABERRATION_MAX_PX)
    expect(aberrationLimbPx(sunScreenRadius(2.5, 2000, FOV, 1600))).toBe(ABERRATION_MIN_PX)
    let prev = 0
    for (let r = 1; r < 2000; r *= 1.5) {
      const px = aberrationLimbPx(r)
      expect(px).toBeGreaterThanOrEqual(prev)
      prev = px
    }
  })

  it('pelo ângulo de visão: zero no centro do disco (olhos nítidos), inteira no limbo, monótona e suave', () => {
    expect(aberrationAt(1, 2)).toBe(0)
    expect(aberrationAt(0, 2)).toBe(2)
    // o rosto fica no meio do disco (μ ≳ 0,8): menos de 5% da força
    expect(aberrationAt(0.8, 2)).toBeLessThan(0.1)
    let prev = Infinity
    for (let i = 0; i <= 20; i++) {
      const v = aberrationAt(i / 20, 2)
      expect(v).toBeLessThanOrEqual(prev)
      prev = v
    }
    expect(aberrationAt(-0.2, 2)).toBe(2)
    expect(aberrationAt(1.3, 2)).toBe(0)
  })

  it('franja do brilho/névoa em raios do sol: o mesmo deslocamento em px, dividido pelo raio na tela', () => {
    expect(fringeRho(2, 100)).toBeCloseTo(0.02)
    expect(fringeRho(2, 0)).toBeLessThanOrEqual(0.1) // sol minúsculo: não estoura
  })
})
