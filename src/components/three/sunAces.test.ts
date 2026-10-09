import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@/lib/universe/random'
import { acesFilmic, hexToLinear, type Rgb } from './acesBackground'
import { ACES_INVERSE_GLSL, acesFilmicInverse } from './sunAces'

const luma = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

describe('inverso do ACES Filmic do ToneMapping (mesma variante do three, exposição 1)', () => {
  it('ida e volta: ACES(inverso(c)) ≈ c (±1/255) para toda cor que o ACES produz sem cortar', () => {
    const rng = mulberry32(3)
    let checked = 0
    for (let i = 0; i < 4000; i++) {
      // entradas lineares de 0 a ~8 (cobre do preto ao quase branco), cores bem saturadas também
      const x: Rgb = [rng() ** 2 * 8, rng() ** 2 * 8, rng() ** 2 * 8]
      const c = acesFilmic(x)
      if (c.some((v) => v <= 0 || v >= 0.995)) continue // cortado pelo saturate: fora do alcance representável
      const back = acesFilmic(acesFilmicInverse(c))
      for (let k = 0; k < 3; k++) expect(Math.abs(back[k] - c[k])).toBeLessThanOrEqual(1 / 255)
      checked++
    }
    expect(checked).toBeGreaterThan(1500)
  })

  it('cinzas de 0 a 0,98 e o marrom dos traços voltam iguais', () => {
    for (let g = 0; g <= 0.98; g += 0.02) {
      const back = acesFilmic(acesFilmicInverse([g, g, g]))
      for (const v of back) expect(Math.abs(v - g)).toBeLessThanOrEqual(1 / 255)
    }
    const pupil = hexToLinear('#1A1206')
    const back = acesFilmic(acesFilmicInverse(pupil))
    for (let k = 0; k < 3; k++) expect(Math.abs(back[k] - pupil[k])).toBeLessThanOrEqual(1 / 255)
  })

  it('amarelo do LED: vermelho e verde voltam iguais; o azul quase zero fica fora da gama do ACES (sobe, mas o mínimo possível)', () => {
    const body = hexToLinear('#EACF21') // o corpo como sai no ?nobloom (234, 207, 33)
    const back = acesFilmic(acesFilmicInverse(body))
    expect(Math.abs(back[0] - body[0])).toBeLessThanOrEqual(1 / 255)
    expect(Math.abs(back[1] - body[1])).toBeLessThanOrEqual(1 / 255)
    // nenhuma entrada ≥ 0 dá menos azul com este vermelho e verde: o ACES mistura os canais
    expect(back[2]).toBeGreaterThan(body[2])
    expect(acesFilmicInverse(body)[2]).toBe(0) // a entrada já vai sem azul: é o mínimo possível
    // e o inverso do corpo fica abaixo do limiar do bloom: o amarelo não vaza
    expect(luma(acesFilmicInverse(body))).toBeLessThan(0.8)
  })

  it('perto de 1 trava: o branco puro dá uma entrada finita que o ACES leva a ≥ 0,98', () => {
    const x = acesFilmicInverse([1, 1, 1])
    for (const v of x) expect(Number.isFinite(v)).toBe(true)
    for (const v of acesFilmic(x)) expect(v).toBeGreaterThanOrEqual(0.98)
    expect(acesFilmicInverse([0, 0, 0]).every((v) => v >= 0 && v < 0.01)).toBe(true)
  })

  it('o ACES aumenta tudo que é claro: o inverso de um cinza médio-alto passa do limiar do bloom (0,8)', () => {
    // por isso o sol, com bloom, ainda precisa de um teto depois do inverso (ver sunMaterial)
    expect(luma(acesFilmicInverse([0.6, 0.6, 0.6]))).toBeLessThan(0.8)
    expect(luma(acesFilmicInverse([0.9, 0.9, 0.9]))).toBeGreaterThan(0.8)
  })

  it('o GLSL usa as mesmas matrizes inversas e a mesma raiz da quadrática', () => {
    expect(ACES_INVERSE_GLSL).toContain('vec3 sunAcesInverse( vec3 c )')
    expect(ACES_INVERSE_GLSL).toContain('sqrt( b * b - 4.0 * a * k )')
    expect(ACES_INVERSE_GLSL).toContain('* 0.6')
  })
})
