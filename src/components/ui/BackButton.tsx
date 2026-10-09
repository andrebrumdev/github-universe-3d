import { BACK_BUTTON } from '@/lib/uiLayout'
import { usePresentation } from '@/store/presentation'
import { useUniverse } from '@/store/universe'

export function BackButton() {
  const selection = useUniverse((s) => s.selection)
  const clearSelection = useUniverse((s) => s.clearSelection)
  const presenting = usePresentation((s) => s.state !== null)
  // Na apresentação, quem sai é o ✕ do cartão.
  if (selection.kind === 'none' || presenting) return null
  return (
    <button
      type="button"
      onClick={clearSelection}
      // Posição e tamanho fixos, da mesma fonte que a nave na visita usa para não cobrir o botão.
      style={{ left: BACK_BUTTON.left, top: BACK_BUTTON.top, width: BACK_BUTTON.width, height: BACK_BUTTON.height }}
      className="fixed z-30 inline-flex items-center justify-center rounded-full border border-neon/40 bg-space/80 text-sm text-neon backdrop-blur hover:bg-neon/10"
    >
      ← Galáxia
    </button>
  )
}
