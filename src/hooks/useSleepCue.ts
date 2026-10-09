import { useCallback, useEffect } from 'react'
import { useIdle } from '@/hooks/useIdle'
import { cue, useFourthWall } from '@/store/fourthWall'

const WAKE_EVENTS = ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'] as const

/** Longa inatividade: o Octocat cochila encostado na borda; qualquer entrada o acorda (a nave volta à escolta). */
export function useSleepCue(): void {
  const onIdle = useCallback((kind: 'idle' | 'longIdle') => {
    if (kind === 'longIdle') cue({ type: 'longIdle' })
  }, [])
  useIdle(onIdle)
  useEffect(() => {
    const wake = () => {
      if (useFourthWall.getState().sleep.on) cue({ type: 'wake' })
    }
    for (const event of WAKE_EVENTS) window.addEventListener(event, wake, { passive: true, capture: true })
    return () => {
      for (const event of WAKE_EVENTS) window.removeEventListener(event, wake, { capture: true })
    }
  }, [])
}
