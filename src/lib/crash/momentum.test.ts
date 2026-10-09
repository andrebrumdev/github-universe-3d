import { describe, expect, it } from 'vitest'
import type { ReturnInput } from '../ship/returnFlight'
import { mulberry32 } from '../universe/random'
import type { Vec3 } from '../universe/orbits'
import { returnMomentum } from './momentum'
import {
  CRASH_CHANCE,
  crashChance,
  INITIAL_CRASH_HISTORY,
  MAX_CRASH_CHANCE,
  MAX_MOMENTUM_FACTOR,
  MIN_MOMENTUM_FACTOR,
  momentumFactor,
  recordReturn,
  REFERENCE_SPEED,
  shouldCrash,
  type CrashContext,
} from './rarity'

/**
 * Voltas como acontecem no app (referencial da câmera): a maioria depois da visita, com a nave parada em primeiro
 * plano; algumas com a câmera ainda indo para o foco (nave mais longe); e as do meio de uma viagem, no embalo.
 */
function realisticReturns(seed: number, n: number): ReturnInput[] {
  const rnd = mulberry32(seed)
  const u = (a: number, b: number) => a + (b - a) * rnd()
  const unit = (): Vec3 => {
    const v: Vec3 = [u(-1, 1), u(-1, 1), u(-1, 1)]
    const l = Math.hypot(...v) || 1
    return [v[0] / l, v[1] / l, v[2] / l]
  }
  return Array.from({ length: n }, () => {
    const r = rnd()
    const right = rnd() < 0.5
    let start: Vec3
    let velocity: Vec3 = [0, 0, 0]
    if (r < 0.6) start = [u(-1.6, 1.6), u(-0.9, -0.3), u(-3.4, -2.6)]
    else if (r < 0.75) start = [u(-8, 8), u(-4, 4), u(-25, -5)]
    else {
      start = [u(-30, 30), u(-12, 12), u(-70, -10)]
      const speed = u(8, 40)
      const d = unit()
      velocity = [d[0] * speed, d[1] * speed, d[2] * speed]
    }
    return { start, velocity, departure: unit(), escort: right ? [1.4, -0.75, -2.2] : [-0.5, -0.9, -3.1], side: right ? 1 : -1 }
  })
}

const PLANET: CrashContext = { from: { kind: 'planet', name: 'repo' }, tutorial: false, presentation: false, reducedMotion: false }
const SEASONED = { returns: 3, sinceCrash: Infinity }

describe('embalo da volta', () => {
  it('a velocidade de referência é a mediana das voltas planejadas', () => {
    const speeds = realisticReturns(11, 1500).map(returnMomentum).sort((a, b) => a - b)
    const median = speeds[Math.floor(speeds.length / 2)]
    expect(Math.abs(REFERENCE_SPEED - median) / median).toBeLessThan(0.1)
  })

  it('volta do meio de uma viagem rápida tem mais embalo que a da nave parada na visita', () => {
    const parked: ReturnInput = { start: [0.8, -0.5, -3], velocity: [0, 0, 0], departure: [1, 0, 0], escort: [1.4, -0.75, -2.2], side: 1 }
    const rushing: ReturnInput = { ...parked, start: [10, 2, -50], velocity: [0, 0, 35] }
    expect(returnMomentum(rushing)).toBeGreaterThan(returnMomentum(parked) * 1.5)
  })
})

describe('a chance cresce com o embalo', () => {
  it('fator = (v / referência)^1,5, sobe sempre com a velocidade', () => {
    expect(momentumFactor(REFERENCE_SPEED)).toBeCloseTo(1)
    expect(momentumFactor(REFERENCE_SPEED * 1.2)).toBeCloseTo(1.2 ** 1.5)
    let last = 0
    for (let v = 0; v <= 4 * REFERENCE_SPEED; v += 0.25) {
      expect(momentumFactor(v)).toBeGreaterThanOrEqual(last)
      expect(crashChance(v)).toBeGreaterThanOrEqual(crashChance(v - 0.25))
      last = momentumFactor(v)
    }
  })

  it('o fator fica entre 0,5 e 3', () => {
    expect(MIN_MOMENTUM_FACTOR).toBe(0.5)
    expect(MAX_MOMENTUM_FACTOR).toBe(3)
    expect(momentumFactor(0)).toBe(0.5)
    expect(momentumFactor(REFERENCE_SPEED * 0.1)).toBe(0.5)
    expect(momentumFactor(REFERENCE_SPEED * 10)).toBe(3)
    expect(momentumFactor(Infinity)).toBe(3)
  })

  it('a chance final tem teto (~0,35): continua surpresa, nunca garantida', () => {
    expect(MAX_CRASH_CHANCE).toBeCloseTo(0.35)
    expect(CRASH_CHANCE * MAX_MOMENTUM_FACTOR).toBeGreaterThan(MAX_CRASH_CHANCE)
    expect(crashChance(REFERENCE_SPEED * 10)).toBe(MAX_CRASH_CHANCE)
    expect(crashChance(REFERENCE_SPEED)).toBeCloseTo(CRASH_CHANCE)
    // sem embalo informado, a chance de base
    expect(crashChance(undefined)).toBe(CRASH_CHANCE)
  })

  it('shouldCrash sorteia contra a chance do embalo', () => {
    const fast = REFERENCE_SPEED * 2
    const p = crashChance(fast)
    expect(shouldCrash(() => p - 0.001, SEASONED, { ...PLANET, momentum: fast })).toBe(true)
    expect(shouldCrash(() => p + 0.001, SEASONED, { ...PLANET, momentum: fast })).toBe(false)
    // devagar, o mesmo sorteio que bateria na velocidade de referência não bate
    expect(shouldCrash(() => CRASH_CHANCE - 0.01, SEASONED, { ...PLANET, momentum: REFERENCE_SPEED * 0.6 })).toBe(false)
  })

  it('as travas ganham de qualquer embalo', () => {
    const always = () => 0
    const fast = { ...PLANET, momentum: REFERENCE_SPEED * 10 }
    expect(shouldCrash(always, INITIAL_CRASH_HISTORY, fast)).toBe(false)
    expect(shouldCrash(always, recordReturn(SEASONED, true), fast)).toBe(false)
    expect(shouldCrash(always, SEASONED, { ...fast, tutorial: true })).toBe(false)
    expect(shouldCrash(always, SEASONED, { ...fast, presentation: true })).toBe(false)
    expect(shouldCrash(always, SEASONED, { ...fast, reducedMotion: true })).toBe(false)
    expect(shouldCrash(always, SEASONED, { ...fast, fromFocus: true })).toBe(false)
    expect(shouldCrash(always, SEASONED, { ...fast, from: null })).toBe(false)
    expect(shouldCrash(always, SEASONED, { ...fast, override: 'never' })).toBe(false)
    // e o ?crash continua forçando
    expect(shouldCrash(() => 0.99, INITIAL_CRASH_HISTORY, { ...PLANET, momentum: 0, override: 'force' })).toBe(true)
  })

  it('numa sessão simulada com voltas realistas, a taxa geral fica entre 8% e 15%', () => {
    const returns = realisticReturns(2026, 6000)
    const rng = mulberry32(99)
    let history = INITIAL_CRASH_HISTORY
    let crashes = 0
    for (const input of returns) {
      const crashed = shouldCrash(rng, history, { ...PLANET, momentum: returnMomentum(input) })
      if (crashed) crashes++
      history = recordReturn(history, crashed)
    }
    const rate = crashes / returns.length
    expect(rate).toBeGreaterThanOrEqual(0.08)
    expect(rate).toBeLessThanOrEqual(0.15)
  })
})
