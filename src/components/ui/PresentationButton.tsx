import { useEffect, type CSSProperties } from 'react'
import { presentationRequested } from '@/lib/presentation'
import type { Universe } from '@/lib/types'
import { PRESENTATION_BUTTON } from '@/lib/uiLayout'
import { usePresentation } from '@/store/presentation'

/** Com `?apresentacao` no link, espera a nave entrar em cena antes de partir. */
const AUTO_START_MS = 1200

// Posição e tamanho fixos, da mesma fonte que a nave da escolta usa para não cobrir o botão.
const STYLE = {
  '--btn-w': `${PRESENTATION_BUTTON.width}px`,
  '--btn-h': `${PRESENTATION_BUTTON.height}px`,
  '--btn-right': `${PRESENTATION_BUTTON.phoneRight}px`,
  '--btn-bottom': `${PRESENTATION_BUTTON.phoneBottom}px`,
  '--btn-right-md': `${PRESENTATION_BUTTON.desktopRight}px`,
  '--btn-bottom-md': `${PRESENTATION_BUTTON.desktopBottom}px`,
} as CSSProperties

export function PresentationButton({ universe }: { universe: Universe }) {
  const active = usePresentation((s) => s.state !== null)
  const start = usePresentation((s) => s.start)

  useEffect(() => {
    if (!presentationRequested(window.location.search)) return
    const timer = window.setTimeout(() => start(universe), AUTO_START_MS)
    return () => window.clearTimeout(timer)
    // Roda uma vez: `universe` só muda numa nova carga, e `start` é estável.
  }, [start, universe])

  if (active) return null
  return (
    <button
      type="button"
      onClick={() => start(universe)}
      aria-label="Começar a apresentação guiada do perfil e dos repositórios"
      style={STYLE}
      className="fixed right-(--btn-right) bottom-(--btn-bottom) z-30 inline-flex h-(--btn-h) w-(--btn-w) items-center justify-center rounded-full border border-neon/40 bg-space/80 text-xs text-neon backdrop-blur hover:bg-neon/10 md:right-(--btn-right-md) md:bottom-(--btn-bottom-md)"
    >
      ▶ Apresentação
    </button>
  )
}
