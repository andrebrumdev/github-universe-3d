/**
 * Konami Code (↑ ↑ ↓ ↓ ← → ← → B A): casador puro da sequência, normalização das teclas e, no celular, os gestos que
 * fazem as vezes do teclado — deslizar ↑ ↑ ↓ ↓ ← → ← → e tocar duas vezes (B e A). Imports relativos.
 */

/** A sequência no teclado (`keyToken` de cada `KeyboardEvent.key`). */
export const KONAMI_KEYS = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'] as const
/** A sequência no toque: os deslizes no lugar das setas e dois toques no lugar do B e do A. */
export const KONAMI_TOUCH = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'tap', 'tap'] as const

/**
 * Um passo do casador: `index` entradas certas até agora. Uma entrada errada recomeça, mas aproveitando o que ainda
 * serve de começo (↑ ↑ ↑ ↓ … segue valendo: os dois últimos ↑ são o começo da sequência). Completa: dispara e volta a 0.
 */
export function matchStep(sequence: readonly string[], index: number, input: string): { index: number; fired: boolean } {
  if (sequence[index] === input) {
    const next = index + 1
    return next === sequence.length ? { index: 0, fired: true } : { index: next, fired: false }
  }
  // o maior pedaço do fim do que foi digitado (com esta entrada) que também é começo da sequência
  for (let k = Math.min(index, sequence.length - 1); k >= 1; k--) {
    if (sequence[k - 1] !== input) continue
    let ok = true
    for (let i = 0; i < k - 1; i++) {
      if (sequence[i] !== sequence[index - (k - 1) + i]) {
        ok = false
        break
      }
    }
    if (ok) return { index: k, fired: false }
  }
  return { index: 0, fired: false }
}

const MODIFIERS = new Set(['shift', 'control', 'alt', 'meta', 'capslock', 'altgraph', 'fn'])

/** A tecla como entra no casador (minúscula), ou null para as modificadoras (Shift sozinho não quebra o "B"). */
export function keyToken(key: string): string | null {
  const k = key.toLowerCase()
  return MODIFIERS.has(k) ? null : k
}

const TEXT_INPUTS = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'datetime-local', 'month', 'time', 'week', ''])

/** O alvo do teclado é um lugar de digitar (campo, área de texto, conteúdo editável): aí o código não vale. */
export function isTypingTarget(el: { tagName?: string; isContentEditable?: boolean; type?: string } | null): boolean {
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName?.toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  return tag === 'INPUT' && TEXT_INPUTS.has((el.type ?? '').toLowerCase())
}

/** Deslize: no mínimo isto (px) no eixo principal, em até SWIPE_MAX_MS, com o eixo principal 1,5× maior que o outro. */
export const SWIPE_MIN = 40
export const SWIPE_MAX_MS = 700
/** Toque: até isto de movimento (px) e de duração (ms). */
export const TAP_MAX_MOVE = 12
export const TAP_MAX_MS = 350
/** Entre um gesto e outro da sequência, no máximo isto (ms): deslizes soltos ao longo da visita não somam. */
export const TOUCH_GAP_MS = 2500

export type Gesture = 'up' | 'down' | 'left' | 'right' | 'tap'

/** O gesto de um dedo que desceu e subiu (deslocamento em px, y da tela para baixo; duração em ms), ou null. */
export function classifyGesture(dx: number, dy: number, ms: number): Gesture | null {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax <= TAP_MAX_MOVE && ay <= TAP_MAX_MOVE) return ms <= TAP_MAX_MS ? 'tap' : null
  if (ms > SWIPE_MAX_MS) return null
  if (ay >= SWIPE_MIN && ay >= 1.5 * ax) return dy < 0 ? 'up' : 'down'
  if (ax >= SWIPE_MIN && ax >= 1.5 * ay) return dx < 0 ? 'left' : 'right'
  return null
}
