import type { CSSProperties } from 'react'
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
      // Posição e tamanho fixos, da mesma fonte que a nave na visita usa para não cobrir o botão (fora das áreas
      // seguras). 44 px no toque; com mouse, 40.
      style={
        {
          left: `calc(${BACK_BUTTON.left}px + var(--safe-left))`,
          top: `calc(${BACK_BUTTON.top}px + var(--safe-top))`,
          width: BACK_BUTTON.width,
          '--btn-h': `${BACK_BUTTON.height}px`,
        } as CSSProperties
      }
      className="fixed z-30 inline-flex h-(--btn-h) items-center justify-center rounded-full border border-neon/40 bg-space/80 text-sm text-neon backdrop-blur hover:bg-neon/10 pointer-fine:h-10"
    >
      ← Galáxia
    </button>
  )
}
