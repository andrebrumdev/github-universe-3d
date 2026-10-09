import { create } from 'zustand'

/**
 * Com o bloom (desktop), o EffectComposer mistura o que é transparente/aditivo no buffer linear HDR, não na saída sRGB:
 * linhas de órbita, atmosferas e o halo do sol ficam bem mais claros e mais ciano. Estas opacidades devolvem o visual
 * sem bloom (celular, `?nobloom`). Só o GlowBloom liga e desliga (ver `applyBloomLook`).
 */
export const BLOOM_LOOK = {
  plain: { thrusterHalo: 1, orbit: 0.14, atmosphere: 0.24, halo: 1 },
  bloom: { thrusterHalo: 0.35, orbit: 0.04, atmosphere: 0.08, halo: 0.2 },
} as const

export type BloomLook = (typeof BLOOM_LOOK)[keyof typeof BLOOM_LOOK]

export const useBloom = create<{ active: boolean }>()(() => ({ active: false }))

export function bloomLook(active: boolean): BloomLook {
  return active ? BLOOM_LOOK.bloom : BLOOM_LOOK.plain
}
