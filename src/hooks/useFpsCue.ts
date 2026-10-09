import { useEffect } from 'react'
import { FINE_POINTER_QUERY } from '@/hooks/useMediaQuery'
import { newFpsWatch, smoothFpsReady, stepFps } from '@/lib/octocat/cues'
import { cue } from '@/store/fourthWall'

const INTERACTIONS = ['pointerdown', 'keydown', 'wheel'] as const
/** Rodinha conta uma interação por giro, não uma por evento. */
const WHEEL_GAP_MS = 600

/** `?fpsline` (só em desenvolvimento): a fala do fps sai sem medir nem esperar (capturas de tela). */
const forced = () => import.meta.env.DEV && new URLSearchParams(window.location.search).has('fpsline')

/**
 * Mede o fps (quadros do navegador) e, se fica liso por um tempo no desktop, o Octocat elogia a otimização (uma vez por
 * sessão, depois de quem chegou ter mexido um pouco). Nunca em aparelho lento; não há fala negativa.
 */
export function useFpsCue(): void {
  useEffect(() => {
    const watch = newFpsWatch()
    const start = performance.now()
    const force = forced()
    let interactions = 0
    let lastWheel = -Infinity
    const count = (e: Event) => {
      if (e.type === 'wheel') {
        if (e.timeStamp - lastWheel < WHEEL_GAP_MS) {
          lastWheel = e.timeStamp
          return
        }
        lastWheel = e.timeStamp
      }
      interactions++
    }
    for (const event of INTERACTIONS) window.addEventListener(event, count, { passive: true, capture: true })
    let raf = 0
    let last = -1
    const frame = (now: number) => {
      if (last >= 0) stepFps(watch, (now - last) / 1000)
      last = now
      if (smoothFpsReady({ watch, desktop: window.matchMedia(FINE_POINTER_QUERY).matches, interactions, sinceStartMs: now - start, force })) {
        // uma vez por sessão: depois disso o diretor só espera a vez da fala
        cue({ type: 'smoothFps' })
        return
      }
      // aparelho lento: nem precisa seguir medindo
      if (!watch.low) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      for (const event of INTERACTIONS) window.removeEventListener(event, count, { capture: true })
    }
  }, [])
}
