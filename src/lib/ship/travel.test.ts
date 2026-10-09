import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../universe/orbits'
import { planTransfer } from './transfer'
import {
  LAUNCH_MARGIN,
  MAX_TRAVEL_SECONDS,
  MIN_TRAVEL_SECONDS,
  minSunDistance,
  SUN_SAFE_DISTANCE,
  travelDuration,
  travelPoint,
  travelTangent,
  travelVelocity,
  type TravelPath,
} from './travel'
import { dot, length, sub } from './vec'

const ring = (r: number, angle: number, y = 0): Vec3 => [Math.cos(angle) * r, y, Math.sin(angle) * r]

describe('planTransfer (o caminho da viagem)', () => {
  it('começa e termina nos pontos dados', () => {
    const from = ring(10, 0)
    const to = ring(20, 2)
    const path = planTransfer(from, to)
    expect(length(sub(travelPoint(path, 0), from))).toBeLessThan(1e-9)
    expect(length(sub(travelPoint(path, path.duration), to))).toBeLessThan(1e-9)
  })

  it('nunca passa perto do sol, nem entre lados opostos da galáxia', () => {
    const cases: [Vec3, Vec3][] = [
      [ring(8, 0), ring(8, Math.PI)],
      [ring(6, 0.3, 0.5), ring(40, 0.3 + Math.PI)],
      [ring(5, 1), ring(5, 1 + Math.PI)],
      [[0, 30, 60], ring(9, 4)],
      [ring(12, 2), ring(12, 2.1)],
    ]
    for (const [from, to] of cases) expect(minSunDistance(planTransfer(from, to))).toBeGreaterThanOrEqual(SUN_SAFE_DISTANCE)
  })

  it('o arco sobe acima do plano das órbitas', () => {
    const path = planTransfer(ring(10, 0), ring(10, 1.5))
    expect(travelPoint(path, path.duration / 2)[1]).toBeGreaterThan(1)
  })
})

describe('tempo de viagem', () => {
  it('cresce com a distância e fica entre 1,5 e 3 s', () => {
    expect(travelDuration(0)).toBe(MIN_TRAVEL_SECONDS)
    expect(travelDuration(30)).toBeGreaterThan(travelDuration(10))
    expect(travelDuration(1000)).toBe(MAX_TRAVEL_SECONDS)
  })

  it('travelPoint trava nas pontas', () => {
    const path = planTransfer(ring(10, 0), ring(20, 2))
    expect(travelPoint(path, -3)).toEqual(travelPoint(path, 0))
    expect(travelPoint(path, path.duration * 9)).toEqual(travelPoint(path, path.duration))
  })
})

describe('tangente', () => {
  it('é unitária e aponta para o destino no fim (também com a nave parada na chegada)', () => {
    const path = planTransfer(ring(10, 0), ring(10, 1.5))
    const t = travelTangent(path, path.duration)
    expect(length(t)).toBeCloseTo(1)
    const toEnd = sub(travelPoint(path, path.duration), travelPoint(path, path.duration * 0.97))
    expect(dot(t, toEnd)).toBeGreaterThan(0)
  })
})

const peakHeight = (path: TravelPath) => {
  let max = -Infinity
  for (let i = 0; i <= 96; i++) max = Math.max(max, travelPoint(path, (i / 96) * path.duration)[1])
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
      const path = planTransfer(from, to)
      expect(length(travelPoint(path, 0))).toBeCloseTo(SUN_SAFE_DISTANCE + LAUNCH_MARGIN)
      expect(minSunDistance(path)).toBeGreaterThanOrEqual(SUN_SAFE_DISTANCE)
      expect(length(sub(travelPoint(path, path.duration), to))).toBeLessThan(1e-9)
    }
  })

  it('o pico do arco fica limitado (sem subir quilômetros)', () => {
    for (const [, from, to] of cases) expect(peakHeight(planTransfer(from, to))).toBeLessThan(20)
  })

  it('no centro exato, sai para cima', () => {
    const start = travelPoint(planTransfer([0, 0, 0], ring(10, 1)), 0)
    expect(start[0]).toBe(0)
    expect(start[1]).toBeCloseTo(SUN_SAFE_DISTANCE + LAUNCH_MARGIN)
    expect(start[2]).toBe(0)
  })
})

describe('travelVelocity', () => {
  const path = planTransfer(ring(10, 0), ring(30, 2))

  it('é a derivada do caminho no tempo (confere com diferença finita)', () => {
    for (const t of [0.2, 0.5, 0.9, 1.3]) {
      const h = 1e-5
      const a = travelPoint(path, t - h)
      const b = travelPoint(path, t + h)
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
