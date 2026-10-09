/**
 * O botão "Não clique aqui" foge do ponteiro: o planejador puro da fuga. Perto demais, ele escolhe um lugar novo longe
 * do ponteiro, dentro da tela e fora da interface reservada (lib/uiLayout); cansa depois de algumas fugas (foge mais
 * perto e mais devagar) e, no fim, desiste e se deixa pegar. Encurralado, fica e se espreme. Imports relativos.
 */
import { UI_GAP, type Insets, type Rect } from '../uiLayout'

/** Ponteiro a até isto (px) da borda do botão: ele foge. */
export const DODGE_TRIGGER = 90
/** Tamanho do pulo descansado (px). */
export const DODGE_DISTANCE = 180
/** Fugas sem cansar, na primeira rodada (cada rodada seguinte aguenta mais uma). */
export const TIRED_AFTER = 3
/** Folga das bordas da tela (px). */
export const EDGE_MARGIN = 12
/** Duração do pulo descansado e o quanto o cansaço o alonga (ms). */
const FRESH_MS = 280
const TIRED_MS = 640

export interface Point {
  x: number
  y: number
}

export interface DodgeInput {
  /** Onde o botão está (px, canto de cima à esquerda) e o tamanho dele. */
  button: Rect
  pointer: Point
  viewport: { width: number; height: number }
  /** A interface que ele não pode cobrir (botões, cartões). */
  reserved: Rect[]
  /** Fugas nesta rodada. */
  dodges: number
  /** Rodadas já terminadas (cada show termina uma): a seguinte foge mais e melhor. */
  round: number
  /** Áreas seguras da tela (notch). */
  insets?: Insets
}

export interface DodgePlan {
  /** stay: ponteiro longe; move: pula para (x, y); cornered: sem saída, se espreme no lugar; give-up: cansou, fica. */
  kind: 'stay' | 'move' | 'cornered' | 'give-up'
  x: number
  y: number
  /** Duração do pulo (ms). */
  duration: number
}

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
const roundBonus = (round: number) => Math.min(Math.max(round, 0), 3)

/** Distância (px) do ponteiro até a borda do retângulo (0 dentro dele). */
export function pointerDistance(r: Rect, p: Point): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w))
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h))
  return Math.hypot(dx, dy)
}

/** Onde o botão pode ficar: a tela menos a folha das bordas e as áreas seguras. */
export function dodgeBounds(viewport: { width: number; height: number }, insets: Insets = NO_INSETS): Rect {
  const x = EDGE_MARGIN + insets.left
  const y = EDGE_MARGIN + insets.top
  return { x, y, w: viewport.width - x - EDGE_MARGIN - insets.right, h: viewport.height - y - EDGE_MARGIN - insets.bottom }
}

/** Quantas fugas até desistir: 5 na primeira rodada, duas a mais por rodada (até 3 rodadas). */
export function maxDodges(round: number): number {
  return 5 + 2 * roundBonus(round)
}

/** Fôlego de 1 (descansado) a 0,2: cai depois de TIRED_AFTER fugas (mais uma por rodada). */
export function fatigue(dodges: number, round: number): number {
  const tiredAfter = TIRED_AFTER + roundBonus(round)
  if (dodges < tiredAfter) return 1
  return Math.max(0.2, 1 - (dodges - tiredAfter + 1) * 0.25)
}

const overlaps = (a: Rect, b: Rect, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap

/** Desvios em volta da direção "para longe do ponteiro" (graus), na ordem de preferência. */
const ANGLES = [0, 25, -25, 50, -50, 75, -75, 100, -100, 135, -135, 180]

/** Planeja a próxima fuga (ver `DodgePlan`). Determinístico: o mesmo pedido dá o mesmo lugar. */
export function planDodge(input: DodgeInput): DodgePlan {
  const { button, pointer, reserved, dodges, round } = input
  const here = { x: button.x, y: button.y }
  if (pointerDistance(button, pointer) > DODGE_TRIGGER) return { kind: 'stay', ...here, duration: 0 }
  if (dodges >= maxDodges(round)) return { kind: 'give-up', ...here, duration: 0 }

  const f = fatigue(dodges, round)
  const bonus = roundBonus(round)
  const distance = DODGE_DISTANCE * (0.4 + 0.6 * f) * (1 + 0.2 * bonus)
  const duration = FRESH_MS + (1 - f) * TIRED_MS
  const bounds = dodgeBounds(input.viewport, input.insets)
  const cx = button.x + button.w / 2
  const cy = button.y + button.h / 2
  let ax = cx - pointer.x
  let ay = cy - pointer.y
  const l = Math.hypot(ax, ay)
  if (l < 1e-6) {
    // ponteiro bem no centro: foge para o lado com mais espaço
    ax = cx < bounds.x + bounds.w / 2 ? 1 : -1
    ay = 0
  } else {
    ax /= l
    ay /= l
  }
  // a rodada esperta também tenta pulos mais longos
  const reaches = bonus > 0 ? [distance, distance * 1.5, distance * 0.6] : [distance, distance * 0.6]

  let best: Point | null = null
  let bestScore = -Infinity
  for (let i = 0; i < ANGLES.length; i++) {
    const a = (ANGLES[i] * Math.PI) / 180
    const dx = ax * Math.cos(a) - ay * Math.sin(a)
    const dy = ax * Math.sin(a) + ay * Math.cos(a)
    for (const reach of reaches) {
      const x = Math.min(Math.max(cx + dx * reach - button.w / 2, bounds.x), bounds.x + bounds.w - button.w)
      const y = Math.min(Math.max(cy + dy * reach - button.h / 2, bounds.y), bounds.y + bounds.h - button.h)
      const r = { x, y, w: button.w, h: button.h }
      if (reserved.some((z) => overlaps(r, z, UI_GAP))) continue
      const away = pointerDistance(r, pointer)
      // ainda ao alcance: não adianta
      if (away <= DODGE_TRIGGER * 0.9) continue
      // prefere o mais longe do ponteiro e perto da direção de fuga; a esperta foge para o espaço aberto (difícil de
      // encurralar), longe das bordas
      const edge = Math.min(x - bounds.x, bounds.x + bounds.w - (x + button.w), y - bounds.y, bounds.y + bounds.h - (y + button.h))
      const score = Math.min(away, 2 * DODGE_TRIGGER) - 0.3 * Math.abs(ANGLES[i]) + (bonus > 0 ? 1.2 * Math.min(edge, 150) : 0)
      if (score > bestScore) {
        bestScore = score
        best = { x, y }
      }
    }
  }
  if (!best) return { kind: 'cornered', ...here, duration }
  return { kind: 'move', ...best, duration }
}
