import { describe, expect, it } from 'vitest'
import { bloomAllowed, canvasDpr } from './renderBudget'

describe('canvasDpr', () => {
  it('desktop com mouse: até 2×', () => {
    expect(canvasDpr(true)).toEqual([1, 2])
  })
  it('toque ou ponteiro grosso (celular, tablet): até 1,5×', () => {
    expect(canvasDpr(false)).toEqual([1, 1.5])
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
