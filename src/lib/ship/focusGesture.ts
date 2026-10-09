/**
 * Gestos no modo de foco: de quem é o arrasto (começou na nave: gira a nave; no vazio: a câmera orbita), quando um
 * toque é toque (e quando são dois), e qual peça foi tocada na linha do raio. Puro, imports relativos.
 */

/** Peças que respondem ao toque. `glass` é a cúpula: transparente, o toque passa por ela. */
export type ShipPart = 'head' | 'body' | 'clawd' | `tentacle:${number}` | 'nozzle' | 'hull' | 'glass'
export type TouchedPart = Exclude<ShipPart, 'glass'>

export type DragOwner = 'ship' | 'camera'

/** No modo de foco, o arrasto que começa na nave é dela; qualquer outro (e fora do modo, todos) é da câmera. */
export function dragOwner(focused: boolean, startedOnShip: boolean): DragOwner {
  return focused && startedOnShip ? 'ship' : 'camera'
}

/** Folga (px) até um toque virar arrasto: com o dedo, maior (ele treme mais que o mouse). */
export const MOUSE_TAP_SLOP = 6
export const TOUCH_TAP_SLOP = 12
/** Um toque solta antes disto (ms); segurar mais não é toque. */
export const TAP_MAX_MS = 400
/** Dois toques a menos disto (ms e px) um do outro: toque duplo. */
export const DOUBLE_TAP_MS = 320
export const DOUBLE_TAP_PX = 32

export function tapSlop(coarse: boolean): number {
  return coarse ? TOUCH_TAP_SLOP : MOUSE_TAP_SLOP
}

export type Gesture = 'pending' | 'drag'

/** Depois de andar `distPx` desde o toque: arrasto, ou ainda indeciso. */
export function gestureAfterMove(distPx: number, coarse: boolean): Gesture {
  return distPx > tapSlop(coarse) ? 'drag' : 'pending'
}

/** Ao soltar: foi um toque (rápido e sem andar)? */
export function gestureOnRelease(gesture: Gesture, distPx: number, elapsedMs: number, coarse: boolean): 'tap' | 'none' {
  return gesture === 'pending' && distPx <= tapSlop(coarse) && elapsedMs <= TAP_MAX_MS ? 'tap' : 'none'
}

export interface Tap {
  /** ms */
  time: number
  x: number
  y: number
}

export function isDoubleTap(previous: Tap | null, tap: Tap): boolean {
  if (!previous) return false
  return tap.time - previous.time <= DOUBLE_TAP_MS && Math.hypot(tap.x - previous.x, tap.y - previous.y) <= DOUBLE_TAP_PX
}

/**
 * Peça tocada: a primeira na linha do raio (da mais perto para a mais longe), atravessando o vidro da cúpula. `null`
 * é uma malha da nave sem marca (casco, asas, motor): opaca, conta como casco e tapa o que estiver atrás.
 */
export function pickPart(hits: readonly (ShipPart | null)[]): TouchedPart {
  for (const part of hits) {
    if (part === 'glass') continue
    return part ?? 'hull'
  }
  return 'hull'
}

/** Índice do tentáculo de uma peça `tentacle:i`, ou null. */
export function tentacleIndex(part: TouchedPart): number | null {
  return part.startsWith('tentacle:') ? Number(part.slice('tentacle:'.length)) : null
}
