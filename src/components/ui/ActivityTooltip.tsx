import { useLayoutEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { commitsLabel, formatDate } from '@/lib/format'
import { UI_GAP } from '@/lib/uiLayout'
import { type HoveredCell, useUniverse } from '@/store/universe'
import { EASE_IN, EASE_OUT } from './cardMotion'

/** Distância do ponteiro (ou do dedo) até o balão. */
const OFFSET = 12
/** Entra junto com o quadradinho aceso no planeta (~120 ms) e sai um pouco mais rápido. */
const TIP_IN_S = 0.12
const TIP_OUT_S = 0.1

/**
 * Balão do dia (data e commits) perto do ponteiro, junto com o quadradinho aceso no planeta. Entra como os outros
 * cartões (sobe pouco e acende) e, ao sair, apaga no último lugar; trocar de dia só troca o texto e a posição.
 */
export function ActivityTooltip() {
  const cell = useUniverse((s) => s.hoveredCell)
  const reduced = useReducedMotion() ?? false
  return <AnimatePresence>{cell && <Tip key="tip" cell={cell} reduced={reduced} />}</AnimatePresence>
}

function Tip({ cell, reduced }: { cell: HoveredCell; reduced: boolean }) {
  const tip = useRef<HTMLDivElement>(null)

  // Dentro da tela: perto da borda direita ou de baixo, o balão vira para o outro lado do ponteiro.
  useLayoutEffect(() => {
    const el = tip.current
    if (!el) return
    const { offsetWidth: w, offsetHeight: h } = el
    const left = cell.x + OFFSET + w > window.innerWidth - UI_GAP ? cell.x - OFFSET - w : cell.x + OFFSET
    const top = cell.y + OFFSET + h > window.innerHeight - UI_GAP ? cell.y - OFFSET - h : cell.y + OFFSET
    el.style.left = `${Math.max(UI_GAP, left)}px`
    el.style.top = `${Math.max(UI_GAP, top)}px`
  }, [cell])

  return (
    <motion.div
      ref={tip}
      role="tooltip"
      // movimento reduzido: aparece e some na hora, como o quadradinho
      initial={reduced ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0, transition: { duration: TIP_IN_S, ease: EASE_OUT } }}
      exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: 2, transition: { duration: TIP_OUT_S, ease: EASE_IN } }}
      className="pointer-events-none fixed z-50 rounded-md border border-grid/40 bg-space/90 px-2 py-1 text-xs tabular-nums text-slate-100 shadow-md shadow-black/40"
      style={{ left: cell.x + OFFSET, top: cell.y + OFFSET }}
    >
      {formatDate(cell.date)} · {commitsLabel(cell.count)}
    </motion.div>
  )
}
