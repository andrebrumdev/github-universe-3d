/**
 * Medidores do roteiro da quarta parede (lib/octocat/script): janela apertada, zoom forçando o limite e fps liso.
 * Puros e mutáveis no lugar (os hooks guardam um de cada); devolvem true no instante em que o evento acontece.
 */

// ─── Janela apertada ─────────────────────────────────────────────────────────────────────────────────────────────

/** Queda de área (fração) dentro da janela de tempo que conta como "apertou". */
export const SHRINK_DROP = 0.15
export const SHRINK_WINDOW_MS = 1000
/** Logo depois de abrir, a janela se ajeita (barra de favoritos, zoom do navegador): nada conta. */
export const SHRINK_SETTLE_MS = 2000

export interface ShrinkWatch {
  /** ms da primeira amostra (−1: nenhuma). */
  start: number
  samples: { t: number; area: number }[]
  /** Orientação da última amostra (null: nenhuma). */
  landscape: boolean | null
}

export function newShrinkWatch(): ShrinkWatch {
  return { start: -1, samples: [], landscape: null }
}

/**
 * Uma amostra do tamanho da janela (ms, px). `orientationChanged`: o navegador avisou que a tela girou. Girar
 * (deitado ↔ em pé) recomeça a referência em vez de contar como aperto.
 */
export function stepShrink(w: ShrinkWatch, t: number, width: number, height: number, orientationChanged = false): boolean {
  if (w.start < 0) w.start = t
  const area = width * height
  const landscape = width >= height
  if (orientationChanged || (w.landscape !== null && landscape !== w.landscape)) {
    w.landscape = landscape
    w.samples = [{ t, area }]
    return false
  }
  w.landscape = landscape
  // a janela de tempo, mais o tamanho que valia no começo dela (a última amostra de antes): um pulo só, depois de
  // muito tempo parado, também é um aperto
  const recent = w.samples.filter((s) => t - s.t <= SHRINK_WINDOW_MS)
  const before = w.samples.findLast((s) => t - s.t > SHRINK_WINDOW_MS)
  w.samples = before ? [before, ...recent] : recent
  w.samples.push({ t, area })
  if (t - w.start < SHRINK_SETTLE_MS) return false
  const max = w.samples.reduce((m, s) => Math.max(m, s.area), 0)
  if (max <= 0 || (max - area) / max <= SHRINK_DROP) return false
  w.samples = [{ t, area }]
  return true
}

// ─── Zoom demais ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Folga relativa para "no limite": a distância da câmera chega nele devagar (amortecida). */
export const CLAMP_TOLERANCE = 0.04
/** Empurrando contra o limite por este tempo (ms), com pausas menores que PUSH_GAP_MS entre os eventos. */
export const PUSH_HOLD_MS = 1000
export const PUSH_GAP_MS = 350
/** Vai e volta: tantas inversões de sentido dentro da janela (ms). */
export const ZOOM_REVERSALS = 4
export const REVERSAL_WINDOW_MS = 2000

export type ZoomClamp = 'min' | 'max' | null

/** Em qual limite a distância da câmera está (com a folga), se em algum. */
export function zoomClamp(distance: number, min: number, max: number): ZoomClamp {
  if (distance <= min * (1 + CLAMP_TOLERANCE)) return 'min'
  if (Number.isFinite(max) && distance >= max * (1 - CLAMP_TOLERANCE)) return 'max'
  return null
}

export interface ZoomWatch {
  pushStart: number
  lastPush: number
  /** Sentido do último evento (−1 aproxima, 1 afasta; 0: nenhum) e quando. */
  lastDir: -1 | 0 | 1
  lastAt: number
  reversals: number[]
}

export function newZoomWatch(): ZoomWatch {
  return { pushStart: -1, lastPush: -Infinity, lastDir: 0, lastAt: -Infinity, reversals: [] }
}

