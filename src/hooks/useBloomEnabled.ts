import { bloomAllowed } from '@/lib/renderBudget'
import { FINE_POINTER_QUERY, MOBILE_QUERY, useMediaQuery } from './useMediaQuery'

const NO_BLOOM = new URLSearchParams(window.location.search).has('nobloom')

/** Bloom só com tela larga e mouse de verdade (e fora do `?nobloom`, para comparar o custo): ver `bloomAllowed`. */
export function useBloomEnabled(): boolean {
  const wide = !useMediaQuery(MOBILE_QUERY)
  const finePointer = useMediaQuery(FINE_POINTER_QUERY)
  return bloomAllowed({ wide, finePointer, noBloomParam: NO_BLOOM })
}
