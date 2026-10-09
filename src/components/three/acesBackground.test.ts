import { describe, expect, it } from 'vitest'
import { acesFilmic, hexToLinear, preToneMapped } from './acesBackground'

const toHex = (c: number[]) =>
  c
    .map((v) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)))
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')

describe('fundo da cena com o tone mapping do bloom', () => {
  it('o ACES esmaga o #03050d quase para preto (o problema)', () => {
    expect(toHex(acesFilmic(hexToLinear('#03050d')))).toBe('000001')
  })

  it('preToneMapped devolve uma cor que, depois do ACES, sai #03050d', () => {
    expect(toHex(acesFilmic(preToneMapped('#03050d')))).toBe('03050d')
  })

  it('ACES: preto fica preto, branco forte satura em 1, e é monotônico', () => {
    expect(acesFilmic([0, 0, 0])).toEqual([0, 0, 0])
    expect(acesFilmic([20, 20, 20])).toEqual([1, 1, 1])
    expect(acesFilmic([0.5, 0.5, 0.5])[1]).toBeGreaterThan(acesFilmic([0.2, 0.2, 0.2])[1])
  })
})
