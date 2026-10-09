/**
 * Orçamento de render por aparelho. "Mouse de verdade" = `(hover: hover) and (pointer: fine)` (FINE_POINTER_QUERY):
 * notebook e desktop. Celular e tablet (toque, ponteiro grosso, sem hover) ficam com o teto menor.
 */

/** Faixa de DPR do Canvas: até 2× com mouse; no toque, até 1,5× (2× numa tela de celular é ~1,8× mais pixels). */
export function canvasDpr(finePointer: boolean): [number, number] {
  return finePointer ? DPR_FINE : DPR_TOUCH
}
// constantes: o Canvas recebe a mesma faixa a cada render
const DPR_FINE: [number, number] = [1, 2]
const DPR_TOUCH: [number, number] = [1, 1.5]

/**
 * Bloom (EffectComposer com multisampling e mipmap blur) só com tela larga e mouse: um iPad ou tablet grande em
 * paisagem passa da largura, mas não paga o composer. `noBloomParam`: o `?nobloom`, para comparar o custo.
 */
export function bloomAllowed({ wide, finePointer, noBloomParam }: { wide: boolean; finePointer: boolean; noBloomParam: boolean }): boolean {
  return wide && finePointer && !noBloomParam
}
