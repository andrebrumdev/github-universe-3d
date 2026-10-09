import { describe, expect, it } from 'vitest'
import { activePuff } from '../ship/burn'
import { MIN_SHIP_DISTANCE } from '../ship/escort'
import { dot, length, normalize, scale, sub } from '../ship/vec'
import { mulberry32 } from '../universe/random'
import type { Vec3 } from '../universe/orbits'
import {
  CRASH_FREEZE,
  CRASH_MAX_TURN_RATE,
  CRASH_RECOVER,
  crashBurnPhase,
  crashBurns,
  crashFaceWeight,
  crashHeading,
  crashHoldsCamera,
  crashLocal,
  crashLocalVelocity,
  crashTotal,
  crashWobble,
  planCrash,
  type CrashInput,
  type CrashPlan,
} from './crashApproach'

const ESCORT_RIGHT: Vec3 = [1.4, -0.75, -2.2]
const ESCORT_LEFT: Vec3 = [-0.5, -0.9, -3.1]

/** Voltas como no app: parada na visita (perto da lente), câmera ainda indo ao foco, e no meio de uma viagem. */
function cases(): CrashInput[] {
  const rnd = mulberry32(7)
  const u = (a: number, b: number) => a + (b - a) * rnd()
  const unit = (): Vec3 => normalize([u(-1, 1), u(-1, 1), u(-1, 1)])
  return Array.from({ length: 90 }, (_, i) => {
    const right = i % 2 === 0
    const kind = i % 3
    const start: Vec3 =
      kind === 0 ? [u(-1.6, 1.6), u(-0.9, -0.3), u(-3.4, -2.6)] : kind === 1 ? [u(-8, 8), u(-4, 4), u(-25, -5)] : [u(-30, 30), u(-12, 12), u(-70, -10)]
    return {
      start,
      velocity: kind === 2 ? scale(unit(), u(8, 40)) : ([0, 0, 0] as Vec3),
      departure: unit(),
      escort: right ? ESCORT_RIGHT : ESCORT_LEFT,
      side: right ? (1 as const) : (-1 as const),
    }
  })
}

/** Os planos dos casos, feitos uma vez por arquivo (cada um testa 13 tomadas candidatas). */
let planned: { input: CrashInput; plan: CrashPlan }[] | null = null
const plans = () => (planned ??= cases().map((input) => ({ input, plan: planCrash(input) })))
/** Arquivo pesado (90 voos amostrados a 240 Hz): folga para a suíte inteira rodando junto. */
const SLOW = { timeout: 30_000 }

const DT = 1 / 240
/** O mergulho dura ao menos isto (s): uns 6 quadros a 60 fps. */
const MIN_DASH = 0.1
/** Instantes do voo inteiro até o impacto, e só os do mergulho (da tomada ao impacto). */
const flightTimes = (plan: CrashPlan) => Array.from({ length: Math.ceil(plan.duration / DT) + 1 }, (_, i) => Math.min(plan.duration, i * DT))
const dashTimes = (plan: CrashPlan) => flightTimes(plan).filter((t) => t >= plan.takeover)

