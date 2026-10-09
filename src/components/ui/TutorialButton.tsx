import type { CSSProperties } from 'react'
import { useFloatingButtonsHidden } from '@/hooks/useFloatingButtonsHidden'
import { TUTORIAL_BUTTON } from '@/lib/uiLayout'
import { useTutorial } from '@/store/tutorial'

export function TutorialButton() {
  const start = useTutorial((s) => s.start)
  // Com o painel aberto, no modo de foco na nave (ou a folha da apresentação, no celular), sai do caminho: o tutorial
  // só abre por aqui (clicar na nave entra no modo de foco).
  const hidden = useFloatingButtonsHidden()
  if (hidden) return null
  return (
    <button
      type="button"
      onClick={start}
      aria-label="Abrir tutorial com o Octocat"
      // Posição e tamanho fixos, da mesma fonte que a nave da escolta usa para não cobrir o botão (fora das áreas
      // seguras). 44 px no toque; com mouse, mais baixo no mesmo lugar.
      style={
        {
          right: `calc(${TUTORIAL_BUTTON.right}px + var(--safe-right))`,
          bottom: `calc(${TUTORIAL_BUTTON.bottom}px + var(--safe-bottom))`,
          width: TUTORIAL_BUTTON.width,
          '--btn-h': `${TUTORIAL_BUTTON.height}px`,
        } as CSSProperties
      }
      className="fixed z-30 inline-flex h-(--btn-h) items-center justify-center rounded-full border border-neon/40 bg-space/80 text-sm text-neon backdrop-blur hover:bg-neon/10 pointer-fine:h-8 pointer-fine:text-xs"
    >
      ? Tutorial
    </button>
  )
}
