import { useEffect } from 'react'
import { useReducedMotion } from 'framer-motion'
import { newPanelWatch, panelTargetKey, stepPanelReady } from '@/lib/panelReady'
import { usePanelReadyKey } from '@/store/panelReady'
import { shipPose } from '@/store/shipPose'
import { useUniverse } from '@/store/universe'

function shipKey(): string | null {
  const t = shipPose.target
  return !t ? null : t.kind === 'sun' ? 'sun' : `planet:${t.name}`
}

/** Lê a nave a cada quadro enquanto há um painel esperando e marca a chave pronta na chegada (um só, montado no App). */
export function usePanelReadyDriver(): void {
  const key = useUniverse((s) => panelTargetKey(s.selection))
  const reduced = useReducedMotion() ?? false
  useEffect(() => {
    const set = usePanelReadyKey.getState().set
    if (key === null) {
      set(null)
      return
    }
    if (reduced) {
      set(key)
      return
    }
    // outra chave: o painel antigo já saiu (a derivação compara com a seleção); aqui só espera a nova chegada
    if (usePanelReadyKey.getState().key !== key) set(null)
    const watch = newPanelWatch()
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      // tempo real, sem teto: em GL por software os quadros demoram e a rede de segurança é em segundos de verdade
      const dt = (now - last) / 1000
      last = now
      if (stepPanelReady(watch, key, { mode: shipPose.mode, targetKey: shipKey() }, false, dt)) {
        set(key)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [key, reduced])
}
