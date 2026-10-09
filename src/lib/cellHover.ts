/**
 * O quadradinho (dia) aceso no planeta em foco, sob o ponteiro ou o dedo. Puro e sem alocar: o estado é um objeto
 * mutado a cada evento e a cada quadro (o Planet lê a célula do raio e escreve os uniforms a partir daqui).
 *
 * As células são índices `semana * 7 + dia` (0–363), -1 sem nenhuma.
 */

/** Acender e apagar (s): rápido, como resposta ao ponteiro. */
export const HOVER_FADE_S = 0.12
/** Quanto tempo o dia tocado fica aceso no toque (s). */
export const TOUCH_HOLD_S = 2

export interface CellHover {
  /** Dia sob o ponteiro (ou o último tocado), -1 sem nenhum: é o do balão. */
  cell: number
  /** Dia aceso no planeta: o mesmo `cell`, mas fica durante o apagar (o shader apaga a célula que acendeu). */
  lit: number
  /** Tempo normalizado do acender: 0 apagado → 1 aceso (o uHoverTime; a curva fica no shader). */
  level: number
  /** Segundos que faltam para o dia tocado apagar; 0 sem prazo (mouse por cima, ou nada). */
  touchLeft: number
}

export const newCellHover = (): CellHover => ({ cell: -1, lit: -1, level: 0, touchLeft: 0 })

/**
 * O ponteiro está sobre o dia `cell` (-1: fora da grade ou do planeta). Devolve se o dia mudou. De um dia para o
 * vizinho, o novo já entra aceso: só acende do zero quem vem de fora.
 */
export function pointCell(h: CellHover, cell: number): boolean {
  h.touchLeft = 0
  if (cell === h.cell) return false
  h.cell = cell
  if (cell >= 0) h.lit = cell
  return true
}

/** O ponteiro saiu do planeta (ou o toque foi cancelado). Devolve se havia um dia. */
export function leaveCell(h: CellHover): boolean {
  return pointCell(h, -1)
}

/** Toque num dia: acende e fica TOUCH_HOLD_S na tela. Devolve se o dia mudou. */
export function tapCell(h: CellHover, cell: number): boolean {
  const changed = pointCell(h, cell)
  h.touchLeft = cell >= 0 ? TOUCH_HOLD_S : 0
  return changed
}

/**
 * Avança `dt` segundos: acende ou apaga (na hora com movimento reduzido) e vence o prazo do toque. Devolve true só
 * no quadro em que o prazo do toque vence (o dia saiu sem evento: quem chama esconde o balão).
 */
export function stepCellHover(h: CellHover, dt: number, reduced: boolean): boolean {
  let expired = false
  if (h.touchLeft > 0) {
    h.touchLeft = Math.max(0, h.touchLeft - dt)
    if (h.touchLeft === 0) expired = pointCell(h, -1)
  }
  const goal = h.cell >= 0 ? 1 : 0
  if (reduced) h.level = goal
  else if (goal > h.level) h.level = Math.min(1, h.level + dt / HOVER_FADE_S)
  else if (goal < h.level) h.level = Math.max(0, h.level - dt / HOVER_FADE_S)
  if (h.cell < 0 && h.level === 0) h.lit = -1
  return expired
}
