import { SUN_RADIUS, type Vec3 } from '../universe/orbits'
import { add, length, lerp3, normalize, scale, sub } from './vec'

export const SUN_SAFE_DISTANCE = SUN_RADIUS + 2
export const MIN_TRAVEL_SECONDS = 1.5
export const MAX_TRAVEL_SECONDS = 3

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

export function bezierTangent(p: TravelPath['points'], s: number): Vec3 {
  const u = 1 - s
  const d = add(add(scale(sub(p[1], p[0]), 3 * u * u), scale(sub(p[2], p[1]), 6 * u * s)), scale(sub(p[3], p[2]), 3 * s * s))
  return normalize(d, normalize(sub(p[3], p[0])))
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

/** Arco acima do plano das órbitas; sobe mais até a curva ficar longe do sol. */
export function planTravel(from: Vec3, to: Vec3): TravelPath {
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
