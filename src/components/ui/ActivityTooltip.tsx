import { useLayoutEffect, useRef } from 'react'
import { commitsLabel, formatDate } from '@/lib/format'
import { UI_GAP } from '@/lib/uiLayout'
import { useUniverse } from '@/store/universe'

/** Distância do ponteiro (ou do dedo) até o balão. */
const OFFSET = 12

export function ActivityTooltip() {
  const cell = useUniverse((s) => s.hoveredCell)
  const tip = useRef<HTMLDivElement>(null)

  // Dentro da tela: perto da borda direita ou de baixo, o balão vira para o outro lado do ponteiro.
  useLayoutEffect(() => {
    const el = tip.current
    if (!el || !cell) return
    const { offsetWidth: w, offsetHeight: h } = el
    const left = cell.x + OFFSET + w > window.innerWidth - UI_GAP ? cell.x - OFFSET - w : cell.x + OFFSET
    const top = cell.y + OFFSET + h > window.innerHeight - UI_GAP ? cell.y - OFFSET - h : cell.y + OFFSET
    el.style.left = `${Math.max(UI_GAP, left)}px`
    el.style.top = `${Math.max(UI_GAP, top)}px`
  }, [cell])

  if (!cell) return null
  return (
    <div
      ref={tip}
      role="tooltip"
      className="pointer-events-none fixed z-50 rounded-md border border-grid/40 bg-space/90 px-2 py-1 text-xs text-slate-100"
      style={{ left: cell.x + OFFSET, top: cell.y + OFFSET }}
    >
      {formatDate(cell.date)} · {commitsLabel(cell.count)}
    </div>
  )
}
