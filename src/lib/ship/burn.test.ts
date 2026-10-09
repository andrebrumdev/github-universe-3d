import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../universe/orbits'
import {
  activePuff,
  ARRIVAL_TAIL,
  brakeFactor,
  brakeIntegral,
  burnPhaseAt,
  PUFF_MAX_SECONDS,
  PUFF_MIN_SECONDS,
  puffSchedule,
  type BurnPhase,
  type BurnWindows,
} from './burn'
import { frameFromPose } from './cameraFrame'
import { planReturn, returnBurnPhase, returnBurns } from './returnFlight'
import { BRAKE_SECONDS, burnPhase, planTransfer } from './transfer'
import type { TravelPath } from './travel'
import { length } from './vec'

const ring = (r: number, angle: number, y = 0): Vec3 => [Math.cos(angle) * r, y, -Math.sin(angle) * r]
const ORDER = ['departure', 'coast', 'arrival'] as const

/** Percorre o voo inteiro: fases só avançam (partida → planagem → chegada), todas aparecem, planagem com motor desligado. */
function expectOrdered(phaseAt: (t: number) => BurnPhase, duration: number) {
  const seen = new Set<string>()
  let prev = phaseAt(0)
  expect(prev).toEqual({ phase: 'departure', intensity: 1 })
  const n = 600
  for (let i = 0; i <= n; i++) {
    const p = phaseAt((i / n) * duration)
    seen.add(p.phase)
    expect(ORDER.indexOf(p.phase)).toBeGreaterThanOrEqual(ORDER.indexOf(prev.phase))
    expect(p.intensity).toBeGreaterThanOrEqual(0)
    expect(p.intensity).toBeLessThanOrEqual(1)
    if (p.phase === 'coast') expect(p.intensity).toBe(0)
    expect(Math.abs(p.intensity - prev.intensity)).toBeLessThan(0.12)
    prev = p
  }
  expect([...seen]).toEqual([...ORDER])
  expect(phaseAt(duration)).toEqual({ phase: 'arrival', intensity: ARRIVAL_TAIL })
}

/** Um puff só na chegada; a velocidade só cai dentro dele (antes, o cruzeiro), em uma curva, até zero no fim. */
function expectPuffBraking(path: TravelPath) {
  const { arrival, puffs } = path.burns
  const T = path.duration
  expect(puffs.length).toBe(1)
  expect(puffs[0].time).toBeCloseTo(arrival, 9)
  expect(puffs[0].time + puffs[0].duration).toBeCloseTo(T, 9)
  const speed = (t: number) => length(path.velocity(t))
  const cruise = speed(arrival)
  expect(cruise).toBeGreaterThan(0)
  // antes do puff não freia (a velocidade de cruzeiro não cai; Kepler ainda pode acelerar)
  for (let i = 1; i <= 30; i++) expect(speed(arrival - (0.25 * i) / 30)).toBeGreaterThan(cruise * 0.9)
  // dentro do puff, cai sem voltar até parar
  let prev = cruise
  for (let i = 1; i <= 300; i++) {
    const v = speed(arrival + ((T - arrival) * i) / 300)
    // (no começo da curva o freio ainda é quase zero: sobra a variação lenta de Kepler)
    expect(v).toBeLessThanOrEqual(prev * 1.002)
    prev = v
  }
  expect(speed(T)).toBeLessThan(1e-9)
}

