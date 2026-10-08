import { useTutorial } from '@/store/tutorial'

export function TutorialButton() {
  const start = useTutorial((s) => s.start)
  return (
    <button
      type="button"
      onClick={start}
      aria-label="Abrir tutorial com o Octocat"
      className="fixed bottom-4 right-4 z-30 rounded-full border border-neon/40 bg-space/80 px-3 py-1.5 text-xs text-neon backdrop-blur hover:bg-neon/10"
    >
      ? Tutorial
    </button>
  )
}
