import { useEffect } from 'react'
import { FINE_POINTER_QUERY } from '@/hooks/useMediaQuery'
import { newShrinkWatch, stepShrink } from '@/lib/octocat/cues'
import { cue } from '@/store/fourthWall'

/** Um aviso de orientação vale por este tempo (ms): o resize que vem junto não é aperto. */
const ORIENTATION_GRACE_MS = 1500

/** Janela encolheu de repente (só no desktop): o Octocat se firma, "Ei ei ei, tá apertando meu universo!". */
export function useShrinkCue(): void {
  useEffect(() => {
    const watch = newShrinkWatch()
    let turnedAt = -Infinity
    const sample = () => stepShrink(watch, performance.now(), window.innerWidth, window.innerHeight, performance.now() - turnedAt < ORIENTATION_GRACE_MS)
    sample()
    const onResize = () => {
      if (sample() && window.matchMedia(FINE_POINTER_QUERY).matches) cue({ type: 'shrink' })
    }
    const onTurn = () => {
      turnedAt = performance.now()
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onTurn)
    screen.orientation?.addEventListener('change', onTurn)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onTurn)
      screen.orientation?.removeEventListener('change', onTurn)
    }
  }, [])
}
