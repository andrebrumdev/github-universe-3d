import { MOBILE_QUERY, useMediaQuery } from './useMediaQuery'

const NO_BLOOM = new URLSearchParams(window.location.search).has('nobloom')

/** Bloom só no desktop (e fora do `?nobloom`, para comparar o custo). */
export function useBloomEnabled(): boolean {
  return !useMediaQuery(MOBILE_QUERY) && !NO_BLOOM
}
