import { describe, expect, it } from 'vitest'
import { FACE_AT_REST, faceTarget, MAX_PITCH, stepFaceSpring, wrapAngle, type FaceSpring } from './faceSpring'

const simulate = (s: FaceSpring, target: { yaw: number; pitch: number }, seconds: number, dt = 1 / 60) => {
  const trace: FaceSpring[] = []
  let state = s
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    state = stepFaceSpring(state, target, dt)
    trace.push(state)
  }
  return trace
}

describe('faceTarget', () => {
  it('yaw e pitch apontam para a câmera, com pitch limitado', () => {
    expect(faceTarget([0, 0, 0], [0, 0, 10])).toEqual({ yaw: 0, pitch: 0 })
    expect(faceTarget([0, 0, 0], [10, 0, 0]).yaw).toBeCloseTo(Math.PI / 2)
    expect(faceTarget([0, 0, 0], [0, 5, 10]).pitch).toBeCloseTo(Math.atan2(5, 10))
    expect(faceTarget([0, 0, 0], [0, 100, 1]).pitch).toBe(MAX_PITCH)
    expect(faceTarget([0, 0, 0], [0, -100, 1]).pitch).toBe(-MAX_PITCH)
  })
})

describe('stepFaceSpring', () => {
  const target = { yaw: 1, pitch: 0.4 }

  it('chega ao alvo com atraso: longe em 0,1 s, perto em 1,5 s', () => {
    const trace = simulate(FACE_AT_REST, target, 1.5)
    expect(trace[5].yaw).toBeLessThan(0.5)
    const last = trace[trace.length - 1]
    expect(Math.abs(last.yaw - target.yaw)).toBeLessThan(0.01)
    expect(Math.abs(last.pitch - target.pitch)).toBeLessThan(0.01)
  })

  it('balança um pouco ao chegar, sem exagero', () => {
    const peak = Math.max(...simulate(FACE_AT_REST, target, 2).map((s) => s.yaw))
    expect(peak).toBeGreaterThan(target.yaw)
    expect(peak).toBeLessThan(target.yaw * 1.1)
  })

  it('gira pelo caminho curto ao cruzar ±π', () => {
    const start = { ...FACE_AT_REST, yaw: 3 }
    for (const s of simulate(start, { yaw: -3, pitch: 0 }, 1.5)) expect(Math.abs(s.yaw)).toBeGreaterThan(2.8)
  })

  it('dt enorme não explode', () => {
    const s = stepFaceSpring(FACE_AT_REST, target, 30)
    expect(Number.isFinite(s.yaw) && Number.isFinite(s.pitch)).toBe(true)
    expect(Math.abs(s.pitch)).toBeLessThanOrEqual(MAX_PITCH)
  })

  it('wrapAngle normaliza para [−π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI)
    expect(wrapAngle(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2)
  })
})
