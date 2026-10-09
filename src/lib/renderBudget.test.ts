import { describe, expect, it } from 'vitest'
import { bloomAllowed, canvasDpr } from './renderBudget'

describe('canvasDpr', () => {
  it('desktop com mouse, sem bloom: até 2×', () => {
    expect(canvasDpr(true, false)).toEqual([1, 2])
  })
  it('toque ou ponteiro grosso (celular, tablet): até 1,5×', () => {
    expect(canvasDpr(false, false)).toEqual([1, 1.5])
  })
  it('com o bloom ligado: até 1,5× (os alvos do EffectComposer crescem com o quadrado do DPR)', () => {
    expect(canvasDpr(true, true)).toEqual([1, 1.5])
    expect(canvasDpr(false, true)).toEqual([1, 1.5])
  })
  it('a mesma faixa (mesmo objeto) a cada chamada: o Canvas não vê um DPR novo a cada render', () => {
    expect(canvasDpr(true, true)).toBe(canvasDpr(true, true))
    expect(canvasDpr(true, false)).toBe(canvasDpr(true, false))
  })
})

describe('bloomAllowed', () => {
  it('só com tela larga e mouse de verdade (pointer fine + hover), fora do ?nobloom', () => {
    expect(bloomAllowed({ wide: true, finePointer: true, noBloomParam: false })).toBe(true)
  })
  it('tablet largo de toque (iPad em paisagem) fica sem bloom', () => {
    expect(bloomAllowed({ wide: true, finePointer: false, noBloomParam: false })).toBe(false)
  })
  it('celular e ?nobloom ficam sem bloom', () => {
    expect(bloomAllowed({ wide: false, finePointer: true, noBloomParam: false })).toBe(false)
    expect(bloomAllowed({ wide: false, finePointer: false, noBloomParam: false })).toBe(false)
    expect(bloomAllowed({ wide: true, finePointer: true, noBloomParam: true })).toBe(false)
  })
})
