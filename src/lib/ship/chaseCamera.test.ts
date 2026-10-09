import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../universe/orbits'
import {
  ARRIVAL_BLEND_SECONDS,
  arrivalBlendWeight,
  blendPose,
  CHASE_SPRING,
  chasePose,
  chaseRoll,
  chaseUp,
  easeArrivalBlend,
  MAX_CHASE_LEAD,
  MAX_CHASE_ROLL,
  springLead,
  springStep,
  type Spring3,
} from './escort'
import { planTransfer } from './transfer'
import { travelTangent } from './travel'
import { cross, dot, length, normalize, sub } from './vec'

const ring = (r: number, angle: number, y = 0): Vec3 => [Math.cos(angle) * r, y, -Math.sin(angle) * r]
const trips: [Vec3, Vec3][] = [
  [ring(15, 0), ring(72, 2.2)],
  [ring(60, 2, 4), ring(14, 3.1, -1)],
  [[0, 40, 70], ring(15, 1.2)],
  [ring(6, 0.3, 0.5), ring(40, 0.3 + Math.PI)],
]

/** Simula a câmera de perseguição como o CameraRig: mola (posição e alvo) na pose de perseguição com antecipação. */
function fly(from: Vec3, to: Vec3, dt = 1 / 60) {
  const path = planTransfer(from, to)
  const start = chasePose(path.point(0), travelTangent(path, 0))
  let cam: Spring3 = { position: [...start.position], velocity: [0, 0, 0] }
  let target: Spring3 = { position: [...start.target], velocity: [0, 0, 0] }
  let up: Vec3 = [0, 1, 0]
  const frames: { t: number; ship: Vec3; v: Vec3; cam: Vec3; target: Vec3; up: Vec3; raw: Vec3 }[] = []
  for (let t = 0; t <= path.duration; t += dt) {
    const ship = path.point(t)
    const v = path.velocity(t)
    const raw = chasePose(ship, travelTangent(path, t))
    cam = springStep(cam, springLead(raw.position, v, CHASE_SPRING, MAX_CHASE_LEAD), CHASE_SPRING, dt)
    target = springStep(target, springLead(raw.target, v, CHASE_SPRING, MAX_CHASE_LEAD), CHASE_SPRING, dt)
    up = chaseUp(normalize(sub(target.position, cam.position)), up, 0)
    frames.push({ t, ship, v, cam: cam.position, target: target.position, up, raw: raw.position })
  }
  return { path, frames }
}

describe('câmera que segue a viagem por trás', () => {
  it('pose: atrás da nave no sentido da velocidade, um pouco acima, olhando à frente dela', () => {
    const position: Vec3 = [5, 2, 5]
    const tangent: Vec3 = [1, 0, 0]
    const pose = chasePose(position, tangent)
    expect(dot(sub(pose.position, position), tangent)).toBeLessThan(0)
    expect(pose.position[1]).toBeGreaterThan(position[1])
    expect(dot(sub(pose.target, position), tangent)).toBeGreaterThan(0)
    // a nave fica um pouco abaixo do centro da tela (a chama e o vapor aparecem atrás dela)
    const view = normalize(sub(pose.target, pose.position))
    const toShip = normalize(sub(position, pose.position))
    expect(toShip[1]).toBeLessThan(view[1])
    expect(Math.acos(dot(view, toShip))).toBeLessThan((15 * Math.PI) / 180)
  })

  it('no voo, a câmera fica atrás da nave e o alvo à frente (com o atraso da mola)', () => {
    for (const [from, to] of trips) {
      const { path, frames } = fly(from, to)
      for (const f of frames) {
        if (f.t < 0.5 || f.t > path.duration - 0.2 || length(f.v) < 1e-3) continue
        expect(dot(sub(f.cam, f.ship), f.v)).toBeLessThan(0)
        expect(dot(sub(f.target, f.ship), f.v)).toBeGreaterThan(0)
      }
    }
  })

  it('atraso: a câmera fica um tanto atrás da pose ideal no cruzeiro, nunca longe demais', () => {
    for (const [from, to] of trips) {
      const { path, frames } = fly(from, to)
      const cruise = frames.filter((f) => f.t > path.burns.departure + 0.5 && f.t < path.burns.arrival)
      const lags = cruise.map((f) => length(sub(f.cam, f.raw)))
      expect(Math.max(...lags)).toBeGreaterThan(0.05)
      expect(Math.max(...lags)).toBeLessThan(12)
      // na partida (acelerando) ela atrasa mais que no meio do cruzeiro
      const early = frames.filter((f) => f.t > 0.1 && f.t < path.burns.departure).map((f) => length(sub(f.cam, f.raw)))
      expect(Math.max(...early)).toBeGreaterThan(Math.min(...lags))
    }
  })

  it('o "para cima" nunca vira na viagem toda (nem em trecho íngreme)', () => {
    for (const [from, to] of trips) {
      const { frames } = fly(from, to)
      for (let i = 1; i < frames.length; i++) {
        expect(dot(frames[i].up, frames[i - 1].up)).toBeGreaterThan(0.99)
        expect(frames[i].up[1]).toBeGreaterThan(0)
        // perpendicular à direção de visão
        expect(Math.abs(dot(frames[i].up, normalize(sub(frames[i].target, frames[i].cam))))).toBeLessThan(1e-6)
      }
    }
    // olhando reto para baixo: mantém o anterior em vez de virar
    const prev: Vec3 = [0, 0.2, -1]
    const up = chaseUp([0, -1, 0], normalize(prev), 0)
    expect(dot(up, normalize(prev))).toBeGreaterThan(0.9)
  })

  it('inclinação: só um pouco da inclinação da nave, com teto (~5–10°)', () => {
    expect(chaseRoll(0)).toBe(0)
    expect(Math.abs(chaseRoll(0.6))).toBeGreaterThan(0)
    expect(Math.abs(chaseRoll(0.6))).toBeLessThan(0.6)
    expect(Math.abs(chaseRoll(10))).toBe(MAX_CHASE_ROLL)
    expect(MAX_CHASE_ROLL).toBeGreaterThanOrEqual((5 * Math.PI) / 180)
    expect(MAX_CHASE_ROLL).toBeLessThanOrEqual((10 * Math.PI) / 180)
    // o "para cima" gira em torno da direção de visão pelo ângulo pedido
    const f: Vec3 = [0, 0, -1]
    const up = chaseUp(f, [0, 1, 0], 0.1)
    expect(Math.acos(dot(up, [0, 1, 0]))).toBeCloseTo(0.1, 6)
    expect(Math.abs(dot(up, f))).toBeLessThan(1e-9)
    expect(Math.sign(dot(cross([0, 1, 0], up), f))).not.toBe(0)
  })
})

