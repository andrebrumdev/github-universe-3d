import { describe, expect, it } from 'vitest'
import { MIN_SHIP_DISTANCE } from '../ship/escort'
import { returnDuration } from '../ship/returnFlight'
import { dot, length, normalize, scale, sub } from '../ship/vec'
import type { Vec3 } from '../universe/orbits'
import {
  CRASH_DETOUR_SECONDS,
  CRASH_FREEZE,
  CRASH_RECOVER,
  crashBurnPhase,
  crashBurns,
  crashFaceWeight,
  crashHeading,
  crashLocal,
  crashLocalVelocity,
  crashTotal,
  crashWobble,
  planCrash,
  type CrashInput,
} from './crashApproach'

const ESCORT_RIGHT: Vec3 = [1.4, -0.75, -2.2]
const ESCORT_LEFT: Vec3 = [-0.5, -0.9, -3.1]

function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const randomUnit = (rnd: () => number): Vec3 => normalize([rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1])

/** Como na volta normal: o planeta lá na frente ou a nave em primeiro plano, parada ou em voo, nos dois cantos. */
function cases(): CrashInput[] {
  const rnd = seeded(7)
  return Array.from({ length: 60 }, (_, i) => {
    const right = i % 2 === 0
    const far = i % 3 !== 0
    return {
      start: far
        ? ([(rnd() * 2 - 1) * 30, (rnd() * 2 - 1) * 12, -10 - rnd() * 60] as Vec3)
        : ([(rnd() * 2 - 1) * 1.6, -0.3 - rnd() * 0.6, -2.6 - rnd() * 0.8] as Vec3),
      velocity: i % 5 === 0 ? scale(randomUnit(rnd), 30) : ([0, 0, 0] as Vec3),
      departure: randomUnit(rnd),
      escort: right ? ESCORT_RIGHT : ESCORT_LEFT,
      side: right ? (1 as const) : (-1 as const),
    }
  })
}

describe('trombada: o mergulho contra a lente', () => {
  it('parte de onde a nave está; até o impacto, a duração da volta normal mais o desvio até a mira', () => {
    for (const input of cases()) {
      const plan = planCrash(input)
      expect(plan.duration).toBeCloseTo(returnDuration(length(input.start)) + CRASH_DETOUR_SECONDS)
      expect(crashTotal(plan)).toBeCloseTo(plan.duration + CRASH_RECOVER)
      const p0 = crashLocal(plan, 0)
      for (let k = 0; k < 3; k++) expect(p0[k]).toBeCloseTo(input.start[k])
    }
  })

  it('bate exatamente na distância mínima da lente (a do keepAway), sem atravessar', () => {
    for (const input of cases()) {
      const plan = planCrash(input)
      expect(length(crashLocal(plan, plan.duration))).toBeCloseTo(MIN_SHIP_DISTANCE, 6)
      for (let i = 0; i <= 400; i++) {
        const t = (i / 400) * crashTotal(plan)
        expect(length(crashLocal(plan, t))).toBeGreaterThanOrEqual(MIN_SHIP_DISTANCE - 1e-9)
      }
    }
  })

  it('a mira fica perto do centro da tela, um pouco puxada para o canto da escolta', () => {
    for (const input of cases()) {
      const { aim } = planCrash(input)
      // à frente (−z), a menos de ~12° do centro
      expect(dot(aim, [0, 0, -1])).toBeGreaterThan(Math.cos((12 * Math.PI) / 180))
      expect(Math.sign(aim[0])).toBe(Math.sign(input.escort[0]))
      expect(aim[1]).toBeLessThan(0)
    }
  })

  it('a reta final é reta, sempre se aproximando e acelerando até a velocidade máxima do voo no impacto', () => {
    for (const input of cases()) {
      const plan = planCrash(input)
      const { aim, straightAt, duration } = plan
      let lastDistance = Infinity
      let lastSpeed = 0
      for (let i = 0; i <= 50; i++) {
        const t = straightAt + (i / 50) * (duration - straightAt)
        const p = crashLocal(plan, t)
        // na reta da mira: sem componente perpendicular
        expect(length(sub(p, scale(aim, dot(p, aim))))).toBeLessThan(1e-6)
        expect(length(p)).toBeLessThan(lastDistance)
        const speed = length(crashLocalVelocity(plan, t))
        expect(speed).toBeGreaterThanOrEqual(lastSpeed - 1e-9)
        lastDistance = length(p)
        lastSpeed = speed
      }
      // o impacto é o ponto mais rápido do voo inteiro ("rápido demais")
      for (let i = 0; i <= 200; i++) expect(length(crashLocalVelocity(plan, (i / 200) * duration))).toBeLessThanOrEqual(lastSpeed + 1e-6)
      expect(lastSpeed).toBeGreaterThan(10)
    }
  })

  it('antes da reta final não chega perto da lente (não enche a tela à toa)', () => {
    for (const input of cases()) {
      const plan = planCrash(input)
      const near = Math.min(length(input.start), 2 * MIN_SHIP_DISTANCE)
      for (let i = 0; i <= 200; i++) {
        const t = (i / 200) * plan.straightAt
        expect(length(crashLocal(plan, t))).toBeGreaterThanOrEqual(near - 1e-6)
      }
    }
  })

  it('motor: partida, planagem, máximo na reta, e nenhum puff de ré (não freia)', () => {
    const plan = planCrash(cases()[1])
    expect(crashBurns(plan).puffs).toEqual([])
    expect(crashBurnPhase(plan, 0).phase).toBe('departure')
    expect(crashBurnPhase(plan, (plan.straightAt + 0.18 * plan.duration) / 2).phase).toBe('coast')
    expect(crashBurnPhase(plan, plan.straightAt + 0.1)).toEqual({ phase: 'departure', intensity: 1 })
    expect(crashBurnPhase(plan, plan.duration + 0.5)).toEqual({ phase: 'arrival', intensity: 0 })
  })

  it('na reta vem de pé na tela e de cara para a lente', () => {
    const plan = planCrash(cases()[2])
    expect(crashFaceWeight(plan, plan.straightAt)).toBe(1)
    expect(crashFaceWeight(plan, 0)).toBe(0)
    const h = crashHeading(plan, plan.duration - 0.05)
    expect(dot(h, scale(plan.aim, -1))).toBeGreaterThan(0.999)
  })
})

