import { create } from 'zustand'

/**
 * Com o bloom (desktop), o EffectComposer mistura o que é transparente/aditivo no buffer linear HDR, não na saída sRGB:
 * linhas de órbita, atmosferas e as caudas e a coma dos cometas ficam bem mais claros e mais ciano.
 * Estas opacidades devolvem o visual sem bloom (celular, `?nobloom`). Só o GlowBloom liga e desliga (ver `applyBloomLook`).
 * Cometas (medidos contra o `?nobloom`, luminância média da cauda e da coma perto do periélio, ±2%): caudas ×0,43
 * e coma ×0,3.
 * Rastro de fogo da nave (energia do rastro numa faixa em volta dele, menos o fundo, vista lateral a meio da viagem):
 * fica quase todo abaixo do limiar do bloom e, aditivo sobre o preto, já bate com o `?nobloom` em voo normal (×1: +0,1%;
 * visão larga −1,3%); só o núcleo quente do estilingue passa do limiar (×1: +14%). ×0,9 divide o erro: −5% no voo
 * normal, +6% no estilingue.
 * Sol (brilho `halo` e névoa `haze`): o próprio sol fica fora do bloom e do ACES (marca alfa 0, ver `sunComposer`),
 * então nada dele vaza e o ACES do ToneMapping só escurece o aditivo — aqui as chaves passam de 1. Medidos contra o
 * `?nobloom` (luminância radial média em 64 ângulos, close-up do perfil): brilho ×1,6 (anel de 1,03 a 1,7 R, casca
 * mais larga do sol do Sphere: +1,7%) e névoa ×1,95 (anel de 1,8 a 2,3 R: −4%, já no ruído das estrelas).
 * Voo (energia de cada efeito no mesmo quadro parado, com e sem ele, contra o `?nobloom`): vapor das asas ×1 (+0,2%),
 * puff de ré ×1,6 (+3,7%: o miolo claro das nuvens passa do limiar e o ACES escurece o resto) e pluma da chama-piloto
 * ×1 (−5%; pequena demais para medir melhor, no ruído do vapor em volta).
 */
export const BLOOM_LOOK = {
  plain: { thrusterHalo: 1, orbit: 0.14, atmosphere: 0.24, halo: 1, ionTail: 0.9, dustTail: 0.55, coma: 0.6, trail: 1, haze: 1, contrail: 1, puff: 1, plume: 1 },
  bloom: { thrusterHalo: 0.35, orbit: 0.04, atmosphere: 0.08, halo: 1.6, ionTail: 0.39, dustTail: 0.24, coma: 0.18, trail: 0.9, haze: 1.95, contrail: 1, puff: 1.6, plume: 1 },
} as const

export type BloomLook = (typeof BLOOM_LOOK)[keyof typeof BLOOM_LOOK]

export const useBloom = create<{ active: boolean }>()(() => ({ active: false }))

export function bloomLook(active: boolean): BloomLook {
  return active ? BLOOM_LOOK.bloom : BLOOM_LOOK.plain
}
