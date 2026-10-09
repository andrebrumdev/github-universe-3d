import { describe, expect, it } from 'vitest'
import {
  DIZZY_LEAK,
  DIZZY_SECONDS,
  DIZZY_TURNS,
  dragSpin,
  newDizziness,
  newSpin,
  releaseSpin,
  SPIN_PER_PX,
  spinFlatten,
  stepDizziness,
  stepSpin,
} from './spin'

describe('giro com inércia', () => {
  it('arrastando, gira junto com o mouse (radianos por px) e mede a velocidade', () => {
    let s = newSpin()
    s = dragSpin(s, 100, 0.1, false)
    expect(s.angle).toBeCloseTo(100 * SPIN_PER_PX)
    expect(s.velocity).toBeGreaterThan(0)
  })

  it('soltou: continua girando e freia sozinho até parar', () => {
    let s = { ...newSpin(), velocity: 12 }
    const a0 = s.angle
    for (let i = 0; i < 300; i++) s = stepSpin(s, 1 / 60, false)
    expect(s.angle).toBeGreaterThan(a0 + 1)
    expect(Math.abs(s.velocity)).toBeLessThan(0.05)
  })

  it('independe da taxa de quadros: 30, 60 e 144 fps dão o mesmo ângulo', () => {
    const at = (fps: number, seconds: number) => {
      let s = { ...newSpin(), velocity: 15 }
      for (let i = 0; i < Math.round(seconds * fps); i++) s = stepSpin(s, 1 / fps, false)
      return s
    }
    const ref = at(240, 1.5)
    for (const fps of [30, 60, 144]) {
      expect(at(fps, 1.5).angle).toBeCloseTo(ref.angle, 6)
      expect(at(fps, 1.5).velocity).toBeCloseTo(ref.velocity, 6)
    }
  })

  it('movimento reduzido: o arrasto gira direto, sem inércia; ao soltar, para na hora', () => {
    let s = dragSpin(newSpin(), 100, 0.1, true)
    expect(s.angle).toBeCloseTo(100 * SPIN_PER_PX)
    s = releaseSpin(s, true)
    expect(s.velocity).toBe(0)
    const before = s.angle
    s = stepSpin({ ...s, velocity: 10 }, 0.5, true)
    expect(s.angle).toBe(before)
  })

  it('girando rápido, o sol achata um pouco (squash); parado, nada', () => {
    expect(spinFlatten(0)).toBe(0)
    expect(spinFlatten(20)).toBeLessThan(0)
    expect(spinFlatten(20)).toBeGreaterThanOrEqual(-0.1)
    expect(spinFlatten(-20)).toBe(spinFlatten(20))
    expect(spinFlatten(5)).toBeGreaterThan(spinFlatten(15))
  })
})

describe('tontura: acumula |velocidade| e vaza de volta a zero', () => {
  const spinFor = (velocity: number, seconds: number, dt = 1 / 60) => {
    let d = newDizziness()
    let triggeredAt = -1
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      d = stepDizziness(d, velocity, dt, false)
      if (d.dizzyLeft > 0 && triggeredAt < 0) triggeredAt = i * dt
    }
    return { d, triggeredAt }
  }

  it('3–4 voltas rápidas em poucos segundos deixam o sol tonto', () => {
    const fast = 2 * 2 * Math.PI // 2 voltas por segundo
    const { triggeredAt } = spinFor(fast, 4)
    expect(triggeredAt).toBeGreaterThan(0)
    // voltas dadas até ficar tonto
    const turns = (fast * triggeredAt) / (2 * Math.PI)
    expect(turns).toBeGreaterThanOrEqual(3)
    expect(turns).toBeLessThanOrEqual(4.5)
    expect(DIZZY_TURNS).toBeGreaterThanOrEqual(3)
    expect(DIZZY_TURNS).toBeLessThanOrEqual(4)
  })

  it('girar devagar nunca deixa tonto (o vazamento ganha)', () => {
    expect(spinFor(DIZZY_LEAK * 0.9, 60).triggeredAt).toBe(-1)
  })

  it('o acumulado vaza de volta a zero depois de parar', () => {
    let { d } = spinFor(8, 1)
    expect(d.level).toBeGreaterThan(0)
    for (let i = 0; i < 600; i++) d = stepDizziness(d, 0, 1 / 60, false)
    expect(d.level).toBe(0)
  })

  it('tonto por ~3 s e depois passa; zera o acumulado ao disparar (não dispara de novo na hora)', () => {
    let { d } = spinFor(4 * 2 * Math.PI, 3)
    expect(d.dizzyLeft).toBeGreaterThan(0)
    let t = 0
    while (d.dizzyLeft > 0 && t < 10) {
      d = stepDizziness(d, 0, 1 / 60, false)
      t += 1 / 60
    }
    expect(t).toBeLessThanOrEqual(DIZZY_SECONDS + 1e-6)
    expect(DIZZY_SECONDS).toBeGreaterThanOrEqual(2.5)
    expect(DIZZY_SECONDS).toBeLessThanOrEqual(3.5)
  })

  it('movimento reduzido: nunca fica tonto', () => {
    let d = newDizziness()
    for (let i = 0; i < 600; i++) d = stepDizziness(d, 30, 1 / 60, true)
    expect(d.dizzyLeft).toBe(0)
    expect(d.level).toBe(0)
  })
})