describe('trombada: a recuperação', () => {
  it('congela colada no vidro, quica para trás e chega ao canto da escolta parada', () => {
    for (const input of cases()) {
      const plan = planCrash(input)
      const T = plan.duration
      for (const r of [0.01, CRASH_FREEZE / 2, CRASH_FREEZE]) {
        const p = crashLocal(plan, T + r)
        for (let k = 0; k < 3; k++) expect(p[k]).toBeCloseTo(plan.impact[k], 6)
      }
      // quica: se afasta da lente depois do congelamento
      expect(length(crashLocal(plan, T + 0.6))).toBeGreaterThan(MIN_SHIP_DISTANCE + 0.2)
      const end = crashLocal(plan, crashTotal(plan))
      for (let k = 0; k < 3; k++) expect(end[k]).toBeCloseTo(input.escort[k], 6)
      // chega parada (sem salto para a escolta)
      const before = crashLocal(plan, crashTotal(plan) - 0.01)
      expect(length(sub(before, end))).toBeLessThan(0.002)
    }
  })

  it('de cara para a lente depois do impacto, e nos três-quartos da escolta no fim', () => {
    const plan = planCrash(cases()[0])
    expect(dot(crashHeading(plan, plan.duration + 0.1), scale(plan.aim, -1))).toBeGreaterThan(0.999)
    expect(dot(crashHeading(plan, crashTotal(plan)), plan.face)).toBeGreaterThan(0.999)
  })

  it('bambeia tonta e para de bambear ao chegar ao canto', () => {
    let peak = 0
    for (let r = 0; r <= CRASH_RECOVER; r += 0.01) peak = Math.max(peak, Math.abs(crashWobble(r).roll))
    expect(peak).toBeGreaterThan(0.1)
    expect(crashWobble(0)).toEqual({ roll: 0, pitch: 0 })
    expect(Math.abs(crashWobble(CRASH_RECOVER - 0.01).roll)).toBeLessThan(0.01)
    expect(crashWobble(CRASH_RECOVER)).toEqual({ roll: 0, pitch: 0 })
  })
})
