import { useEffect, useRef, type CSSProperties } from 'react'
import { autostartDecision, presentationRequested } from '@/lib/presentation'
import type { Universe } from '@/lib/types'
import { PRESENTATION_BUTTON } from '@/lib/uiLayout'
import { usePresentation } from '@/store/presentation'
import { shipPose } from '@/store/shipPose'
import { useTutorial } from '@/store/tutorial'
import { useUniverse } from '@/store/universe'

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
  const button = useRef<HTMLButtonElement>(null)
  const wasActive = useRef(false)

  // `?apresentacao`: começa quando a cena montou e a nave terminou a entrada (o ShipRig escreve o modo em shipPose
  // a cada quadro; antes de a cena montar ele é 'entering'). Se o usuário agiu antes, desiste.
  useEffect(() => {
    if (!presentationRequested(window.location.search)) return
    let frame = 0
    const poll = () => {
      const decision = autostartDecision({
        shipMode: shipPose.mode,
        selected: useUniverse.getState().selection.kind !== 'none',
        tutorialOpen: useTutorial.getState().step !== null,
        presenting: usePresentation.getState().state !== null,
      })
      if (decision === 'start') start(universe)
      else if (decision === 'wait') frame = requestAnimationFrame(poll)
    }
    frame = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(frame)
  }, [start, universe])

  // Ao sair pelo ✕, Esc ou "Explorar", o foco volta para este botão (não cai no <body>). Se o usuário assumiu
  // (clicou num planeta, abriu o tutorial), o foco fica com quem ele escolheu.
  useEffect(() => {
    if (active) wasActive.current = true
    else if (wasActive.current) {
      wasActive.current = false
      if (usePresentation.getState().ended === 'exit') button.current?.focus({ preventScroll: true })
    }
  }, [active])

  if (active) return null
  return (
    <button
      ref={button}
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
