import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { MOBILE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { SIDE_PANEL_MAX_FRACTION, SIDE_PANEL_WIDTH, SIDE_SHEET_MAX_HEIGHT } from '@/lib/uiLayout'

/**
 * Largura da coluna (no celular deitado, no máximo metade da tela) e altura máxima da folha no celular, da fonte única
 * (uiLayout): o balão do Octocat, a apresentação e a nave na visita contam com elas. A folha usa `dvh` (a altura
 * visível, sem as barras do navegador), como a da apresentação, e o pé dela respeita o indicador de início.
 */
const PANEL_STYLE = {
  '--panel-width-md': `min(${SIDE_PANEL_WIDTH}px, ${SIDE_PANEL_MAX_FRACTION * 100}vw)`,
  '--sheet-max-h': `${SIDE_SHEET_MAX_HEIGHT * 100}dvh`,
} as CSSProperties

interface SidePanelProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function SidePanel({ open, onClose, title, children }: SidePanelProps) {
  const mobile = useMediaQuery(MOBILE_QUERY)
  const reduced = useReducedMotion()
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeButton.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const hidden = reduced ? { opacity: 0 } : mobile ? { y: '100%' } : { x: '100%' }

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="panel"
          role="dialog"
          aria-label={title}
          initial={hidden}
          animate={{ x: 0, y: 0, opacity: 1 }}
          exit={hidden}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          style={PANEL_STYLE}
          className="fixed inset-x-0 bottom-0 z-20 max-h-(--sheet-max-h) overflow-y-auto overscroll-contain rounded-t-2xl border border-neon/20 bg-panel/90 p-5 pb-[max(1.25rem,var(--safe-bottom))] backdrop-blur side:inset-y-0 side:left-auto side:right-0 side:max-h-none side:w-(--panel-width-md) side:rounded-none side:rounded-l-2xl side:pr-[max(1.25rem,var(--safe-right))]"
        >
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Fechar painel"
            className="absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-400 hover:text-neon pointer-coarse:h-11 pointer-coarse:w-11 side:right-[calc(0.5rem_+_var(--safe-right))]"
          >
            ✕
          </button>
          {children}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
