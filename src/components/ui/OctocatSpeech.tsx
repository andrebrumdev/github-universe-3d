import { useEffect } from 'react'
import { useIdle } from '@/hooks/useIdle'
import { formatLine, LINE_DURATION_MS } from '@/lib/octocat/lines'
import { useUniverse } from '@/store/universe'

/** Controla a duração das falas e as espelha para leitores de tela; o balão visível fica preso à nave. */
export function OctocatSpeech({ profileName }: { profileName: string }) {
  const bubble = useUniverse((s) => s.bubble)
  const dismissBubble = useUniverse((s) => s.dismissBubble)
  const emitGuide = useUniverse((s) => s.emitGuide)

  useIdle(emitGuide)

  useEffect(() => {
    if (!bubble) return
    const timer = window.setTimeout(() => dismissBubble(bubble.seq), LINE_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [bubble, dismissBubble])

  return (
    <div aria-live="polite" className="sr-only">
      {bubble ? formatLine(bubble.line.text, profileName) : ''}
    </div>
  )
}
