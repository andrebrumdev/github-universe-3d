/**
 * Área de toque do sol e dos planetas: na visão geral do celular eles têm ~10 px na tela. Uma esfera invisível em volta
 * de cada corpo aceita o toque até um raio mínimo em px (na distância em que ele está), sem mudar o que se vê.
 *
 * Ordem no raycast (o R3F entrega o evento por distância, e o primeiro que para a propagação leva): o acerto da área
 * estendida volta com distância PROXY_DISTANCE_BASE + px do toque ao centro. Assim qualquer acerto real (uma lua, a
 * superfície, a nave, um cometa) vem antes, e entre duas áreas que se sobrepõem vence a mais perto do dedo na tela.
 */

/** Raio mínimo (px CSS) com toque: 44 px de diâmetro, o alvo do HIG. */
export const TOUCH_HIT_PX = 22
/** Com mouse, uma folga menor (o cursor é preciso, mas um ponto de 6 px ainda cansa). */
export const MOUSE_HIT_PX = 12
/** Bem além do plano far da câmera: nenhum acerto real chega aqui. */
export const PROXY_DISTANCE_BASE = 1e7

export interface XYZ {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** Tamanho de um px CSS no mundo, a essa distância (fov vertical em graus, como na câmera do three). */
export function worldPerPixel(distance: number, fovDeg: number, viewportHeightPx: number): number {
  return (2 * distance * Math.tan((fovDeg * Math.PI) / 360)) / viewportHeightPx
}

/** Raio da área de toque: o do corpo, ou o mínimo em px se o corpo estiver menor que isso na tela. */
export function hitRadius(bodyRadius: number, minPx: number, distance: number, fovDeg: number, viewportHeightPx: number): number {
  return Math.max(bodyRadius, minPx * worldPerPixel(distance, fovDeg, viewportHeightPx))
}

export interface ProxyHit {
  /** Distância ao longo do raio até o ponto mais perto do centro. */
  along: number
  /** Distância do toque ao centro do corpo, em px na tela. */
  offsetPx: number
  /** Distância para o raycast (ver PROXY_DISTANCE_BASE). */
  distance: number
}

/** Raio (origem, direção unitária) contra a área de toque do corpo em `center`. null = fora dela ou atrás da câmera. */
export function proxyHit(
  origin: XYZ,
  dir: XYZ,
  center: XYZ,
  bodyRadius: number,
  minPx: number,
  fovDeg: number,
  viewportHeightPx: number,
): ProxyHit | null {
  const vx = center.x - origin.x
  const vy = center.y - origin.y
  const vz = center.z - origin.z
  const along = vx * dir.x + vy * dir.y + vz * dir.z
  if (along <= 0) return null
  const perp = Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - along * along))
  if (perp > hitRadius(bodyRadius, minPx, along, fovDeg, viewportHeightPx)) return null
  const offsetPx = perp / worldPerPixel(along, fovDeg, viewportHeightPx)
  return { along, offsetPx, distance: PROXY_DISTANCE_BASE + offsetPx }
}
