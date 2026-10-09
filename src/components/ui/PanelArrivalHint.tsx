import { useEffect, type CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { selectedPlanet } from '@/lib/interaction'
import { panelTargetKey } from '@/lib/panelReady'
import type { Universe } from '@/lib/types'
import { BACK_BUTTON } from '@/lib/uiLayout'
import { usePanelReady } from '@/store/panelReady'
import { usePresentation } from '@/store/presentation'
import { useUniverse } from '@/store/universe'

// Ao lado do "← Galáxia", na mesma linha e altura (fonte única: uiLayout).
const STYLE = {
  left: `calc(${BACK_BUTTON.left + BACK_BUTTON.width + 8}px + var(--safe-left))`,
  top: `calc(${BACK_BUTTON.top}px + var(--safe-top))`,
  '--hint-h': `${BACK_BUTTON.height}px`,
} as CSSProperties

/**
 * Enquanto a nave voa até o alvo, o painel ainda não existe: só uma dica discreta ao lado do "← Galáxia" ("a caminho de
 * …"), lida em voz baixa (status). O Esc cancela a viagem como o botão.
 */
export function PanelArrivalHint({ universe }: { universe: Universe }) {
  const selection = useUniverse((s) => s.selection)
  const clearSelection = useUniverse((s) => s.clearSelection)
  const reduced = useReducedMotion() ?? false
  const ready = usePanelReady(reduced)
  const presenting = usePresentation((s) => s.state !== null)
  const waiting = panelTargetKey(selection) !== null && !ready && !presenting
  useEffect(() => {
    if (!waiting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [waiting, clearSelection])
  const planet = selectedPlanet(selection)
  const name = planet ?? universe.profile.name
  return (
    <AnimatePresence>
      {waiting && (
        <motion.p
          key="arrival-hint"
          role="status"
          data-target={planet ? 'planet' : 'sun'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.25 }}
          style={STYLE}
          className="pointer-events-none fixed z-20 inline-flex h-(--hint-h) max-w-[calc(100vw-9.5rem)] items-center truncate rounded-full bg-space/60 px-3 text-xs text-slate-300 backdrop-blur pointer-fine:h-10"
        >
          <span className="truncate">a caminho de {name}…</span>
        </motion.p>
      )}
    </AnimatePresence>
  )
}
