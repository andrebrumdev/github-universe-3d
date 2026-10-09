import type { Pose } from '../cameraPoses'
import type { Vec3 } from '../universe/orbits'
import { cross, normalize, sub } from './vec'

/**
 * Referencial de uma câmera: origem na lente, x para a direita, y para cima, z para trás (ela olha para −z), como
 * no Three.js. A escolta, a visita em primeiro plano e a volta vivem em coordenadas desse referencial.
 */
export interface CameraFrame {
  position: Vec3
  right: Vec3
  up: Vec3
  back: Vec3
}

/** Referencial de uma pose (posição + alvo), com o "para cima" do mundo, como o `lookAt` do CameraControls. */
export function frameFromPose(pose: Pose): CameraFrame {
  const back = normalize(sub(pose.position, pose.target), [0, 0, 1])
  const right = normalize(cross([0, 1, 0], back), [1, 0, 0])
  return { position: [...pose.position], right, up: cross(back, right), back }
}

/** Ponto do referencial no mundo. Com `out`, escreve nele. */
export function frameToWorld(f: CameraFrame, local: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
  const [x, y, z] = local
  for (let k = 0; k < 3; k++) out[k] = f.position[k] + x * f.right[k] + y * f.up[k] + z * f.back[k]
  return out
}

/** Ponto do mundo no referencial. */
export function frameToLocal(f: CameraFrame, world: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
  const d = sub(world, f.position)
  out[0] = d[0] * f.right[0] + d[1] * f.right[1] + d[2] * f.right[2]
  out[1] = d[0] * f.up[0] + d[1] * f.up[1] + d[2] * f.up[2]
  out[2] = d[0] * f.back[0] + d[1] * f.back[1] + d[2] * f.back[2]
  return out
}

/**
 * O mesmo ponto local preso a dois referenciais, misturado: w = 0 preso a `a` (ex.: o mundo da hora em que a manobra
 * começou), w = 1 preso a `b` (a câmera de agora). Com `a`, `b` e w suaves, o resultado é suave: é assim que um
 * caminho sai do mundo e termina grudado na câmera sem salto, mesmo com a câmera andando.
 */
export function blendFramesPoint(a: CameraFrame, b: CameraFrame, w: number, local: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
  const pa = frameToWorld(a, local)
  const pb = frameToWorld(b, local)
  for (let k = 0; k < 3; k++) out[k] = pa[k] + (pb[k] - pa[k]) * w
  return out
}
