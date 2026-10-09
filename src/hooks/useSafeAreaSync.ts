import { useEffect } from 'react'
import { setSafeArea } from '@/lib/uiLayout'

const px = (v: string) => Number.parseFloat(v) || 0

/**
 * Mede as áreas seguras (`env(safe-area-inset-*)`, que só existem no CSS) num elemento invisível e copia para o
 * uiLayout, onde os retângulos que a nave evita contam com elas. Mede de novo a cada resize (girar o celular).
 */
export function useSafeAreaSync(): void {
  useEffect(() => {
    const probe = document.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText =
      'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
      'padding:var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left)'
    document.body.appendChild(probe)
    const read = () => {
      const cs = getComputedStyle(probe)
      setSafeArea({ top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) })
    }
    read()
    window.addEventListener('resize', read)
    return () => {
      window.removeEventListener('resize', read)
      probe.remove()
    }
  }, [])
}
