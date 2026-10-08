import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../universe/orbits'
import {
  bezierPoint,
  bezierTangent,
  MAX_TRAVEL_SECONDS,
  MIN_TRAVEL_SECONDS,
  minSunDistance,
  planTravel,
  SUN_SAFE_DISTANCE,
  travelDuration,
  travelProgress,
} from './travel'
import { length, sub } from './vec'

const ring = (r: number, angle: number, y = 0): Vec3 => [Math.cos(angle) * r, y, Math.sin(angle) * r]

describe('planTravel', () => {
  it('começa e termina nos pontos dados', () => {
    const from = ring(10, 0)
    const to = ring(20, 2)
    const path = planTravel(from, to)
    expect(length(sub(bezierPoint(path.points, 0), from))).toBeLessThan(1e-9)
    expect(length(sub(bezierPoint(path.points, 1), to))).toBeLessThan(1e-9)
  })

  it('nunca passa perto do sol, nem entre lados opostos da galáxia', () => {
    const cases: [Vec3, Vec3][] = [
      [ring(8, 0), ring(8, Math.PI)],
      [ring(6, 0.3, 0.5), ring(40, 0.3 + Math.PI)],
      [ring(5, 1), ring(5, 1 + Math.PI)],
      [[0, 30, 60], ring(9, 4)],
      [ring(12, 2), ring(12, 2.1)],
    ]
    for (const [from, to] of cases) expect(minSunDistance(planTravel(from, to).points)).toBeGreaterThanOrEqual(SUN_SAFE_DISTANCE)
  })

  it('o arco sobe acima do plano das órbitas', () => {
    const path = planTravel(ring(10, 0), ring(10, 1.5))
    expect(bezierPoint(path.points, 0.5)[1]).toBeGreaterThan(1)
  })
})

describe('tempo de viagem', () => {
  it('cresce com a distância e fica entre 1,5 e 3 s', () => {
    expect(travelDuration(0)).toBe(MIN_TRAVEL_SECONDS)
    expect(travelDuration(30)).toBeGreaterThan(travelDuration(10))
    expect(travelDuration(1000)).toBe(MAX_TRAVEL_SECONDS)
  })

  it('progresso suave de 0 a 1, travado nas pontas', () => {
    expect(travelProgress(0, 2)).toBe(0)
    expect(travelProgress(1, 2)).toBeCloseTo(0.5)
    expect(travelProgress(5, 2)).toBe(1)
    expect(travelProgress(0.2, 2)).toBeLessThan(0.1)
  })
})

describe('tangente', () => {
  it('é unitária e aponta para o destino no fim', () => {
    const path = planTravel(ring(10, 0), ring(10, 1.5))
    const t = bezierTangent(path.points, 1)
    expect(length(t)).toBeCloseTo(1)
    const toEnd = sub(path.points[3], path.points[2])
    expect(t[0] * toEnd[0] + t[1] * toEnd[1] + t[2] * toEnd[2]).toBeGreaterThan(0)
  })
})
