import { useFloatingButtonsHidden } from '@/hooks/useFloatingButtonsHidden'
import { TUTORIAL_BUTTON } from '@/lib/uiLayout'
import { useTutorial } from '@/store/tutorial'

export function TutorialButton() {
  const start = useTutorial((s) => s.start)
  // Com o painel aberto (ou a folha da apresentação, no celular), sai do caminho; o tutorial segue no clique na nave.
  const hidden = useFloatingButtonsHidden()
  if (hidden) return null
  return (
    <button
      type="button"
      onClick={start}
      aria-label="Abrir tutorial com o Octocat"
      // Posição e tamanho fixos, da mesma fonte que a nave da escolta usa para não cobrir o botão.
      style={{ right: TUTORIAL_BUTTON.right, bottom: TUTORIAL_BUTTON.bottom, width: TUTORIAL_BUTTON.width, height: TUTORIAL_BUTTON.height }}
      className="fixed z-30 inline-flex items-center justify-center rounded-full border border-neon/40 bg-space/80 text-xs text-neon backdrop-blur hover:bg-neon/10"
    >
      ? Tutorial
    </button>
  )
}
