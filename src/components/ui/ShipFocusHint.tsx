import { useEffect, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { COARSE_POINTER_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { focusHint } from '@/lib/ship/focus'
import { SHIP_HINT } from '@/lib/uiLayout'
import { useUniverse } from '@/store/universe'

/** O que a primeira brincadeira pode ser: tocar ou arrastar (na nave ou em volta) e rolar para aproximar. */
const PLAY_EVENTS = ['pointerdown', 'wheel'] as const

// Posição e tamanho da fonte única (uiLayout), a mesma que reserva a área da dica.
const STYLE = {
  '--hint-bottom': `calc(${SHIP_HINT.bottom}px + var(--safe-bottom))`,
  '--hint-max-w': `min(${SHIP_HINT.maxWidth}px, calc(100vw - ${2 * SHIP_HINT.inset}px - var(--safe-left) - var(--safe-right)))`,
} as CSSProperties

/** Dica do modo de foco: aparece a cada entrada e some na primeira interação. */
function HintChip() {
  const touch = useMediaQuery(COARSE_POINTER_QUERY)
  const reduced = useReducedMotion() ?? false
  const [played, setPlayed] = useState(false)
  useEffect(() => {
    const onPlay = () => setPlayed(true)
    // na captura: o toque na nave não sobe até a janela (ele para no canvas, para a câmera não orbitar junto)
    for (const event of PLAY_EVENTS) window.addEventListener(event, onPlay, { passive: true, capture: true })
    return () => {
      for (const event of PLAY_EVENTS) window.removeEventListener(event, onPlay, { capture: true })
    }
  }, [])
  return (
    <AnimatePresence>
      {!played && (
        <motion.p
          key="hint"
          role="status"
          initial={{ opacity: 0, y: reduced ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.35 }}
          style={STYLE}
          className="pointer-events-none fixed inset-x-0 bottom-(--hint-bottom) z-20 mx-auto w-max max-w-(--hint-max-w) rounded-2xl border border-neon/20 bg-panel/90 px-4 py-2 text-center text-sm text-slate-200 shadow-lg backdrop-blur"
        >
          {focusHint(touch)}
        </motion.p>
      )}
    </AnimatePresence>
  )
}

/**
 * Modo de foco na nave (seleção `ship`): a dica no pé da tela e o Esc para voltar à galáxia (o "← Galáxia" é o
 * BackButton de sempre).
 */
export function ShipFocusHint() {
  const focused = useUniverse((s) => s.selection.kind === 'ship')
  const clearSelection = useUniverse((s) => s.clearSelection)
  useEffect(() => {
    if (!focused) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focused, clearSelection])
  // uma dica nova a cada entrada no modo
  return focused ? <HintChip /> : null
}
