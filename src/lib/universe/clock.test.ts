import { describe, expect, it } from 'vitest'
import { advanceClock, clockDirection, clockTarget, MAX_DT, predictStopTime, TURN_SECONDS, type ClockState } from './clock'

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

describe('sentido do relógio (modo disco)', () => {
  const runDir = (s: ClockState, seconds: number, target: number, reverse: boolean, dt = 1 / 60) => {
    let state = s
    const trace: ClockState[] = []
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      state = advanceClock(state, dt, target, reverse)
      trace.push(state)
    }
    return { state, trace }
  }

  it('começa para a frente: sem `turn`, o sentido é +1', () => {
    const start: ClockState = { time: 0, scale: 1 }
    expect(clockDirection(start)).toBe(1)
  })

  it('vira de +1 a −1 em TURN_SECONDS, suave: desacelera, para e volta (sem salto)', () => {
    const { state, trace } = runDir({ time: 10, scale: 1 }, TURN_SECONDS + 0.05, 1, true)
    expect(clockDirection(state)).toBe(-1)
    const dirs = trace.map(clockDirection)
    // monotônico, sem passo maior que o de uma rampa lisa
    for (let i = 1; i < dirs.length; i++) {
      expect(dirs[i]).toBeLessThanOrEqual(dirs[i - 1])
      expect(dirs[i - 1] - dirs[i]).toBeLessThan(0.05)
    }
    // no meio da rampa passa pelo zero (parado)
    expect(Math.abs(clockDirection(trace[Math.round(trace.length / 2) - 1]))).toBeLessThan(0.1)
  })

  it('com o sentido invertido, o tempo da simulação anda para trás', () => {
    const turned = runDir({ time: 10, scale: 1 }, TURN_SECONDS, 1, true).state
    const later = runDir(turned, 2, 1, true).state
    expect(later.time).toBeCloseTo(turned.time - 2, 6)
  })

  it('volta para a frente do mesmo jeito', () => {
    const turned = runDir({ time: 10, scale: 1 }, TURN_SECONDS, 1, true).state
    expect(clockDirection(runDir(turned, TURN_SECONDS + 0.05, 1, false).state)).toBe(1)
  })

  it('com o relógio parando (foco), o sentido congela e a previsão de parada continua exata', () => {
    // no meio da virada, o usuário foca um planeta: alvo 0
    const mid = runDir({ time: 10, scale: 1 }, TURN_SECONDS * 0.3, 1, true).state
    const predicted = predictStopTime(mid)
    const { state } = runDir(mid, 5, 0, true)
    expect(state.turn).toBe(mid.turn)
    expect(state.time).toBeCloseTo(predicted, 1)
  })

  it('a previsão de parada anda para trás com o relógio invertido', () => {
    const turned = runDir({ time: 10, scale: 1 }, TURN_SECONDS, 1, true).state
    expect(predictStopTime(turned)).toBeLessThan(turned.time)
    expect(runDir(turned, 5, 0, true).state.time).toBeCloseTo(predictStopTime(turned), 1)
  })
})
