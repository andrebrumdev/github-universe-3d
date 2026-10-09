import { describe, expect, it } from 'vitest'
import {
  DIZZY_COOLDOWN,
  DIZZY_LEAK,
  DIZZY_SECONDS,
  DIZZY_THRESHOLD,
  HEAD_SHAKE_SECONDS,
  headShakeAngle,
  newDizziness,
  stepDizziness,
  type Dizziness,
  type DizzyEvent,
} from './dizzy'

const FAST = 14 // rad/s: o giro solto mais rápido (MAX_SPIN)

/** `seconds` a `speed` rad/s, a 60 fps; devolve os eventos na ordem. */
function spinFor(d: Dizziness, speed: number, seconds: number, reduced = false): DizzyEvent[] {
  const events: DizzyEvent[] = []
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const e = stepDizziness(d, speed, 1 / 60, reduced)
    if (e) events.push(e)
  }
  return events
}

/** Gira rápido até ficar tonto (para no quadro em que fica). */
function spinUntilDizzy(d: Dizziness): number {
  for (let i = 1; i <= 600; i++) if (stepDizziness(d, FAST, 1 / 60, false) === 'dizzy') return i / 60
  throw new Error('não ficou tonto em 10 s')
}

/** Até a transição pedida, parado (para no quadro dela). */
function waitFor(d: Dizziness, event: DizzyEvent): void {
  for (let i = 0; i < 600; i++) if (stepDizziness(d, 0, 1 / 60, false) === event) return
  throw new Error(`sem ${event} em 10 s`)
}

describe('tonto de tanto girar', () => {
  it('acumula o quanto girou (|ω|·t)', () => {
    const d = newDizziness()
    spinFor(d, 2, 1)
    // sem vazamento seria 2 rad; com ele, um pouco menos
    expect(d.level).toBeGreaterThan(2 * (1 - DIZZY_LEAK / 2) - 0.05)
    expect(d.level).toBeLessThan(2)
    expect(d.state).toBe('ok')
  })

  it('parado, o acumulado vaza de volta para zero', () => {
    const d = newDizziness()
    spinFor(d, FAST, 0.5)
    const before = d.level
    spinFor(d, 0, 2)
    expect(d.level).toBeLessThan(before * Math.exp(-DIZZY_LEAK * 2) + 1e-6)
    spinFor(d, 0, 30)
    expect(d.level).toBeLessThan(1e-3)
  })

  it('passa do limite (umas 3 a 4 voltas rápidas em poucos segundos): fica tonto, uma vez', () => {
    expect(DIZZY_THRESHOLD).toBeGreaterThanOrEqual(3 * 2 * Math.PI * 0.8)
    expect(DIZZY_THRESHOLD).toBeLessThanOrEqual(4 * 2 * Math.PI)
    const d = newDizziness()
    const events = spinFor(d, FAST, 3)
    expect(events[0]).toBe('dizzy')
    expect(d.state).not.toBe('ok')
  })

  it('girar devagar, mesmo por muito tempo, não deixa tonto (o vazamento ganha)', () => {
    const d = newDizziness()
    expect(spinFor(d, 2, 60)).toEqual([])
  })

  it('tonto por ~3 s, depois balança a cabeça e volta ao normal', () => {
    const d = newDizziness()
    spinUntilDizzy(d)
    const events = spinFor(d, 0, DIZZY_SECONDS + HEAD_SHAKE_SECONDS + 0.1)
    expect(events).toEqual(['recovering', 'recovered'])
    expect(d.state).toBe('ok')
  })

  it('não dispara de novo enquanto está tonto, mesmo girando', () => {
    const d = newDizziness()
    expect(spinUntilDizzy(d)).toBeLessThan(3)
    expect(spinFor(d, FAST, DIZZY_SECONDS - 0.5)).toEqual([])
    expect(d.state).toBe('dizzy')
  })

  it('depois de se recuperar, um tempo de folga antes de poder ficar tonto de novo', () => {
    const d = newDizziness()
    spinUntilDizzy(d)
    waitFor(d, 'recovered')
    expect(d.level).toBe(0)
    // girando forte logo depois: nada na folga…
    expect(spinFor(d, FAST, DIZZY_COOLDOWN - 0.1)).toEqual([])
    expect(d.level).toBe(0)
    // …e depois dela precisa acumular de novo
    expect(spinFor(d, FAST, 3)).toContain('dizzy')
  })

  it('o tempo desde que ficou tonto anda, e é −1 fora disso', () => {
    const d = newDizziness()
    expect(d.since).toBe(-1)
    spinFor(d, FAST, 3)
    expect(d.since).toBeGreaterThanOrEqual(0)
  })

  it('movimento reduzido: nunca fica tonto', () => {
    const d = newDizziness()
    expect(spinFor(d, FAST, 20, true)).toEqual([])
    expect(d.level).toBe(0)
    expect(d.state).toBe('ok')
  })

  it('a balançada de cabeça vai e volta algumas vezes e termina parada', () => {
    expect(headShakeAngle(-0.1)).toBe(0)
    expect(headShakeAngle(HEAD_SHAKE_SECONDS)).toBe(0)
    let crossings = 0
    let last = 0
    let peak = 0
    for (let t = 0.005; t < HEAD_SHAKE_SECONDS; t += 0.005) {
      const a = headShakeAngle(t)
      if (Math.sign(a) !== Math.sign(last) && last !== 0) crossings++
      peak = Math.max(peak, Math.abs(a))
      last = a
    }
    expect(crossings).toBeGreaterThanOrEqual(3)
    expect(peak).toBeGreaterThan(0.15)
    expect(peak).toBeLessThan(0.6)
    expect(Math.abs(headShakeAngle(HEAD_SHAKE_SECONDS - 0.01))).toBeLessThan(0.05)
  })
})

