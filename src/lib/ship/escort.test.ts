import { describe, expect, it } from 'vitest'
import { buildOrbits, planetPosition, SUN_RADIUS, type Vec3 } from '../universe/orbits'
import { bankAngle, chasePose, escortPosition, MAX_BANK, targetAnchor, visitPosition } from './escort'
import { SUN_SAFE_DISTANCE } from './travel'
import { cross, dot, length, sub } from './vec'

const system = buildOrbits(Array.from({ length: 12 }, (_, i) => ({ name: `p${i}`, radius: 2.2 })))

describe('targetAnchor', () => {
  it('sol na origem com o raio do sol; planeta na posição do instante', () => {
    expect(targetAnchor({ kind: 'sun' }, system, 0)).toEqual({ position: [0, 0, 0], radius: SUN_RADIUS })
    const orbit = system.orbits[5]
    expect(targetAnchor({ kind: 'planet', name: 'p5' }, system, 12)).toEqual({
      position: planetPosition(system.rings[orbit.ring], orbit, 12),
      radius: orbit.radius,
    })
    expect(targetAnchor({ kind: 'planet', name: 'nada' }, system, 0)).toBeNull()
  })
})

describe('visitPosition', () => {
  it('fica ao lado do alvo, do lado da câmera, e longe do sol', () => {
    const cameraPositions: Vec3[] = [[0, 20, 40], [0, 2, 0.1], [30, 5, -30]]
    for (const cam of cameraPositions) {
      for (const orbit of system.orbits) {
        const anchor = targetAnchor({ kind: 'planet', name: orbit.name }, system, 3)!
        const visit = visitPosition(anchor.position, anchor.radius, cam)
        expect(length(sub(visit, anchor.position))).toBeGreaterThan(anchor.radius)
        expect(length(visit)).toBeGreaterThanOrEqual(SUN_SAFE_DISTANCE)
      }
      expect(length(visitPosition([0, 0, 0], SUN_RADIUS, cam))).toBeGreaterThanOrEqual(SUN_SAFE_DISTANCE)
    }
  })
})

describe('escortPosition', () => {
  it('fica à frente, à direita e abaixo do centro da câmera', () => {
    const cam: Vec3 = [0, 10, 30]
    const forward: Vec3 = [0, 0, -1]
    const up: Vec3 = [0, 1, 0]
    const offset = sub(escortPosition(cam, forward, up), cam)
    expect(dot(offset, forward)).toBeGreaterThan(0)
    expect(dot(offset, cross(forward, up))).toBeGreaterThan(0)
    expect(dot(offset, up)).toBeLessThan(0)
  })
})

describe('chasePose', () => {
  it('câmera atrás e acima da nave, olhando para a frente dela', () => {
    const position: Vec3 = [5, 2, 5]
    const tangent: Vec3 = [1, 0, 0]
    const pose = chasePose(position, tangent)
    expect(dot(sub(pose.position, position), tangent)).toBeLessThan(0)
    expect(pose.position[1]).toBeGreaterThan(position[1])
    expect(dot(sub(pose.target, position), tangent)).toBeGreaterThan(0)
  })
})

describe('bankAngle', () => {
  it('inclina para dentro da curva, com limite', () => {
    const straight: Vec3 = [0, 0, 1]
    const left: Vec3 = [Math.sin(0.05), 0, Math.cos(0.05)]
    expect(bankAngle(straight, straight, 1 / 60)).toBe(0)
    expect(Math.sign(bankAngle(straight, left, 1 / 60))).not.toBe(0)
    expect(Math.abs(bankAngle(straight, [1, 0, 0], 1 / 60))).toBe(MAX_BANK)
    expect(bankAngle(straight, left, 0)).toBe(0)
  })
})
