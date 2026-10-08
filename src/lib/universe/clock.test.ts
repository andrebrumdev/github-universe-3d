import { describe, expect, it } from 'vitest'
import { advanceClock, clockTarget, MAX_DT, predictStopTime, type ClockState } from './clock'

const run = (s: ClockState, seconds: number, target: number, dt = 1 / 60) => {
  let state = s
  for (let i = 0; i < Math.round(seconds / dt); i++) state = advanceClock(state, dt, target)
  return state
}

describe('advanceClock', () => {
  it('desacelera até quase parar em ~1 s', () => {
    expect(run({ time: 0, scale: 1 }, 1, 0).scale).toBeLessThan(0.06)
    expect(run({ time: 0, scale: 1 }, 3, 0).scale).toBe(0)
  })

  it('acelera de volta', () => {
    expect(run({ time: 0, scale: 0 }, 3, 1).scale).toBe(1)
  })

  it('o tempo avança proporcional à escala', () => {
    expect(run({ time: 5, scale: 1 }, 2, 1).time).toBeCloseTo(7, 6)
  })

  it('limita dt enorme (aba em segundo plano)', () => {
    expect(advanceClock({ time: 0, scale: 1 }, 30, 1).time).toBeLessThanOrEqual(MAX_DT)
  })
})

describe('predictStopTime', () => {
  it('prevê onde a simulação para', () => {
    const start = { time: 10, scale: 1 }
    expect(run(start, 5, 0).time).toBeCloseTo(predictStopTime(start), 1)
  })
})

describe('clockTarget', () => {
  it('para com foco, tutorial focado ou movimento reduzido', () => {
    expect(clockTarget({ reducedMotion: false, focused: false, tutorialFocus: false })).toBe(1)
    expect(clockTarget({ reducedMotion: true, focused: false, tutorialFocus: false })).toBe(0)
    expect(clockTarget({ reducedMotion: false, focused: true, tutorialFocus: false })).toBe(0)
    expect(clockTarget({ reducedMotion: false, focused: false, tutorialFocus: true })).toBe(0)
  })
})
