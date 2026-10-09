import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { MOBILE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { SIDE_PANEL_WIDTH, SIDE_SHEET_MAX_HEIGHT } from '@/lib/uiLayout'

/**
 * Largura no desktop e altura máxima da folha no celular, da fonte única (uiLayout): o balão do Octocat, a apresentação
 * e a nave na visita contam com elas. A folha usa `dvh` (a altura visível, sem as barras do navegador), como a da
 * apresentação.
 */
const PANEL_STYLE = {
  '--panel-width-md': `${SIDE_PANEL_WIDTH}px`,
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
          className="fixed inset-x-0 bottom-0 z-20 max-h-(--sheet-max-h) overflow-y-auto rounded-t-2xl border border-neon/20 bg-panel/90 p-5 backdrop-blur md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-(--panel-width-md) md:rounded-none md:rounded-l-2xl"
        >
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Fechar painel"
            className="absolute right-3 top-3 rounded-full p-2 text-slate-400 hover:text-neon"
          >
            ✕
          </button>
          {children}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
