import { create } from 'zustand'
import { panelTargetKey } from '@/lib/panelReady'
import { useUniverse } from './universe'

/**
 * Chave do alvo cujo painel já pode aparecer (a nave chegou). Vale só enquanto a seleção pede essa mesma chave: trocar
 * de planeta esconde o painel na hora, sem esperar o próximo quadro.
 */
export const usePanelReadyKey = create<{ key: string | null; set: (key: string | null) => void }>()((set) => ({
  key: null,
  set: (key) => set((s) => (s.key === key ? s : { key })),
}))

/** O painel da seleção atual já pode aparecer? (`reduced`: sem voo, imediato.) */
export function usePanelReady(reduced: boolean): boolean {
  const key = useUniverse((s) => panelTargetKey(s.selection))
  const ready = usePanelReadyKey((s) => s.key)
  return key !== null && (reduced || ready === key)
}
