import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../universe/orbits'
import {
  bezierPoint,
  bezierTangent,
  LAUNCH_MARGIN,
  MAX_TRAVEL_SECONDS,
  MIN_TRAVEL_SECONDS,
  minSunDistance,
  planTravel,
  SUN_SAFE_DISTANCE,
  travelDuration,
  travelProgress,
  travelVelocity,
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

const peakHeight = (points: Parameters<typeof bezierPoint>[0]) => {
  let max = -Infinity
  for (let i = 0; i <= 96; i++) max = Math.max(max, bezierPoint(points, i / 96)[1])
  return max
}

describe('saída de dentro do sol', () => {
  const cases: [string, Vec3, Vec3][] = [
    ['do centro do sol', [0, 0, 0], ring(10, 1)],
    ['logo dentro do raio seguro', [SUN_SAFE_DISTANCE - 0.1, 0.2, 0], ring(8, 2)],
    ['de dentro, para o lado oposto', [0.5, 0.2, -1], ring(9, 1.5 + Math.PI)],
  ]

  it('empurra a origem para fora do raio seguro e o arco fica longe do sol', () => {
    for (const [, from, to] of cases) {
      const path = planTravel(from, to)
      expect(length(path.points[0])).toBeCloseTo(SUN_SAFE_DISTANCE + LAUNCH_MARGIN)
      expect(minSunDistance(path.points)).toBeGreaterThanOrEqual(SUN_SAFE_DISTANCE)
      expect(length(sub(bezierPoint(path.points, 1), to))).toBeLessThan(1e-9)
    }
  })

  it('o pico do arco fica limitado (sem subir quilômetros)', () => {
    for (const [, from, to] of cases) expect(peakHeight(planTravel(from, to).points)).toBeLessThan(20)
  })

  it('no centro exato, sai para cima', () => {
    const start = planTravel([0, 0, 0], ring(10, 1)).points[0]
    expect(start[0]).toBe(0)
    expect(start[1]).toBeCloseTo(SUN_SAFE_DISTANCE + LAUNCH_MARGIN)
    expect(start[2]).toBe(0)
  })
})

describe('travelVelocity', () => {
  const path = planTravel(ring(10, 0), ring(30, 2))

  it('é a derivada do caminho no tempo (confere com diferença finita)', () => {
    for (const t of [0.2, 0.5, 0.9, 1.3]) {
      const h = 1e-5
      const a = bezierPoint(path.points, travelProgress(t - h, path.duration))
      const b = bezierPoint(path.points, travelProgress(t + h, path.duration))
      const numeric = sub(b, a).map((x) => x / (2 * h)) as Vec3
      expect(length(sub(travelVelocity(path, t), numeric))).toBeLessThan(1e-3 * Math.max(1, length(numeric)))
    }
  })

  it('parte e chega parada; fora do trajeto, zero', () => {
    expect(length(travelVelocity(path, 0))).toBeLessThan(1e-9)
    expect(length(travelVelocity(path, path.duration))).toBeLessThan(1e-9)
    expect(length(travelVelocity(path, path.duration * 50))).toBe(0)
    expect(length(travelVelocity(path, -1))).toBe(0)
  })
})
