import { useUniverse } from '@/store/universe'

export function BackButton() {
  const selection = useUniverse((s) => s.selection)
  const clearSelection = useUniverse((s) => s.clearSelection)
  if (selection.kind === 'none') return null
  return (
    <button
      type="button"
      onClick={clearSelection}
      className="fixed left-4 top-4 z-30 rounded-full border border-neon/40 bg-space/80 px-4 py-2 text-sm text-neon backdrop-blur hover:bg-neon/10"
    >
      ← Galáxia
    </button>
  )
}
