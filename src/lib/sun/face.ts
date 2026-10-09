import type { SunExpression } from './sunMachine'

/**
 * Rosto do sol no estilo do Sphere de Las Vegas com o emoji: olhos brancos grandes, pupilas pretas grandes,
 * sobrancelhas grossas e uma boquinha. Medidas em unidades de desenho de um mapa 512×256 (equirretangular,
 * 1 unidade ≈ 0,7°); o canvas real pode ser maior (`FACE_SCALE`). O centro do rosto (128, 128) é o +z da esfera.
 */
export const FACE_W = 512
export const FACE_H = 256
export const FACE_CENTER: readonly [number, number] = [128, 128]
/** Olhos: centros em (±dx, y) a partir do centro do rosto; brancos ovais rx × ry. */
export const EYE = { dx: 24, y: -6, rx: 17, ry: 20 } as const

/** Pupila por expressão: raio e posição de repouso dentro do olho (y para baixo, como no canvas). */
export const PUPIL: Record<SunExpression, { r: number; x: number; y: number }> = {
  happy: { r: 9, x: 0, y: 2 },
  veryHappy: { r: 9.5, x: 0, y: 0 },
  surprised: { r: 7.5, x: 0, y: 0 },
  sad: { r: 9, x: 0, y: 3 },
}
/** As pupilas adiantam o olhar para a câmera enquanto a mola do rosto ainda está virando: unidades por radiano. */
export const PUPIL_GAIN = 14
/** Quanto a pupila anda, no máximo, a partir do repouso. */
export const PUPIL_REACH = 5

/**
 * Posição [x, y] e raio da pupila (unidades de desenho, relativas ao centro do olho) a partir do atraso da mola:
 * `lagYaw` > 0 é câmera mais para +x (direita no mapa); `lagPitch` > 0 é câmera mais para cima (y menor no mapa).
 */
export function pupilLook(expression: SunExpression, lagYaw: number, lagPitch: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const base = PUPIL[expression]
  let x = PUPIL_GAIN * lagYaw
  let y = -PUPIL_GAIN * lagPitch
  const len = Math.hypot(x, y)
  if (len > PUPIL_REACH) {
    x *= PUPIL_REACH / len
    y *= PUPIL_REACH / len
  }
  out[0] = base.x + x
  out[1] = base.y + y
  out[2] = base.r
  return out
}
