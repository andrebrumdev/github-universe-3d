import { describe, expect, it } from 'vitest'
import { CARD_ENTER_S, CARD_EXIT_S, cardVariants, EASE_OUT, ITEM_S, ITEM_START_S, ITEM_STEP_S, REDUCED_FADE_S } from './cardMotion'

describe('entrada dos cartões', () => {
  it('desliza da borda em 280–380 ms, desacelerando, e sai mais rápido pelo mesmo caminho', () => {
    expect(CARD_ENTER_S).toBeGreaterThanOrEqual(0.28)
    expect(CARD_ENTER_S).toBeLessThanOrEqual(0.38)
    expect(CARD_EXIT_S).toBeLessThan(CARD_ENTER_S)
    // curva que desacelera: começa íngreme (y1 > x1) e chega reta
    expect(EASE_OUT[1]).toBeGreaterThan(EASE_OUT[0])
    const right = cardVariants('right', false)
    expect(right.hidden).toMatchObject({ x: '100%', opacity: 0 })
    expect(right.shown).toMatchObject({ x: 0, y: 0, opacity: 1 })
    expect(cardVariants('bottom', false).hidden).toMatchObject({ y: '100%', opacity: 0 })
  })

  it('título, números e linguagens assentam antes de 0,5 s', () => {
    const groups = 3
    expect(ITEM_START_S + (groups - 1) * ITEM_STEP_S + ITEM_S).toBeLessThan(0.5)
  })

  it('movimento reduzido: sem deslize, só a opacidade em até 120 ms', () => {
    for (const edge of ['right', 'bottom'] as const) {
      const v = cardVariants(edge, true)
      expect(v.hidden).not.toHaveProperty('x')
      expect(v.hidden).not.toHaveProperty('y')
      expect(v.shown).not.toHaveProperty('x')
    }
    expect(REDUCED_FADE_S).toBeLessThanOrEqual(0.12)
  })
})
