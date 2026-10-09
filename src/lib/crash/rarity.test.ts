import { describe, expect, it } from 'vitest'
import {
  CRASH_CHANCE,
  CRASH_COOLDOWN,
  crashOverride,
  INITIAL_CRASH_HISTORY,
  recordReturn,
  shouldCrash,
  type CrashContext,
  type CrashHistory,
} from './rarity'

const PLANET: CrashContext = { from: { kind: 'planet', name: 'repo' }, tutorial: false, presentation: false, reducedMotion: false }
/** Já viu uma volta normal e nenhuma trombada. */
const SEASONED: CrashHistory = { returns: 3, sinceCrash: Infinity }
const always = () => 0
const never = () => 0.999

describe('trombada rara: quando pode acontecer', () => {
  it('é rara: cerca de 1 em 10 voltas', () => {
    expect(CRASH_CHANCE).toBeCloseTo(0.1)
    expect(shouldCrash(() => CRASH_CHANCE - 0.001, SEASONED, PLANET)).toBe(true)
    expect(shouldCrash(() => CRASH_CHANCE + 0.001, SEASONED, PLANET)).toBe(false)
  })

  it('a taxa medida com o histórico real (cooldown incluso) fica perto de 1 em 10', () => {
    let seed = 7
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    let history = INITIAL_CRASH_HISTORY
    let crashes = 0
    const n = 20000
    for (let i = 0; i < n; i++) {
      const crashed = shouldCrash(rng, history, PLANET)
      if (crashed) crashes++
      history = recordReturn(history, crashed)
    }
    // o cooldown baixa um pouco a taxa bruta (0,1 → ~0,07), nunca a deixa comum
    expect(crashes / n).toBeGreaterThan(0.05)
    expect(crashes / n).toBeLessThan(0.1)
  })

  it('nunca na primeira volta da sessão', () => {
    expect(shouldCrash(always, INITIAL_CRASH_HISTORY, PLANET)).toBe(false)
    expect(shouldCrash(always, recordReturn(INITIAL_CRASH_HISTORY, false), PLANET)).toBe(true)
  })

  it('nunca duas seguidas, e espera ao menos 4 voltas depois de uma', () => {
    expect(CRASH_COOLDOWN).toBeGreaterThanOrEqual(4)
    let history = recordReturn(recordReturn(INITIAL_CRASH_HISTORY, false), true)
    for (let i = 0; i < CRASH_COOLDOWN; i++) {
      expect(shouldCrash(always, history, PLANET)).toBe(false)
      history = recordReturn(history, false)
    }
    expect(shouldCrash(always, history, PLANET)).toBe(true)
  })

  it('só na volta de um planeta ou do sol', () => {
    expect(shouldCrash(always, SEASONED, { ...PLANET, from: { kind: 'sun' } })).toBe(true)
    expect(shouldCrash(always, SEASONED, { ...PLANET, from: null })).toBe(false)
  })

  it('nunca no tutorial, na apresentação nem com movimento reduzido', () => {
    expect(shouldCrash(always, SEASONED, { ...PLANET, tutorial: true })).toBe(false)
    expect(shouldCrash(always, SEASONED, { ...PLANET, presentation: true })).toBe(false)
    expect(shouldCrash(always, SEASONED, { ...PLANET, reducedMotion: true })).toBe(false)
  })

  it('fora das exclusões, o sorteio decide (o gerador é injetável)', () => {
    expect(shouldCrash(never, SEASONED, PLANET)).toBe(false)
    const calls: number[] = []
    shouldCrash(() => (calls.push(1), 0.5), SEASONED, PLANET)
    expect(calls).toHaveLength(1)
    // inelegível: nem sorteia (o gerador não é consumido)
    shouldCrash(() => (calls.push(1), 0.5), INITIAL_CRASH_HISTORY, PLANET)
    expect(calls).toHaveLength(1)
  })

  it('?crash força (ignora a raridade, nunca as exclusões); ?nocrash desliga', () => {
    expect(shouldCrash(never, INITIAL_CRASH_HISTORY, { ...PLANET, override: 'force' })).toBe(true)
    expect(shouldCrash(never, recordReturn(SEASONED, true), { ...PLANET, override: 'force' })).toBe(true)
    expect(shouldCrash(always, SEASONED, { ...PLANET, override: 'force', reducedMotion: true })).toBe(false)
    expect(shouldCrash(always, SEASONED, { ...PLANET, override: 'force', tutorial: true })).toBe(false)
    expect(shouldCrash(always, SEASONED, { ...PLANET, override: 'never' })).toBe(false)
  })
})

describe('histórico das voltas', () => {
  it('conta as voltas e as voltas normais desde a última trombada', () => {
    const a = recordReturn(INITIAL_CRASH_HISTORY, false)
    expect(a).toEqual({ returns: 1, sinceCrash: Infinity })
    const b = recordReturn(a, true)
    expect(b).toEqual({ returns: 2, sinceCrash: 0 })
    expect(recordReturn(b, false)).toEqual({ returns: 3, sinceCrash: 1 })
  })
})

describe('parâmetros da URL', () => {
  it('?nocrash desliga em qualquer build', () => {
    expect(crashOverride('?nocrash', false)).toBe('never')
    expect(crashOverride('?nobloom&nocrash', true)).toBe('never')
  })

  it('?crash força só em desenvolvimento', () => {
    expect(crashOverride('?nobloom&crash', true)).toBe('force')
    expect(crashOverride('?crash', false)).toBeNull()
  })

  it('sem parâmetro, nada muda', () => {
    expect(crashOverride('', true)).toBeNull()
    expect(crashOverride('?crashed', true)).toBeNull()
  })
})
