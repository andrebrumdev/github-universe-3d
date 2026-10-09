import { describe, expect, it } from 'vitest'
import {
  BLINK_EVERY,
  BURN_THRUST,
  burnJolt,
  COAST_THRUST,
  flameLevel,
  settleThrust,
  THRUST_STEP,
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

  it('chama por fase: pico na ignição acima da queima forte, chama-piloto pequena (e visível) na planagem e na frenagem', () => {
    const dep = (t: number) => flameLevel({ phase: 'departure', intensity: 1 }, t)
    const spike = Math.max(...Array.from({ length: 30 }, (_, i) => dep(i / 100)))
    const hold = dep(0.6)
    expect(hold).toBeCloseTo(BURN_THRUST, 2)
    expect(spike).toBeGreaterThan(hold + 0.2)
    // o pico é curto: em ~0,2 s ele já passou do máximo, e logo some
    const peakAt = Array.from({ length: 30 }, (_, i) => i / 100).reduce((a, t) => (dep(t) > dep(a) ? t : a), 0)
    expect(peakAt).toBeLessThan(0.15)
    expect(dep(0.5) - hold).toBeLessThan(0.05)
    expect(dep(0)).toBeCloseTo(BURN_THRUST, 5)
    const coast = flameLevel({ phase: 'coast', intensity: 0 }, 3)
    expect(coast).toBe(COAST_THRUST)
    // nunca apaga: a chama-piloto se vê da câmera de trás, bem menor que a partida
    expect(COAST_THRUST).toBeGreaterThanOrEqual(0.35)
    expect(COAST_THRUST).toBeLessThanOrEqual(0.45)
    expect(hold).toBeGreaterThan(2.5 * coast)
    // na frenagem o motor principal fica na chama-piloto (quem freia são os puffs)
    expect(flameLevel({ phase: 'arrival', intensity: 0 }, 6)).toBe(COAST_THRUST)
    // no fim do voo ainda é a chama-piloto; o assentamento no nível parado é com settleThrust (sem estalo)
    expect(flameLevel({ phase: 'arrival', intensity: ARRIVAL_TAIL }, 7)).toBe(COAST_THRUST)
    expect(flameLevel({ phase: 'departure', intensity: 5 }, 9)).toBe(BURN_THRUST)
    expect(flameLevel({ phase: 'coast', intensity: -1 }, 1)).toBe(COAST_THRUST)
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

  it('parada, a chama assenta no nível dela aos poucos (em degraus de THRUST_STEP, sem passar do alvo)', () => {
    let level = COAST_THRUST
    const seen: number[] = []
    for (let i = 0; i < 120; i++) {
      const next = settleThrust(level, ESCORT_THRUST, 1 / 60)
      expect(next).toBeLessThanOrEqual(level)
      expect(next).toBeGreaterThanOrEqual(ESCORT_THRUST - 1e-9)
      expect(level - next).toBeLessThanOrEqual(THRUST_STEP + 1e-9)
      seen.push(next)
      level = next
    }
    expect(level).toBeCloseTo(ESCORT_THRUST, 9)
    // leva um instante (não salta), e acaba em menos de 1 s
    expect(seen.filter((v) => v > ESCORT_THRUST + 1e-9).length).toBeGreaterThan(8)
    expect(seen.filter((v) => v > ESCORT_THRUST + 1e-9).length).toBeLessThan(60)
    expect(settleThrust(0.25, 0.8, 1 / 60)).toBeGreaterThan(0.25)
    expect(settleThrust(0.5, 0.5, 1 / 60)).toBe(0.5)
  })
})
