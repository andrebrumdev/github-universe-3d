/**
 * Brincadeiras do modo de foco: a reação de cada peça tocada, o pulinho do Clawd, o parafuso do toque duplo e as
 * mexidas do Octocat quando ninguém mexe nele. Puro, imports relativos.
 */
import type { OctocatExpression } from '../octocat/expression'
import type { PlayLineGroup } from '../octocat/lines'
import { tentacleIndex, type TouchedPart } from './focusGesture'

export interface Reaction {
  expression: OctocatExpression
  /** Grupo de falas (lib/octocat/lines). */
  lines: PlayLineGroup
  /** O braço livre acena. */
  wave: boolean
  /** O Clawd pula na cabeça. */
  hop: boolean
  /** O Octocat olha para cima (para o Clawd). */
  lookUp: boolean
  /** Tentáculo que leva um peteleco (Verlet), ou null. */
  wiggle: number | null
  /** Chama do propulsor num estouro curto. */
  burst: boolean
}

/** Quanto tempo a reação manda no rosto, no braço e no olhar (s). */
export const REACTION_SECONDS = 1.6
const HEAD_EXPRESSIONS: readonly OctocatExpression[] = ['happy', 'wink', 'surprised']

const still = { wave: false, hop: false, lookUp: false, wiggle: null, burst: false } as const

/**
 * A reação a um toque em `part`. Cabeça (ou corpo): expressão sorteada, aceno e uma fala; Clawd: pulinho, e o Octocat
 * olha para cima; tentáculo: peteleco e risadinha; bocal: estouro da chama. Com movimento reduzido, só a expressão e a
 * fala (sem pulo, balanço, aceno nem chama).
 */
export function reactionFor(part: TouchedPart, reduced: boolean, rng: () => number): Reaction {
  const motion = !reduced
  const tentacle = tentacleIndex(part)
  if (tentacle !== null) return { ...still, expression: 'happy', lines: 'giggle', wiggle: motion ? tentacle : null }
  switch (part) {
    case 'head':
    case 'body': {
      const expression = HEAD_EXPRESSIONS[Math.min(HEAD_EXPRESSIONS.length - 1, Math.floor(rng() * HEAD_EXPRESSIONS.length))]
      return { ...still, expression, lines: 'play', wave: motion }
    }
    case 'clawd':
      return { ...still, expression: 'surprised', lines: 'clawd', hop: motion, lookUp: true }
    case 'nozzle':
      return { ...still, expression: 'happy', lines: 'engine', burst: motion }
    default:
      return { ...still, expression: 'happy', lines: 'ship' }
  }
}

/** Pulinho do Clawd: duração (s) e altura (unidades do piloto). */
export const CLAWD_HOP_SECONDS = 0.7
export const CLAWD_HOP_HEIGHT = 0.35
/** Fases: agacha até 20%, no ar até 75%, amassa ao pousar até o fim. */
const TAKEOFF = 0.2
const LANDING = 0.75

/**
 * Pose do Clawd `t` s depois do toque: `lift` (sobe) e `squash` (escala vertical a partir dos pés; a horizontal
 * compensa). Agacha, sobe esticado, desce e amassa ao pousar nas 4 perninhas. Parado fora de (0, CLAWD_HOP_SECONDS).
 */
export function clawdHop(t: number): { lift: number; squash: number } {
  if (!(t > 0 && t < CLAWD_HOP_SECONDS)) return { lift: 0, squash: 1 }
  const u = t / CLAWD_HOP_SECONDS
  if (u < TAKEOFF) return { lift: 0, squash: 1 - 0.28 * Math.sin((Math.PI * u) / TAKEOFF) }
  if (u < LANDING) {
    const p = (u - TAKEOFF) / (LANDING - TAKEOFF)
    return { lift: CLAWD_HOP_HEIGHT * 4 * p * (1 - p), squash: 1 + 0.15 * Math.cos(Math.PI * p) }
  }
  const q = (u - LANDING) / (1 - LANDING)
  return { lift: 0, squash: 1 - 0.22 * Math.sin(Math.PI * q) }
}

/** Parafuso do toque duplo: uma volta inteira em torno do eixo da nave, em (s). */
export const BARREL_ROLL_SECONDS = 0.9

/** Ângulo do parafuso `t` s depois do toque duplo: começa e termina parado (smootherstep); 0 fora dele. */
export function barrelRollAngle(t: number): number {
  if (!(t > 0 && t <= BARREL_ROLL_SECONDS)) return 0
  const u = t / BARREL_ROLL_SECONDS
  return 2 * Math.PI * u * u * u * (u * (u * 6 - 15) + 10)
}

/** Sem entrada por isto (s) no modo, o Octocat olha para quem vê e se mexe um pouco. */
export const FIDGET_AFTER = 4

export interface Fidget {
  active: boolean
  /** Para onde os olhos vão: a câmera, ou um ponto em volta (−1..1 em x e y, no rosto). */
  look: 'camera' | { x: number; y: number }
  /** s até a próxima troca de olhar. */
  timer: number
}

export function newFidget(): Fidget {
  return { active: false, look: 'camera', timer: 0 }
}

/**
 * Avança as mexidas (`idleFor`: s sem entrada). Parado o bastante: olha para a câmera e, de vez em quando, dá uma
 * olhada em volta e volta (a piscada já vem do relógio da nave). Qualquer entrada encerra.
 */
export function stepFidget(f: Fidget, idleFor: number, dt: number, rng: () => number): Fidget {
  if (idleFor < FIDGET_AFTER) {
    f.active = false
    f.look = 'camera'
    f.timer = 0
    return f
  }
  if (!f.active) {
    f.active = true
    f.look = 'camera'
    f.timer = 1.5 + rng() * 2
    return f
  }
  f.timer -= dt
  if (f.timer > 0) return f
  if (f.look === 'camera') {
    f.look = { x: rng() * 2 - 1, y: (rng() * 2 - 1) * 0.6 }
    f.timer = 0.7 + rng() * 0.5
  } else {
    f.look = 'camera'
    f.timer = 1.8 + rng() * 2
  }
  return f
}
