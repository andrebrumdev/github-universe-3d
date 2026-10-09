import { MAX_PITCH } from './faceSpring'

/**
 * Movimento do olhar do sol. Para onde ele olha e com que cara vem do humor (`mood.ts`, uma tabela coerente com o que
 * acontece); aqui ficam só os movimentos pequenos: dormindo (viajando), a cabeça vaga devagar e preguiçosa; de olhos
 * abertos, pequenas sacadas. Também o limite da virada da cabeça e os degraus da pupila.
 */
export interface GazeMotion {
  /** Micro-desvio de olhos abertos (rad), trocado a cada `saccadeLeft` s. */
  saccadeYaw: number
  saccadePitch: number
  saccadeLeft: number
  /** Cabeça vagando dormindo (rad): anda devagar até o objetivo, trocado a cada `wanderLeft` s. */
  wanderYaw: number
  wanderPitch: number
  wanderGoalYaw: number
  wanderGoalPitch: number
  wanderLeft: number
}

/** Sacadas: desvio máximo (rad) e intervalo entre elas (s). */
export const SACCADE = { yaw: 0.05, pitch: 0.035, min: 0.25, max: 0.9 } as const
/** Cabeça vagando dormindo: amplitude (rad), troca de objetivo (s) e constante de tempo (s) — preguiçosa. */
export const WANDER = { yaw: 0.3, pitch: 0.15, min: 2.5, max: 5, tau: 1.6 } as const

export const MOTION_AT_REST: GazeMotion = {
  saccadeYaw: 0,
  saccadePitch: 0,
  saccadeLeft: 0.5,
  wanderYaw: 0,
  wanderPitch: 0,
  wanderGoalYaw: 0,
  wanderGoalPitch: 0,
  wanderLeft: 1,
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Avança sacadas e deriva. Movimento reduzido: tudo parado em zero. */
export function stepGazeMotion(s: GazeMotion, reduced: boolean, dt: number, rng: () => number): GazeMotion {
  if (reduced) return { ...MOTION_AT_REST, saccadeLeft: 0, wanderLeft: 0 }
  let { saccadeYaw, saccadePitch, saccadeLeft, wanderGoalYaw, wanderGoalPitch, wanderLeft } = s
  saccadeLeft -= dt
  if (saccadeLeft <= 0) {
    saccadeYaw = (rng() * 2 - 1) * SACCADE.yaw
    saccadePitch = (rng() * 2 - 1) * SACCADE.pitch
    saccadeLeft = lerp(SACCADE.min, SACCADE.max, rng())
  }
  wanderLeft -= dt
  if (wanderLeft <= 0) {
    wanderGoalYaw = (rng() * 2 - 1) * WANDER.yaw
    wanderGoalPitch = (rng() * 2 - 1) * WANDER.pitch
    wanderLeft = lerp(WANDER.min, WANDER.max, rng())
  }
  const k = 1 - Math.exp(-dt / WANDER.tau)
  return {
    saccadeYaw,
    saccadePitch,
    saccadeLeft,
    wanderGoalYaw,
    wanderGoalPitch,
    wanderLeft,
    wanderYaw: s.wanderYaw + (wanderGoalYaw - s.wanderYaw) * k,
    wanderPitch: s.wanderPitch + (wanderGoalPitch - s.wanderPitch) * k,
  }
}

/** Desvio da cabeça (yaw, pitch em rad): dormindo, a deriva preguiçosa; de olhos abertos, só as sacadas. */
export function headOffset(s: GazeMotion, drifting: boolean): [number, number] {
  return drifting ? [s.wanderYaw, s.wanderPitch] : [s.saccadeYaw, s.saccadePitch]
}

/** Pupila em degraus: `steps` degraus no alcance [−reach, reach] (o olhar "salta" como no desenho, sem tremer). */
export function quantizePupil(v: number, reach: number, steps = 8): number {
  const step = (2 * reach) / steps
  const q = Math.min(reach, Math.max(-reach, Math.round(v / step) * step))
  return q === 0 ? 0 : q
}

/**
 * O rosto vira no máximo isto para os lados, a partir de quem vê: olhando longe, ele desliza pela esfera (como na foto
 * do Sphere de lado, ~45–50°), com os dois olhos legíveis e o de longe encurtado. 70° deixava meio rosto na borda.
 */
export const MAX_TURN_AWAY = (55 * Math.PI) / 180

type Turn = { yaw: number; pitch: number }
const toDir = (t: Turn): [number, number, number] => [Math.cos(t.pitch) * Math.sin(t.yaw), Math.sin(t.pitch), Math.cos(t.pitch) * Math.cos(t.yaw)]
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * Cabeça limitada: no máximo `MAX_TURN_AWAY` de ângulo de verdade (yaw e pitch juntos) até a direção de quem vê — além
 * disso, para no limite, no caminho mais curto até o alvo —, e pitch a ±`MAX_PITCH`. O yaw sai perto do de quem vê
 * (sem normalizar: a mola do rosto trata a volta do ±π).
 */
export function limitTurn(target: Turn, viewer: Turn): Turn {
  const v = toDir(viewer)
  const t = toDir(target)
  const theta = Math.acos(Math.min(1, Math.max(-1, v[0] * t[0] + v[1] * t[1] + v[2] * t[2])))
  let d = t
  if (theta > MAX_TURN_AWAY) {
    if (Math.PI - theta < 1e-4) {
      // alvo exatamente atrás: vira de lado (no horizontal da vista), exatamente no limite
      const len = Math.hypot(v[2], v[0]) || 1
      const side = [v[2] / len, 0, -v[0] / len]
      const [c, sn] = [Math.cos(MAX_TURN_AWAY), Math.sin(MAX_TURN_AWAY)]
      d = [c * v[0] + sn * side[0], c * v[1] + sn * side[1], c * v[2] + sn * side[2]]
    } else {
      const a = Math.sin(theta - MAX_TURN_AWAY) / Math.sin(theta)
      const b = Math.sin(MAX_TURN_AWAY) / Math.sin(theta)
      d = [a * v[0] + b * t[0], a * v[1] + b * t[1], a * v[2] + b * t[2]]
    }
  }
  let dy = wrap(Math.atan2(d[0], d[2]) - viewer.yaw)
  const raw = Math.asin(Math.min(1, Math.max(-1, d[1])))
  const pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, raw))
  if (pitch !== raw) {
    // o pitch travado mexe no ângulo: acha o yaw que deixa exatamente no limite (se passou), do mesmo lado
    const c = Math.cos(pitch) * Math.cos(viewer.pitch)
    const cosDy = (Math.cos(MAX_TURN_AWAY) - Math.sin(pitch) * Math.sin(viewer.pitch)) / Math.max(c, 1e-6)
    const limit = Math.acos(Math.min(1, Math.max(-1, cosDy)))
    if (Math.abs(dy) > limit) dy = Math.sign(dy) * limit
  }
  return { yaw: viewer.yaw + dy, pitch }
}
