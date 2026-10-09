/** Folga (px) entre o balão da fala e o disco do alvo na tela. */
export const BUBBLE_DISC_GAP = 12

/**
 * Âncora do balão da fala (base no meio, o balão sobe `h` px e tem `w` px de largura) desviada do disco do alvo na
 * tela (planeta ou sol): se o balão cobre o disco, ele desliza na horizontal para o lado em que já está até sair dele
 * (com BUBBLE_DISC_GAP de folga). Sem disco, ou sem sobreposição, fica onde está.
 */
export function steerBubble(x: number, y: number, w: number, h: number, disc: { x: number; y: number; r: number } | null): { x: number; y: number } {
  if (!disc) return { x, y }
  const r = disc.r + BUBBLE_DISC_GAP
  // ponto do retângulo mais perto do centro do disco
  const cx = Math.max(x - w / 2, Math.min(disc.x, x + w / 2))
  const cy = Math.max(y - h, Math.min(disc.y, y))
  if (Math.hypot(cx - disc.x, cy - disc.y) >= r) return { x, y }
  // na altura do retângulo mais perto do centro, quanto o disco ocupa na horizontal
  const dy = Math.abs(cy - disc.y)
  const reach = Math.sqrt(Math.max(0, r * r - dy * dy))
  const side = x < disc.x ? -1 : 1
  return { x: disc.x + side * (reach + w / 2), y }
}
