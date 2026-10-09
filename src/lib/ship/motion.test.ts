import { describe, expect, it } from 'vitest'
import {
  BLINK_EVERY,
  BURN_THRUST,
  burnJolt,
  burnThrust,
  COAST_THRUST,
  hoverOffset,
  isBlinking,
  JOLT_SECONDS,
  JOLT_SURGE,
  thrusterScale,
  WAVE_AMPLITUDE,
  waveAngle,
} from './motion'
import { ESCORT_THRUST } from './returnFlight'
import { ARRIVAL_TAIL } from './burn'

const times = Array.from({ length: 400 }, (_, i) => i * 0.037)

describe('movimento do Octocat', () => {
  it('flutua pouco', () => {
    for (const t of times) {
      const { y, roll } = hoverOffset(t)
      expect(Math.abs(y)).toBeLessThanOrEqual(0.06)
      expect(Math.abs(roll)).toBeLessThanOrEqual(0.03)
    }
  })

  it('o aceno fica dentro da amplitude', () => {
    for (const t of times) expect(Math.abs(waveAngle(t))).toBeLessThanOrEqual(WAVE_AMPLITUDE)
  })

  it('o propulsor apaga no nível 0 e tremula em volta do nível', () => {
    expect(thrusterScale(1.23, 0)).toBe(0)
    for (const t of times) {
      const s = thrusterScale(t, 1)
      expect(s).toBeGreaterThan(0.75)
      expect(s).toBeLessThan(1.25)
    }
  })

  it('pisca por um instante a cada BLINK_EVERY segundos', () => {
    expect(isBlinking(0.1)).toBe(true)
    expect(isBlinking(1)).toBe(false)
    expect(isBlinking(BLINK_EVERY + 0.05)).toBe(true)
    expect(times.filter(isBlinking).length / times.length).toBeLessThan(0.1)
  })

  it('nível do propulsor pela queima: chama-piloto na planagem, máximo (acima da viagem antiga) no auge', () => {
    expect(burnThrust(0)).toBe(COAST_THRUST)
    expect(COAST_THRUST).toBeLessThanOrEqual(0.06)
    expect(burnThrust(1)).toBe(BURN_THRUST)
    expect(BURN_THRUST).toBeGreaterThan(1)
    expect(burnThrust(-3)).toBe(COAST_THRUST)
    expect(burnThrust(7)).toBe(BURN_THRUST)
    for (let i = 1; i <= 20; i++) expect(burnThrust(i / 20)).toBeGreaterThan(burnThrust((i - 1) / 20))
    // a chegada termina no nível parado (a visita): sem estalo
    expect(Math.abs(burnThrust(ARRIVAL_TAIL) - ESCORT_THRUST)).toBeLessThan(0.02)
  })

  it('tranco da queima: começa em zero, limitado, amortece e some', () => {
    expect(burnJolt(-0.1)).toBe(0)
    expect(burnJolt(0)).toBe(0)
    expect(burnJolt(JOLT_SECONDS)).toBe(0)
    expect(burnJolt(JOLT_SECONDS + 1)).toBe(0)
    const ts = Array.from({ length: 200 }, (_, i) => (i / 200) * JOLT_SECONDS)
    const values = ts.map(burnJolt)
    for (const v of values) expect(Math.abs(v)).toBeLessThanOrEqual(JOLT_SURGE)
    // o primeiro pico é para a frente e o maior
    const first = Math.max(...values.slice(0, 50))
    expect(first).toBeGreaterThan(0.5 * JOLT_SURGE)
    expect(Math.max(...values.slice(100).map(Math.abs))).toBeLessThan(0.25 * first)
    // contínuo (sem estalo no fim)
    for (let i = 1; i < values.length; i++) expect(Math.abs(values[i] - values[i - 1])).toBeLessThan(0.1 * JOLT_SURGE)
    expect(Math.abs(burnJolt(JOLT_SECONDS - 1e-3))).toBeLessThan(0.02 * JOLT_SURGE)
  })
})
