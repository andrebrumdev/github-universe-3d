import { useCallback, useSyncExternalStore } from 'react'

export const MOBILE_QUERY = '(max-width: 767px)'
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
