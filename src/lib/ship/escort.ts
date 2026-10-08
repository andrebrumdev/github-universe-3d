import type { Pose } from '../cameraPoses'
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

/** Ao lado do alvo, do lado da câmera e um pouco acima; nunca perto demais do sol. */
export function visitPosition(anchor: Vec3, radius: number, cameraPos: Vec3): Vec3 {
  const toCamera = normalize(sub(cameraPos, anchor))
  const side = normalize(cross([0, 1, 0], toCamera), [1, 0, 0])
  let pos = add(add(anchor, scale(toCamera, radius + 1.6)), add(scale(side, -(radius + 0.8)), [0, radius * 0.5 + 0.4, 0]))
  const d = length(pos)
  if (d < SUN_SAFE_DISTANCE + 0.5) pos = scale(normalize(pos, [0, 1, 0]), SUN_SAFE_DISTANCE + 0.5)
  return pos
}

/** Canto inferior direito da visão, 4,5 unidades à frente da câmera. */
export function escortPosition(cameraPos: Vec3, forward: Vec3, up: Vec3): Vec3 {
  const right = normalize(cross(forward, up), [1, 0, 0])
  return add(cameraPos, add(add(scale(forward, 4.5), scale(right, 1.6)), scale(up, -0.9)))
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
