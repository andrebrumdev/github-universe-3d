/**
 * Ponteiros apertados na tela agora (ids), contados na fase de captura da janela: quem começa um arrasto sabe se já
 * há outro dedo na tela (aí é pinça, da câmera) e quem termina sabe quantos sobraram. Um ouvinte só, da vida da página.
 */
const down = new Set<number>()

export function pointersDown(): number {
  return down.size
}

/** Outros ponteiros apertados além de `pointerId`. */
export function othersDown(pointerId: number): number {
  return down.size - (down.has(pointerId) ? 1 : 0)
}

if (typeof window !== 'undefined') {
  const remove = (e: PointerEvent) => down.delete(e.pointerId)
  window.addEventListener('pointerdown', (e) => down.add(e.pointerId), { capture: true, passive: true })
  window.addEventListener('pointerup', remove, { capture: true, passive: true })
  window.addEventListener('pointercancel', remove, { capture: true, passive: true })
  // a janela perdeu o foco: as solturas de agora não chegam aqui
  window.addEventListener('blur', () => down.clear())
}