describe('puff de ré da frenagem', () => {
  it('um só: os dois bicos juntos, do começo ao fim da janela, com toda a força', () => {
    const [one, ...rest] = puffSchedule(10, 10.7)
    expect(rest).toEqual([])
    expect(one.time).toBe(10)
    expect(one.duration).toBeCloseTo(0.7, 12)
    expect(one.strength).toBe(1)
    expect(puffSchedule(1.5, 1.5)).toEqual([])
    expect(BRAKE_SECONDS).toBeGreaterThanOrEqual(PUFF_MIN_SECONDS)
    expect(BRAKE_SECONDS).toBeLessThanOrEqual(PUFF_MAX_SECONDS)
  })

  it('o freio é uma curva só, suave, de 1 a 0 durante o puff, e a integral bate com a soma', () => {
    const puffs = puffSchedule(0, 0.7)
    expect(brakeFactor(puffs, 0)).toBe(1)
    expect(brakeFactor(puffs, 0.7)).toBe(0)
    let prev = 1
    for (let i = 1; i <= 100; i++) {
      const k = brakeFactor(puffs, (i / 100) * 0.7)
      expect(k).toBeLessThanOrEqual(prev)
      expect(prev - k).toBeLessThan(0.03)
      prev = k
    }
    expect(activePuff(puffs, 0.35)).toBe(0)
    expect(activePuff(puffs, -1)).toBe(-1)
    expect(activePuff(puffs, 0.8)).toBe(-1)
    let sum = 0
    const n = 20000
    for (let i = 0; i < n; i++) sum += brakeFactor(puffs, ((i + 0.5) / n) * 0.7) * (0.7 / n)
    expect(brakeIntegral(puffs, 0, 0.7)).toBeCloseTo(sum, 6)
  })
})

describe('fase do motor, igual para todo tipo de voo', () => {
  it('transferência partindo parada (escolta, tutorial)', () => {
    const path = planTransfer(ring(12, 0.3, 0.5), ring(45, 0.3 + Math.PI * 0.9, -2))
    expectOrdered((t) => burnPhase(path, t), path.duration)
    expectPuffBraking(path)
  })

  it('troca de destino no meio do voo: a correção é a queima de partida', () => {
    const first = planTransfer(ring(12, 0), ring(45, 2.6))
    const t = first.duration * 0.45
    const path = planTransfer(first.point(t), ring(20, 4.2), { velocity: first.velocity(t) })
    expectOrdered((s) => burnPhase(path, s), path.duration)
    expectPuffBraking(path)
  })

  it('salto da apresentação (sai da visita em primeiro plano, perto da lente)', () => {
    const lens = frameFromPose({ position: [10, 8, 30], target: ring(15, 1.2) })
    const path = planTransfer([8, 7, 27], ring(40, 2.4), { lens })
    expectOrdered((t) => burnPhase(path, t), path.duration)
    expectPuffBraking(path)
  })

  it('com estilingue: o sobrevoo é planado e a frenagem fica no último trecho', () => {
    const from = ring(12, 0)
    const to = ring(60, Math.PI)
    const direct = planTransfer(from, to)
    const giant = { name: 'gigante', position: direct.point(direct.duration * 0.5), radius: 2.8, extent: 4.5 }
    const path = planTransfer(from, to, { bodies: [giant] })
    expect(path.assist).not.toBeNull()
    expect(path.burns.arrival).toBeGreaterThan(path.assist!.end)
    // a frenagem é a da viagem toda (não encolhe com o último trecho)
    expect(path.duration - path.burns.arrival).toBeGreaterThanOrEqual(Math.min(BRAKE_SECONDS, 0.85 * (path.duration - path.assist!.end)) - 1e-9)
    expectOrdered((t) => burnPhase(path, t), path.duration)
    expectPuffBraking(path)
  })

  it('volta para a escolta: sai do planeta queimando, plana por trás da câmera e freia com os puffs', () => {
    for (const start of [
      [12, 3, -40],
      [-0.8, -0.5, -2.8],
    ] as Vec3[]) {
      const plan = planReturn({ start, velocity: [0, 0, 0], departure: [1, 0, 0], escort: [1.4, -0.75, -2.2], side: 1 })
      expectOrdered((t) => returnBurnPhase(plan, t), plan.duration)
      const { arrival, puffs } = returnBurns(plan)
      expect(puffs.length).toBe(1)
      expect(puffs[0].time).toBeCloseTo(arrival, 9)
      expect(puffs[0].duration).toBeGreaterThanOrEqual(PUFF_MIN_SECONDS - 1e-9)
      expect(puffs[0].duration).toBeLessThanOrEqual(PUFF_MAX_SECONDS)
    }
  })

  it('janelas vazias: sem queima, o voo inteiro é planagem', () => {
    const none: BurnWindows = { departure: 0, arrival: 5, puffs: [] }
    for (const t of [0, 1, 4.9, 5, 6]) expect(burnPhaseAt(none, 5, t)).toEqual({ phase: 'coast', intensity: 0 })
  })
})
