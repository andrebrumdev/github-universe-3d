import { useEffect } from 'react'
import { IDLE_MS, LONG_IDLE_MS } from '@/lib/octocat/lines'

const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'] as const

export function useIdle(onIdle: (kind: 'idle' | 'longIdle') => void): void {
  useEffect(() => {
    let idle = 0
    let longIdle = 0
    const arm = () => {
      window.clearTimeout(idle)
      window.clearTimeout(longIdle)
      idle = window.setTimeout(() => onIdle('idle'), IDLE_MS)
      longIdle = window.setTimeout(() => onIdle('longIdle'), LONG_IDLE_MS)
    }
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, arm, { passive: true })
    arm()
    return () => {
      window.clearTimeout(idle)
      window.clearTimeout(longIdle)
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, arm)
    }
  }, [onIdle])
}
