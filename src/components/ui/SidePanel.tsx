import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { MOBILE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'

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
          className="fixed inset-x-0 bottom-0 z-20 max-h-[60vh] overflow-y-auto rounded-t-2xl border border-neon/20 bg-panel/90 p-5 backdrop-blur md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[380px] md:rounded-none md:rounded-l-2xl"
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
