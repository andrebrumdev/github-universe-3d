import { describe, expect, it } from 'vitest'
import { AWAY_TO_IDLE, CLICK_DURATION, INITIAL_SUN_STATE, nextBlinkDelay, sunReducer, type SunEvent, type SunState } from './sunMachine'

const apply = (s: SunState, ...events: SunEvent[]) => events.reduce(sunReducer, s)

describe('sunReducer', () => {
  it('idle → hover quando o mouse chega perto', () => {
    expect(apply(INITIAL_SUN_STATE, { type: 'near' }).mode).toBe('hover')
  })

  it('mouse longe a partir do idle continua idle', () => {
    expect(apply(INITIAL_SUN_STATE, { type: 'far' })).toBe(INITIAL_SUN_STATE)
  })

  it('hover → away → idle depois de AWAY_TO_IDLE segundos', () => {
    const away = apply(INITIAL_SUN_STATE, { type: 'near' }, { type: 'far' })
    expect(away.mode).toBe('away')
    expect(apply(away, { type: 'tick', dt: AWAY_TO_IDLE - 0.1 }).mode).toBe('away')
    expect(apply(away, { type: 'tick', dt: AWAY_TO_IDLE }).mode).toBe('idle')
  })

  it('clique dura CLICK_DURATION e volta ao estado em que o mouse estiver', () => {
    const clicked = apply(INITIAL_SUN_STATE, { type: 'near' }, { type: 'click' })
    expect(clicked.mode).toBe('click')
    expect(apply(clicked, { type: 'tick', dt: CLICK_DURATION / 2 }).mode).toBe('click')
    expect(apply(clicked, { type: 'tick', dt: CLICK_DURATION }).mode).toBe('hover')
    expect(apply(clicked, { type: 'far' }, { type: 'tick', dt: CLICK_DURATION }).mode).toBe('away')
  })

  it('devolve o mesmo objeto quando nada muda', () => {
    const hover = apply(INITIAL_SUN_STATE, { type: 'near' })
    expect(sunReducer(hover, { type: 'near' })).toBe(hover)
    expect(sunReducer(hover, { type: 'tick', dt: 1 })).toBe(hover)
  })
})

describe('nextBlinkDelay', () => {
  it('fica entre 3 e 5 segundos', () => {
    expect(nextBlinkDelay(() => 0)).toBe(3)
    expect(nextBlinkDelay(() => 0.999)).toBeLessThan(5)
  })
})