/** Um evento de zoom (rodinha ou pinça) em `t` ms, no sentido `dir` (−1 aproxima, 1 afasta), com a câmera em `clamp`. */
export function stepZoom(w: ZoomWatch, t: number, dir: -1 | 1, clamp: ZoomClamp): boolean {
  const pushing = (dir === -1 && clamp === 'min') || (dir === 1 && clamp === 'max')
  if (pushing) {
    if (w.pushStart < 0 || t - w.lastPush > PUSH_GAP_MS) w.pushStart = t
    w.lastPush = t
  } else w.pushStart = -1
  if (w.lastDir !== 0 && dir !== w.lastDir && t - w.lastAt <= REVERSAL_WINDOW_MS) w.reversals.push(t)
  w.reversals = w.reversals.filter((r) => t - r <= REVERSAL_WINDOW_MS)
  w.lastDir = dir
  w.lastAt = t
  const held = pushing && t - w.pushStart >= PUSH_HOLD_MS
  if (!held && w.reversals.length < ZOOM_REVERSALS) return false
  Object.assign(w, newZoomWatch())
  return true
}

// ─── Fps liso ────────────────────────────────────────────────────────────────────────────────────────────────────

export const FPS_SMOOTH = 55
export const FPS_SMOOTH_HOLD_S = 15
/** Abaixo disto por FPS_LOW_HOLD_S, o aparelho é lento: a fala nunca sai (e não há fala negativa). */
export const FPS_LOW = 40
export const FPS_LOW_HOLD_S = 5
/** Os primeiros segundos (cena montando, texturas, shaders) não contam. */
export const FPS_WARMUP_S = 3
/** Constante de tempo (s) da média do intervalo entre quadros. */
export const FPS_TAU_S = 0.5
/** Um quadro mais longo que isto é engasgo (aba escondida, compilação): recomeça a contagem, sem julgar o aparelho. */
export const FPS_MAX_FRAME_S = 0.25
/** A fala espera quem chegou agora: depois da 3ª interação ou deste tempo na página. */
export const FPS_AROUND_INTERACTIONS = 3
export const FPS_AROUND_MS = 60_000

export interface FpsWatch {
  elapsed: number
  /** Intervalo médio entre quadros (s); 0 antes do primeiro. */
  frameDt: number
  above: number
  below: number
  low: boolean
  qualified: boolean
}

export function newFpsWatch(): FpsWatch {
  return { elapsed: 0, frameDt: 0, above: 0, below: 0, low: false, qualified: false }
}

/** Um quadro de `dt` s. */
export function stepFps(w: FpsWatch, dt: number): void {
  if (!(dt > 0)) return
  if (dt > FPS_MAX_FRAME_S) {
    w.above = 0
    return
  }
  w.elapsed += dt
  w.frameDt = w.frameDt <= 0 ? dt : w.frameDt + (dt - w.frameDt) * (1 - Math.exp(-dt / FPS_TAU_S))
  if (w.elapsed < FPS_WARMUP_S) return
  const fps = 1 / w.frameDt
  w.above = fps >= FPS_SMOOTH ? w.above + dt : 0
  w.below = fps < FPS_LOW ? w.below + dt : 0
  if (w.below >= FPS_LOW_HOLD_S) w.low = true
  if (!w.low && w.above >= FPS_SMOOTH_HOLD_S) w.qualified = true
}

export interface FpsReadiness {
  watch: FpsWatch
  desktop: boolean
  interactions: number
  sinceStartMs: number
  /** Atalho de desenvolvimento (`?fpsline`): pula a medição e a espera. */
  force: boolean
}

export function smoothFpsReady(r: FpsReadiness): boolean {
  if (!r.desktop) return false
  if (r.force) return true
  const around = r.interactions >= FPS_AROUND_INTERACTIONS || r.sinceStartMs >= FPS_AROUND_MS
  return r.watch.qualified && !r.watch.low && around
}
