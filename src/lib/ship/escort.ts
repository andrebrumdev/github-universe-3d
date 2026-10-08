import type { Pose, Viewport } from '../cameraPoses'
import { planetPosition, SUN_RADIUS, type OrbitSystem, type Vec3 } from '../universe/orbits'
import { SUN_SAFE_DISTANCE } from './travel'
import { add, cross, length, normalize, scale, sub } from './vec'

export type ShipTarget = { kind: 'sun' } | { kind: 'planet'; name: string }

export function targetAnchor(target: ShipTarget, system: OrbitSystem, time: number): { position: Vec3; radius: number } | null {
  if (target.kind === 'sun') return { position: [0, 0, 0], radius: SUN_RADIUS }
  const orbit = system.orbits.find((o) => o.name === target.name)
  if (!orbit) return null
  return { position: planetPosition(system.rings[orbit.ring], orbit, time), radius: orbit.radius }
}

/**
 * Ao lado do alvo, do lado da câmera e um pouco acima; nunca perto demais do sol.
 * `side` escolhe o lado na visão da câmera: −1 = esquerda (padrão do plano), +1 = direita; frações aproximam do alvo.
 */
export function visitPosition(anchor: Vec3, radius: number, cameraPos: Vec3, side = -1): Vec3 {
  const toCamera = normalize(sub(cameraPos, anchor))
  const right = normalize(cross([0, 1, 0], toCamera), [1, 0, 0])
  let pos = add(add(anchor, scale(toCamera, radius + 1.6)), add(scale(right, side * (radius + 0.8)), [0, radius * 0.5 + 0.4, 0]))
  const d = length(pos)
  if (d < SUN_SAFE_DISTANCE + 0.5) pos = scale(normalize(pos, [0, 1, 0]), SUN_SAFE_DISTANCE + 0.5)
  return pos
}

const ESCORT_DEPTH = 4.5
/** Fração da meia-largura que o deslocamento lateral da escolta pode ocupar (encolhe em telas estreitas). */
const ESCORT_MAX_SIDE = 0.6
/** Fração da meia-altura abaixo do centro: canto de baixo, sob o cartão do tutorial. */
const ESCORT_DROP = 0.55

/**
 * Canto inferior direito da visão, 4,5 unidades à frente da câmera. Com `viewport`, a altura vira uma fração
 * fixa da tela e o lado encolhe em telas estreitas (celular em pé) para a nave não sair da tela.
 */
export function escortPosition(cameraPos: Vec3, forward: Vec3, up: Vec3, viewport?: Viewport): Vec3 {
  const right = normalize(cross(forward, up), [1, 0, 0])
  let side = 1.6
  let drop = 0.9
  if (viewport) {
    const halfH = Math.tan((viewport.fov * Math.PI) / 360) * ESCORT_DEPTH
    side = Math.min(side, ESCORT_MAX_SIDE * halfH * viewport.aspect)
    drop = ESCORT_DROP * halfH
  }
  return add(cameraPos, add(add(scale(forward, ESCORT_DEPTH), scale(right, side)), scale(up, -drop)))
}

/** Câmera de perseguição: atrás e acima da nave, olhando um pouco à frente dela. */
export function chasePose(position: Vec3, tangent: Vec3): Pose {
  return {
    position: add(add(position, scale(tangent, -6)), [0, 2.2, 0]),
    target: add(position, scale(tangent, 2)),
  }
}

export const MAX_BANK = 0.6

/** Inclinação lateral proporcional à velocidade de curva (rad), limitada a ±MAX_BANK. */
export function bankAngle(prev: Vec3, next: Vec3, dt: number): number {
  if (dt <= 0) return 0
  const turn = Math.atan2(prev[2] * next[0] - prev[0] * next[2], prev[0] * next[0] + prev[2] * next[2])
  if (turn === 0) return 0
  return Math.max(-MAX_BANK, Math.min(MAX_BANK, -0.25 * (turn / dt)))
}

/** Rigidez (rad/s) da mola que puxa a câmera atrás da nave em viagem. */
export const CHASE_SPRING = 4
/** Rigidez da mola que leva a câmera da perseguição (ou de onde estiver) até a pose final. */
export const FOCUS_SPRING = 2.5

export interface Spring3 {
  position: Vec3
  velocity: Vec3
}

/**
 * Um passo de mola criticamente amortecida rumo a `goal` (solução exata para alvo parado):
 * não depende do tamanho do passo, sai do repouso devagar e, partindo do repouso, nunca passa do alvo.
 */
export function springStep(s: Spring3, goal: Vec3, omega: number, dt: number): Spring3 {
  if (dt <= 0) return s
  const decay = Math.exp(-omega * dt)
  const position: Vec3 = [0, 0, 0]
  const velocity: Vec3 = [0, 0, 0]
  for (let k = 0; k < 3; k++) {
    const e0 = s.position[k] - goal[k]
    const v0 = s.velocity[k]
    const c = v0 + omega * e0
    position[k] = goal[k] + (e0 + c * dt) * decay
    velocity[k] = (v0 - omega * c * dt) * decay
  }
  return { position, velocity }
}

/** Maior antecipação da perseguição (unidades): uma distância de perseguição e pouco. */
export const MAX_CHASE_LEAD = 8

/**
 * Antecipação para a mola seguir um alvo em movimento: mira à frente na velocidade do alvo,
 * o que cancela o atraso de regime (2v/ω) da mola criticamente amortecida. Sobra só o atraso da aceleração.
 * `maxLead` limita o comprimento da antecipação (velocidades grandes não arremessam a câmera).
 */
export function springLead(goal: Vec3, goalVelocity: Vec3, omega: number, maxLead = Infinity): Vec3 {
  const lead = scale(goalVelocity, 2 / omega)
  const l = length(lead)
  return add(goal, l > maxLead ? scale(lead, maxLead / l) : lead)
}
