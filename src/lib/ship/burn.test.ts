import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../universe/orbits'
import { ARRIVAL_TAIL, burnPhaseAt, type BurnPhase, type BurnWindows } from './burn'
import { frameFromPose } from './cameraFrame'
import { planReturn, returnBurnPhase } from './returnFlight'
import { burnPhase, planTransfer } from './transfer'

const ring = (r: number, angle: number, y = 0): Vec3 => [Math.cos(angle) * r, y, -Math.sin(angle) * r]
const ORDER = ['departure', 'coast', 'arrival'] as const

/** Percorre o voo inteiro: fases só avançam (partida → planagem → chegada), todas aparecem, planagem com motor desligado. */
function expectHohmann(phaseAt: (t: number) => BurnPhase, duration: number) {
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
    // sem estalo na chama
    expect(Math.abs(p.intensity - prev.intensity)).toBeLessThan(0.12)
    prev = p
  }
  expect([...seen]).toEqual([...ORDER])
  expect(phaseAt(duration)).toEqual({ phase: 'arrival', intensity: ARRIVAL_TAIL })
}

describe('fase do motor, igual para todo tipo de voo', () => {
  it('transferência de Hohmann partindo parada (escolta, tutorial)', () => {
    const path = planTransfer(ring(12, 0.3, 0.5), ring(45, 0.3 + Math.PI * 0.9, -2))
    expectHohmann((t) => burnPhase(path, t), path.duration)
  })

  it('troca de destino no meio do voo: a correção é a queima de partida', () => {
    const first = planTransfer(ring(12, 0), ring(45, 2.6))
    const t = first.duration * 0.45
    const path = planTransfer(first.point(t), ring(20, 4.2), { velocity: first.velocity(t) })
    expectHohmann((s) => burnPhase(path, s), path.duration)
  })

  it('salto da apresentação (sai da visita em primeiro plano, perto da lente)', () => {
    const lens = frameFromPose({ position: [10, 8, 30], target: ring(15, 1.2) })
    const from: Vec3 = [8, 7, 27]
    const path = planTransfer(from, ring(40, 2.4), { lens })
    expectHohmann((t) => burnPhase(path, t), path.duration)
  })

  it('volta para a escolta: sai do planeta queimando, plana por trás da câmera e queima para assentar no canto', () => {
    for (const start of [
      [12, 3, -40],
      [-0.8, -0.5, -2.8],
    ] as Vec3[]) {
      const plan = planReturn({ start, velocity: [0, 0, 0], departure: [1, 0, 0], escort: [1.4, -0.75, -2.2], side: 1 })
      expectHohmann((t) => returnBurnPhase(plan, t), plan.duration)
    }
  })

  it('janelas vazias: sem queima, o voo inteiro é planagem', () => {
    const none: BurnWindows = { departure: 0, arrival: 5 }
    for (const t of [0, 1, 4.9, 5, 6]) expect(burnPhaseAt(none, 5, t)).toEqual({ phase: 'coast', intensity: 0 })
  })
})
