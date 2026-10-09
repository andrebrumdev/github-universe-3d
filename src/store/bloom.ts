import { create } from 'zustand'

/**
 * Com o bloom (desktop), o EffectComposer mistura o que é transparente/aditivo no buffer linear HDR, não na saída sRGB:
 * linhas de órbita, atmosferas, o halo do sol e as caudas e a coma dos cometas ficam bem mais claros e mais ciano.
 * Estas opacidades devolvem o visual sem bloom (celular, `?nobloom`). Só o GlowBloom liga e desliga (ver `applyBloomLook`).
 * Cometas (medidos contra o `?nobloom`, luminância média da cauda e da coma perto do periélio, ±2%): caudas ×0,43
 * e coma ×0,3.
 */
export const BLOOM_LOOK = {
  plain: { thrusterHalo: 1, orbit: 0.14, atmosphere: 0.24, halo: 1, ionTail: 0.9, dustTail: 0.55, coma: 0.6 },
  bloom: { thrusterHalo: 0.35, orbit: 0.04, atmosphere: 0.08, halo: 0.2, ionTail: 0.39, dustTail: 0.24, coma: 0.18 },
} as const

export type BloomLook = (typeof BLOOM_LOOK)[keyof typeof BLOOM_LOOK]

export const useBloom = create<{ active: boolean }>()(() => ({ active: false }))

export function bloomLook(active: boolean): BloomLook {
  return active ? BLOOM_LOOK.bloom : BLOOM_LOOK.plain
}
