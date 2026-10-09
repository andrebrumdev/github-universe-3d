import { describe, expect, it } from 'vitest'
import { BARREL_ROLL_SECONDS } from '../ship/play'
import {
  DISCO_FADE_IN,
  DISCO_FADE_OUT,
  DISCO_OFF,
  DISCO_SECONDS,
  discoBlocked,
  discoDance,
  discoLevel,
  discoReducer,
  discoReversed,
  type DiscoState,
} from './disco'

const tick = (s: DiscoState, seconds: number, blocked = false, dt = 1 / 60) => {
  let state = s
  for (let i = 0; i < Math.round(seconds / dt); i++) state = discoReducer(state, { type: 'tick', dt, blocked })
  return state
}
const code = (s: DiscoState, blocked = false) => discoReducer(s, { type: 'code', blocked })

describe('linha do tempo do disco', () => {
  it('o código liga: o nível sobe em DISCO_FADE_IN e as órbitas viram', () => {
    const on = code(DISCO_OFF)
    expect(on.phase).toBe('on')
    expect(on.seq).toBe(DISCO_OFF.seq + 1)
    expect(discoReversed(on)).toBe(true)
    expect(discoLevel(on)).toBe(0)
    expect(discoLevel(tick(on, DISCO_FADE_IN / 2))).toBeGreaterThan(0.3)
    expect(discoLevel(tick(on, DISCO_FADE_IN / 2))).toBeLessThan(0.7)
    expect(discoLevel(tick(on, DISCO_FADE_IN + 0.1))).toBe(1)
  })

  it('dura ~20 s, depois apaga em DISCO_FADE_OUT e desliga (o relógio volta a andar para a frente)', () => {
    const on = code(DISCO_OFF)
    const late = tick(on, DISCO_SECONDS - 0.1)
    expect(late.phase).toBe('on')
    const fading = tick(late, 0.2)
    expect(fading.phase).toBe('fading')
    expect(discoReversed(fading)).toBe(false)
    expect(discoLevel(fading)).toBeGreaterThan(0.9)
    const mid = tick(fading, DISCO_FADE_OUT / 2)
    expect(discoLevel(mid)).toBeGreaterThan(0.2)
    expect(discoLevel(mid)).toBeLessThan(0.8)
    const off = tick(fading, DISCO_FADE_OUT + 0.1)
    expect(off.phase).toBe('off')
    expect(discoLevel(off)).toBe(0)
  })

  it('o código de novo no meio apaga; de novo apagando, liga outra vez sem salto no nível', () => {
    const on = tick(code(DISCO_OFF), 5)
    const fading = code(on)
    expect(fading.phase).toBe('fading')
    const half = tick(fading, DISCO_FADE_OUT / 2)
    const again = code(half)
    expect(again.phase).toBe('on')
    expect(again.seq).toBe(on.seq + 1)
    expect(Math.abs(discoLevel(again) - discoLevel(half))).toBeLessThan(0.02)
  })

  it('bloqueado (tutorial, apresentação, trombada): fica na fila e liga quando libera', () => {
    const queued = code(DISCO_OFF, true)
    expect(queued.phase).toBe('queued')
    expect(discoLevel(queued)).toBe(0)
    expect(discoReversed(queued)).toBe(false)
    expect(tick(queued, 10, true).phase).toBe('queued')
    const on = tick(queued, 1 / 60, false)
    expect(on.phase).toBe('on')
    expect(on.seq).toBe(queued.seq + 1)
  })

  it('o código de novo na fila desiste', () => {
    expect(code(code(DISCO_OFF, true), true).phase).toBe('off')
  })

  it('algo que bloqueia no meio da festa apaga o disco', () => {
    const on = tick(code(DISCO_OFF), 3)
    expect(tick(on, 1 / 60, true).phase).toBe('fading')
  })

  it('desligado, o tick não muda nada', () => {
    expect(tick(DISCO_OFF, 5)).toEqual(DISCO_OFF)
  })
})

describe('discoBlocked', () => {
  it('tutorial, apresentação ou trombada seguram o disco; o modo de foco na nave, não', () => {
    expect(discoBlocked({ tutorial: false, presentation: false, crash: false })).toBe(false)
    expect(discoBlocked({ tutorial: true, presentation: false, crash: false })).toBe(true)
    expect(discoBlocked({ tutorial: false, presentation: true, crash: false })).toBe(true)
    expect(discoBlocked({ tutorial: false, presentation: false, crash: true })).toBe(true)
  })
})

describe('discoDance (a dancinha do Octocat)', () => {
  const out = { bob: 0, sway: 0, roll: 0 }
  it('parada sem disco ou com movimento reduzido', () => {
    expect(discoDance(3, 0, false, out)).toEqual({ bob: 0, sway: 0, roll: 0 })
    expect(discoDance(3, 1, true, out)).toEqual({ bob: 0, sway: 0, roll: 0 })
  })

  it('balança e quica com o nível, e dá um parafuso inteiro no começo', () => {
    let maxBob = 0
    let maxSway = 0
    let maxRoll = 0
    for (let t = 0; t < 6; t += 0.01) {
      discoDance(t, 1, false, out)
      maxBob = Math.max(maxBob, Math.abs(out.bob))
      maxSway = Math.max(maxSway, Math.abs(out.sway))
      maxRoll = Math.max(maxRoll, out.roll)
    }
    expect(maxBob).toBeGreaterThan(0.05)
    expect(maxSway).toBeGreaterThan(0.05)
    expect(maxRoll).toBeCloseTo(2 * Math.PI, 2)
    // o parafuso acaba (volta inteira = mesma pose)
    expect(discoDance(0.5 + BARREL_ROLL_SECONDS + 0.5, 1, false, out).roll).toBe(0)
    // e é proporcional ao nível no balanço
    discoDance(0.31, 1, false, out)
    const full = out.sway
    discoDance(0.31, 0.5, false, out)
    expect(out.sway).toBeCloseTo(full / 2, 9)
  })
})
