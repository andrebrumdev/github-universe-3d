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

/** Escala da nave na cena (modelo: 5,56 de envergadura × 4,10 de comprimento × 2,76 de altura; frente em +z). */
export const SHIP_SCALE = 0.18
/** Altura e largura (envergadura) da nave no mundo, para enquadrar a escolta. */
export const SHIP_WORLD_HEIGHT = 2.76 * SHIP_SCALE
export const SHIP_WORLD_WIDTH = 5.56 * SHIP_SCALE
/** Distância mínima entre a nave e a câmera: meia envergadura + plano próximo (0,1) + folga. */
export const MIN_SHIP_DISTANCE = 0.75

export interface EscortFraming {
  /** Fração da altura da tela que a nave ocupa. */
  heightFraction: number
  /** Folga de baixo, em fração da altura da tela. */
  bottomMargin: number
  /** Fração da envergadura que pode passar da borda lateral (corta só a ponta da asa). */
  overhang: number
  /** 1 = canto direito, −1 = canto esquerdo. */
  side: 1 | -1
}

/** Desktop/paisagem: canto inferior direito, perto da lente, logo abaixo do cartão do tutorial (28% da altura). */
export const ESCORT_WIDE: EscortFraming = { heightFraction: 0.25, bottomMargin: 0.025, overhang: 0.15, side: 1 }
/**
 * Celular em pé: menor e no canto inferior esquerdo — abaixo do cartão do tutorial (bottom-36, 17% da altura)
 * e longe do botão "? Tutorial", que ocupa o canto inferior direito.
 */
export const ESCORT_PORTRAIT: EscortFraming = { heightFraction: 0.16, bottomMargin: 0.008, overhang: 0.15, side: -1 }

export function escortFraming(viewport: Viewport): EscortFraming {
  return viewport.aspect < 1 ? ESCORT_PORTRAIT : ESCORT_WIDE
}

/**
 * Posição da escolta no referencial da câmera (x à direita, y para cima, −z à frente), derivada do frustum:
 * a profundidade sai da fração de altura desejada; x e y encostam a nave no canto.
 */
export function escortOffset(viewport: Viewport, framing: EscortFraming = escortFraming(viewport)): Vec3 {
  const t = Math.tan((viewport.fov * Math.PI) / 360)
  const depth = SHIP_WORLD_HEIGHT / (2 * framing.heightFraction * t)
  const halfH = depth * t
  const halfW = halfH * viewport.aspect
  const x = framing.side * (halfW - SHIP_WORLD_WIDTH * (0.5 - framing.overhang))
  const y = -halfH + 2 * halfH * framing.bottomMargin + SHIP_WORLD_HEIGHT / 2
  return [x, y, -depth]
}

/** Giro (rad) em torno do eixo vertical para a nave ficar em três-quartos de frente, com o nariz para o centro da tela. */
export const THREE_QUARTER_YAW = 0.45

/** Batida no vidro: duração (s), quanto chega mais perto (fração da distância) e o avanço de cada batida (unidades). */
export const KNOCK_DURATION = 3.2
export const ESCORT_LEAN_DEPTH = 0.2
export const KNOCK_BOB = 0.12
const KNOCK_TAPS = [1.0, 1.45]
const KNOCK_TAP_LENGTH = 0.25

export interface Knock {
  /** 0..1: quanto se aproximou da lente (e se inclinou para a frente). */
  closer: number
  /** 0..1: pulso de cada batida. */
  bob: number
  waving: boolean
}

const NO_KNOCK: Knock = { closer: 0, bob: 0, waving: false }
const smoothstep = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return u * u * (3 - 2 * u)
}

/** Linha do tempo da batida: chega perto (0–0,7 s), bate duas vezes, acena e volta (2,4–3,2 s). */
export function knockPose(t: number): Knock {
  if (!(t >= 0 && t < KNOCK_DURATION)) return NO_KNOCK
  const closer = smoothstep(0, 0.7, t) * (1 - smoothstep(2.4, KNOCK_DURATION, t))
  let bob = 0
  for (const start of KNOCK_TAPS) {
    const u = (t - start) / KNOCK_TAP_LENGTH
    if (u > 0 && u < 1) bob += Math.sin(u * Math.PI)
  }
  return { closer, bob, waving: t >= 0.6 && t < 2.6 }
}

/** Escolta durante a batida: mais perto da lente pelo mesmo raio de visão (o canto não muda na tela). */
export function knockOffset(base: Vec3, knock: Knock): Vec3 {
  if (knock.closer === 0 && knock.bob === 0) return base
  return scale(base, 1 - ESCORT_LEAN_DEPTH * knock.closer - (KNOCK_BOB * knock.bob) / length(base))
}

/** Mantém `pos` fora de uma esfera de raio `minDist` em volta de `center` (a câmera): nada corta no plano próximo. */
export function keepAway(pos: Vec3, center: Vec3, minDist: number): Vec3 {
  const d = sub(pos, center)
  return length(d) >= minDist ? pos : add(center, scale(normalize(d, [0, 0, 1]), minDist))
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
