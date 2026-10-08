import type { Vec3 } from '../universe/orbits'

export interface FaceSpring {
  yaw: number
  pitch: number
  vYaw: number
  vPitch: number
}

/** ζ = 9 / (2·√40) ≈ 0,71: chega em ~0,5 s com ~4% de balanço. */
const STIFFNESS = 40
const DAMPING = 9
const SUBSTEP = 1 / 60
/** Passo máximo aceito por chamada (aba que volta do segundo plano). */
const MAX_DT = 0.25
export const MAX_PITCH = (35 * Math.PI) / 180
export const FACE_AT_REST: FaceSpring = { yaw: 0, pitch: 0, vYaw: 0, vPitch: 0 }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

export function faceTarget(from: Vec3, to: Vec3): { yaw: number; pitch: number } {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  return { yaw: Math.atan2(dx, dz), pitch: clamp(Math.atan2(dy, Math.hypot(dx, dz)), -MAX_PITCH, MAX_PITCH) }
}

export function stepFaceSpring(s: FaceSpring, target: { yaw: number; pitch: number }, dt: number): FaceSpring {
  let { yaw, pitch, vYaw, vPitch } = s
  let remaining = clamp(dt, 0, MAX_DT)
  while (remaining > 1e-9) {
    const h = Math.min(remaining, SUBSTEP)
    // Euler semi-implícito: atualiza a velocidade e depois a posição com a velocidade nova.
    vYaw += (STIFFNESS * wrapAngle(target.yaw - yaw) - DAMPING * vYaw) * h
    vPitch += (STIFFNESS * (target.pitch - pitch) - DAMPING * vPitch) * h
    yaw = wrapAngle(yaw + vYaw * h)
    pitch = clamp(pitch + vPitch * h, -MAX_PITCH, MAX_PITCH)
    remaining -= h
  }
  return { yaw, pitch, vYaw, vPitch }
}
