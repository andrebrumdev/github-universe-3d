import { SUN_RADIUS, type Vec3 } from '../universe/orbits'
import { add, length, lerp3, normalize, scale, sub } from './vec'

export const SUN_SAFE_DISTANCE = SUN_RADIUS + 2
export const MIN_TRAVEL_SECONDS = 1.5
export const MAX_TRAVEL_SECONDS = 3
/** Folga além do raio seguro para onde é empurrada uma saída de dentro do sol. */
export const LAUNCH_MARGIN = 0.5

export interface TravelPath {
  /** Bézier cúbica: origem, dois controles erguidos, destino. */
  points: [Vec3, Vec3, Vec3, Vec3]
  duration: number
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function travelDuration(distance: number): number {
  return clamp(MIN_TRAVEL_SECONDS + distance / 40, MIN_TRAVEL_SECONDS, MAX_TRAVEL_SECONDS)
}

export function bezierPoint(p: TravelPath['points'], s: number): Vec3 {
  const u = 1 - s
  return add(add(scale(p[0], u * u * u), scale(p[1], 3 * u * u * s)), add(scale(p[2], 3 * u * s * s), scale(p[3], s * s * s)))
}

/** Derivada da Bézier em relação ao parâmetro s (sem normalizar). */
export function bezierDerivative(p: TravelPath['points'], s: number): Vec3 {
  const u = 1 - s
  return add(add(scale(sub(p[1], p[0]), 3 * u * u), scale(sub(p[2], p[1]), 6 * u * s)), scale(sub(p[3], p[2]), 3 * s * s))
}

export function bezierTangent(p: TravelPath['points'], s: number): Vec3 {
  return normalize(bezierDerivative(p, s), normalize(sub(p[3], p[0])))
}

export function minSunDistance(p: TravelPath['points'], samples = 96): number {
  let min = Infinity
  for (let i = 0; i <= samples; i++) min = Math.min(min, length(bezierPoint(p, i / samples)))
  return min
}

function arc(from: Vec3, to: Vec3, lift: number): TravelPath['points'] {
  const up: Vec3 = [0, lift, 0]
  return [from, add(lerp3(from, to, 1 / 3), up), add(lerp3(from, to, 2 / 3), up), to]
}

/** Ponto de dentro do raio seguro do sol empurrado radialmente para fora (no centro exato, para cima). */
function outsideSun(p: Vec3): Vec3 {
  return length(p) < SUN_SAFE_DISTANCE ? scale(normalize(p, [0, 1, 0]), SUN_SAFE_DISTANCE + LAUNCH_MARGIN) : p
}

/**
 * Arco acima do plano das órbitas; sobe mais até a curva ficar longe do sol.
 * Uma saída de dentro do raio seguro é empurrada para fora antes (senão nenhum arco fica longe do sol
 * e a subida cresceria ×1,5¹⁶). Destinos vêm de `visitPosition`, que já ficam fora.
 */
export function planTravel(rawFrom: Vec3, to: Vec3): TravelPath {
  const from = outsideSun(rawFrom)
  const distance = length(sub(to, from))
  let lift = Math.max(3, distance * 0.35)
  let points = arc(from, to, lift)
  for (let i = 0; i < 16 && minSunDistance(points) < SUN_SAFE_DISTANCE; i++) {
    lift *= 1.5
    points = arc(from, to, lift)
  }
  return { points, duration: travelDuration(distance) }
}

export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

export function travelProgress(elapsed: number, duration: number): number {
  return easeInOutCubic(clamp(elapsed / duration, 0, 1))
}

/** Derivada de `easeInOutCubic`; zero fora de [0, 1]. */
export function easeInOutCubicDerivative(x: number): number {
  if (x <= 0 || x >= 1) return 0
  return x < 0.5 ? 12 * x * x : 3 * (-2 * x + 2) ** 2
}

/** Velocidade da nave no caminho (unidades/s), analítica: B'(s) · ease'(t/T) / T. Zero antes e depois da viagem. */
export function travelVelocity(path: TravelPath, elapsed: number): Vec3 {
  const x = elapsed / path.duration
  const k = easeInOutCubicDerivative(x) / path.duration
  if (k === 0) return [0, 0, 0]
  return scale(bezierDerivative(path.points, travelProgress(elapsed, path.duration)), k)
}
