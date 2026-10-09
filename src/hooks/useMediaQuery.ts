import { useCallback, useSyncExternalStore } from 'react'
import { DESKTOP_MIN_WIDTH, SHORT_LANDSCAPE_MAX_HEIGHT } from '@/lib/uiLayout'

/**
 * Layout de folha (`isSheetLayout` em uiLayout): estreito e em pé, ou estreito e alto. Celular deitado e baixo fica
 * com o layout lateral. A variante `side:` do CSS (index.css) é o contrário desta consulta.
 */
export const MOBILE_QUERY =
  `(max-width: ${DESKTOP_MIN_WIDTH - 1}px) and (orientation: portrait), ` +
  `(max-width: ${DESKTOP_MIN_WIDTH - 1}px) and (min-height: ${SHORT_LANDSCAPE_MAX_HEIGHT + 1}px)`
/** Mouse de verdade (notebook, desktop): passa o cursor por cima e aponta fino. Toque e tablet ficam de fora. */
export const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)'
/** Dedo (ou caneta): alvos de 44 px e nada que dependa de passar o cursor por cima. */
export const COARSE_POINTER_QUERY = '(pointer: coarse)'

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}