describe('chegando: a câmera já vai para o enquadramento final', () => {
  it('peso: 0 antes da janela de chegada, sobe sem voltar e é 1 com a nave parada', () => {
    const T = 10
    const arrival = 9.3
    // começa ARRIVAL_BLEND_SECONDS antes do fim (antes do puff, para a câmera não correr)
    const start = T - ARRIVAL_BLEND_SECONDS
    expect(arrivalBlendWeight(0, T, arrival)).toBe(0)
    expect(arrivalBlendWeight(start, T, arrival)).toBe(0)
    expect(arrivalBlendWeight(arrival, T, arrival)).toBeGreaterThan(0.5)
    expect(arrivalBlendWeight(T, T, arrival)).toBe(1)
    expect(arrivalBlendWeight(T + 3, T, arrival)).toBe(1)
    let prev = 0
    for (let i = 0; i <= 400; i++) {
      const w = arrivalBlendWeight((i / 400) * T, T, arrival)
      expect(w).toBeGreaterThanOrEqual(prev)
      expect(w - prev).toBeLessThan(0.03)
      prev = w
    }
    // salto curto: nos últimos 30% dela
    expect(arrivalBlendWeight(0.69 * 3, 3, 2.9)).toBe(0)
    expect(arrivalBlendWeight(0.71 * 3, 3, 2.9)).toBeGreaterThan(0)
    // chegada longa: começa com ela
    expect(arrivalBlendWeight(4.01, 10, 4)).toBeGreaterThan(0)
  })

  it('pose misturada: contínua, e no fim é exatamente a pose de destino', () => {
    const chase = { position: [1, 2, 3] as Vec3, target: [4, 5, 6] as Vec3 }
    const goal = { position: [-10, 20, 30] as Vec3, target: [0, 0, 0] as Vec3 }
    expect(blendPose(chase, goal, 0)).toEqual(chase)
    expect(blendPose(chase, goal, 1)).toEqual(goal)
    let prev = blendPose(chase, goal, 0)
    for (let i = 1; i <= 100; i++) {
      const p = blendPose(chase, goal, i / 100)
      expect(length(sub(p.position, prev.position))).toBeLessThan(0.6)
      expect(length(sub(p.target, prev.target))).toBeLessThan(0.6)
      prev = p
    }
  })

  it('troca de destino no meio da mistura: o peso volta para a perseguição devagar, sem salto', () => {
    let w = 0.8
    const dt = 1 / 60
    let frames = 0
    while (w > 0.01) {
      const next = easeArrivalBlend(w, 0, dt)
      expect(w - next).toBeLessThan(0.2)
      expect(next).toBeLessThan(w)
      w = next
      frames++
    }
    expect(frames).toBeGreaterThan(10)
    // subindo, segue o pedido na hora (a curva já é suave)
    expect(easeArrivalBlend(0.3, 0.35, dt)).toBe(0.35)
  })
})