describe('trombada: um só embalo até a lente', SLOW, () => {
  it('começa como a volta normal, de onde a nave está e com a velocidade que ela tinha', () => {
    for (const { input, plan } of plans()) {
      const p0 = crashLocal(plan, 0)
      for (let k = 0; k < 3; k++) expect(p0[k]).toBeCloseTo(input.start[k], 6)
      const v0 = crashLocalVelocity(plan, 0)
      expect(length(sub(v0, input.velocity))).toBeLessThan(1e-3 * Math.max(1, length(input.velocity)))
    }
  })

  it('a trombada assume a volta na planagem (antes do puff): posição e velocidade contínuas (C¹)', () => {
    for (const { plan } of plans()) {
      expect(plan.takeover).toBeGreaterThanOrEqual(plan.ret.burns.departure)
      expect(plan.takeover).toBeLessThanOrEqual(plan.ret.burns.arrival)
      const e = 1e-4
      const before = crashLocal(plan, plan.takeover - e)
      const after = crashLocal(plan, plan.takeover + e)
      expect(length(sub(after, before))).toBeLessThan(2 * e * plan.vImpact + 1e-6)
      const vb = crashLocalVelocity(plan, plan.takeover - e)
      const va = crashLocalVelocity(plan, plan.takeover + e)
      expect(length(sub(va, vb))).toBeLessThan(0.01 * length(vb) + 0.05)
    }
  })

  it('velocidade contínua da planagem ao impacto (nenhum salto, nem na tomada)', () => {
    for (const { plan } of plans()) {
      const top = length(crashLocalVelocity(plan, plan.duration))
      const times = flightTimes(plan).filter((t) => t >= plan.takeover - 0.05)
      let last = crashLocalVelocity(plan, times[0])
      for (const t of times.slice(1)) {
        const v = crashLocalVelocity(plan, t)
        // num passo de 1/240 s, a velocidade muda pouco (aceleração limitada, sem quina)
        expect(length(sub(v, last))).toBeLessThan(0.08 * top + 0.5)
        last = v
      }
    }
  })

  it('da planagem ao impacto a rapidez só sobe (sem parar), e o impacto é o ponto mais rápido do voo', () => {
    for (const { input, plan } of plans()) {
      let last = -Infinity
      for (const t of dashTimes(plan)) {
        const s = length(crashLocalVelocity(plan, t))
        expect(s).toBeGreaterThanOrEqual(last - 1e-6)
        last = s
      }
      for (const t of flightTimes(plan)) expect(length(crashLocalVelocity(plan, t))).toBeLessThanOrEqual(last + 1e-6)
      expect(last).toBeGreaterThanOrEqual(1.2 * length(input.velocity) - 1e-6)
      expect(last).toBeGreaterThan(10)
    }
  })

  it('sem girar no lugar: no mergulho a frente vira devagar (taxa de giro limitada) e sempre segue a velocidade', () => {
    for (const { plan } of plans()) {
      const times = dashTimes(plan)
      let last = crashHeading(plan, times[0])
      for (const t of times.slice(1)) {
        const h = crashHeading(plan, t)
        const v = crashLocalVelocity(plan, t)
        if (length(v) > 1e-3) expect(dot(h, normalize(v))).toBeGreaterThan(0.999)
        const turn = Math.acos(Math.min(1, Math.max(-1, dot(h, last))))
        expect(turn / DT).toBeLessThanOrEqual(CRASH_MAX_TURN_RATE)
        last = h
      }
    }
  })

  it('bate exatamente na distância mínima da lente (a do keepAway), sem atravessar, vindo da frente', () => {
    for (const { plan } of plans()) {
      expect(length(crashLocal(plan, plan.duration))).toBeCloseTo(MIN_SHIP_DISTANCE, 6)
      for (let i = 0; i <= 400; i++) {
        const t = (i / 400) * crashTotal(plan)
        expect(length(crashLocal(plan, t))).toBeGreaterThanOrEqual(MIN_SHIP_DISTANCE - 1e-9)
      }
      // o fim do mergulho vem pela frente da lente (a tomada pode ser ainda ao lado dela, fora do quadro) e entra
      // nela em diagonal — contra o vidro, não de raspão
      for (const t of dashTimes(plan)) if (t >= plan.takeover + 0.7 * (plan.duration - plan.takeover)) expect(crashLocal(plan, t)[2]).toBeLessThan(0)
      expect(dot(crashHeading(plan, plan.duration), scale(normalize(plan.impact), -1))).toBeGreaterThan(0.4)
    }
  })

  it('o mergulho dura vários quadros (não é um teletransporte) e não se arrasta', () => {
    for (const { plan } of plans()) {
      expect(plan.duration - plan.takeover).toBeGreaterThan(MIN_DASH)
      expect(plan.duration - plan.takeover).toBeLessThan(2.2)
    }
  })

  it('motor ligado o mergulho todo, sem puff de ré (nunca freia) nem fase de chegada antes do impacto', () => {
    for (const { plan } of plans()) {
      expect(crashBurns(plan).puffs).toEqual([])
      for (const t of flightTimes(plan)) {
        expect(activePuff(crashBurns(plan).puffs, t)).toBe(-1)
        expect(crashBurnPhase(plan, t).phase === 'arrival' && t < plan.duration).toBe(false)
      }
      for (const t of dashTimes(plan)) {
        if (t < plan.duration) {
          const burn = crashBurnPhase(plan, t)
          expect(burn.phase).toBe('departure')
          expect(burn.intensity).toBe(1)
        }
      }
      expect(crashBurnPhase(plan, plan.duration + 0.5)).toEqual({ phase: 'arrival', intensity: 0 })
    }
  })

  it('a câmera fica onde está até o impacto (não vai para a visão geral nem mistura enquadramento de chegada)', () => {
    const plan = plans()[0].plan
    for (const t of flightTimes(plan)) if (t < plan.duration) expect(crashHoldsCamera(plan, t)).toBe(true)
    expect(crashHoldsCamera(plan, plan.duration)).toBe(false)
    expect(crashHoldsCamera(plan, plan.duration + 1)).toBe(false)
    expect(crashHoldsCamera(null, 0)).toBe(false)
    // sem janela de chegada antes do impacto: nada pede o enquadramento final (o peso de chegada fica em 0)
    expect(crashBurns(plan).arrival).toBe(plan.duration)
  })

  it('inclina nas curvas e chega de pé na tela', () => {
    const plan = plans()[1].plan
    expect(crashFaceWeight(plan, 0)).toBe(0)
    expect(crashFaceWeight(plan, plan.duration)).toBe(1)
  })
})

describe('trombada: a recuperação', SLOW, () => {
  it('congela colada no vidro, quica para trás e chega ao canto da escolta parada', () => {
    for (const { input, plan } of plans()) {
      const T = plan.duration
      for (const r of [0.01, CRASH_FREEZE / 2, CRASH_FREEZE]) {
        const p = crashLocal(plan, T + r)
        for (let k = 0; k < 3; k++) expect(p[k]).toBeCloseTo(plan.impact[k], 6)
      }
      expect(length(crashLocal(plan, T + 0.6))).toBeGreaterThan(MIN_SHIP_DISTANCE + 0.2)
      const end = crashLocal(plan, crashTotal(plan))
      for (let k = 0; k < 3; k++) expect(end[k]).toBeCloseTo(input.escort[k], 6)
      const before = crashLocal(plan, crashTotal(plan) - 0.01)
      expect(length(sub(before, end))).toBeLessThan(0.002)
    }
  })

  it('de cara para a lente depois do impacto, e nos três-quartos da escolta no fim', () => {
    const plan = plans()[0].plan
    expect(dot(crashHeading(plan, plan.duration + CRASH_FREEZE), scale(normalize(plan.impact), -1))).toBeGreaterThan(0.999)
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
