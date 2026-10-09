import { describe, expect, it } from 'vitest'
import { HOVER_FADE_S, leaveCell, newCellHover, pointCell, stepCellHover, tapCell, TOUCH_HOLD_S } from './cellHover'

const FRAME = 1 / 60

function run(h: ReturnType<typeof newCellHover>, seconds: number, reduced = false): boolean {
  let expired = false
  for (let t = 0; t < seconds - 1e-9; t += FRAME) expired = stepCellHover(h, FRAME, reduced) || expired
  return expired
}

describe('quadradinho aceso sob o ponteiro', () => {
  it('começa apagado, sem célula', () => {
    const h = newCellHover()
    expect(h.cell).toBe(-1)
    expect(h.lit).toBe(-1)
    expect(h.level).toBe(0)
  })

  it('entrar: a célula acende em ~120 ms, desacelerando no shader (aqui o tempo normalizado, linear)', () => {
    const h = newCellHover()
    expect(pointCell(h, 40)).toBe(true)
    expect(h.cell).toBe(40)
    expect(h.lit).toBe(40)
    stepCellHover(h, HOVER_FADE_S / 2, false)
    expect(h.level).toBeCloseTo(0.5)
    run(h, HOVER_FADE_S)
    expect(h.level).toBe(1)
    expect(HOVER_FADE_S).toBeGreaterThanOrEqual(0.1)
    expect(HOVER_FADE_S).toBeLessThanOrEqual(0.15)
  })

  it('o mesmo dia de novo não conta como troca', () => {
    const h = newCellHover()
    pointCell(h, 40)
    expect(pointCell(h, 40)).toBe(false)
  })

  it('passar para outro dia: o novo já entra aceso (sem piscar) e o velho apaga junto', () => {
    const h = newCellHover()
    pointCell(h, 40)
    run(h, HOVER_FADE_S * 2)
    expect(pointCell(h, 41)).toBe(true)
    expect(h.lit).toBe(41)
    expect(h.level).toBe(1)
  })

  it('sair: apaga em ~120 ms e só então solta a célula (o shader apaga a mesma que acendeu)', () => {
    const h = newCellHover()
    pointCell(h, 7)
    run(h, HOVER_FADE_S * 2)
    expect(leaveCell(h)).toBe(true)
    expect(h.cell).toBe(-1)
    expect(h.lit).toBe(7)
    stepCellHover(h, HOVER_FADE_S / 2, false)
    expect(h.level).toBeCloseTo(0.5)
    expect(h.lit).toBe(7)
    run(h, HOVER_FADE_S)
    expect(h.level).toBe(0)
    expect(h.lit).toBe(-1)
    expect(leaveCell(h)).toBe(false)
  })

  it('fora da grade (calotas) vale como sair', () => {
    const h = newCellHover()
    pointCell(h, 3)
    expect(pointCell(h, -1)).toBe(true)
    expect(h.cell).toBe(-1)
  })

  it('movimento reduzido: acende e apaga na hora', () => {
    const h = newCellHover()
    pointCell(h, 12)
    stepCellHover(h, FRAME, true)
    expect(h.level).toBe(1)
    leaveCell(h)
    stepCellHover(h, FRAME, true)
    expect(h.level).toBe(0)
    expect(h.lit).toBe(-1)
  })

  it('toque: o dia tocado fica aceso ~2 s e depois apaga sozinho (avisa uma vez)', () => {
    const h = newCellHover()
    expect(TOUCH_HOLD_S).toBe(2)
    tapCell(h, 100)
    expect(h.cell).toBe(100)
    expect(run(h, TOUCH_HOLD_S - 0.1)).toBe(false)
    expect(h.cell).toBe(100)
    expect(h.level).toBe(1)
    expect(run(h, 0.2)).toBe(true)
    expect(h.cell).toBe(-1)
    run(h, HOVER_FADE_S * 2)
    expect(h.lit).toBe(-1)
    expect(run(h, 1)).toBe(false)
  })

  it('outro toque recomeça os 2 s no dia novo; sair cancela o prazo', () => {
    const h = newCellHover()
    tapCell(h, 5)
    run(h, 1.5)
    tapCell(h, 6)
    expect(run(h, 1.5)).toBe(false)
    expect(h.cell).toBe(6)
    leaveCell(h)
    expect(h.touchLeft).toBe(0)
    expect(run(h, 3)).toBe(false)
  })

  it('o mouse por cima não tem prazo', () => {
    const h = newCellHover()
    tapCell(h, 5)
    pointCell(h, 9)
    expect(h.touchLeft).toBe(0)
    expect(run(h, 5)).toBe(false)
    expect(h.cell).toBe(9)
  })
})
