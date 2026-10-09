import { floatingButtonsHidden } from '@/lib/uiLayout'
import { usePresentation } from '@/store/presentation'
import { useUniverse } from '@/store/universe'
import { MOBILE_QUERY, useMediaQuery } from './useMediaQuery'

/**
 * "? Tutorial" e "▶ Apresentação" somem no celular enquanto a folha do painel (qualquer seleção) ou a da
 * apresentação está aberta: a mesma regra que tira os dois da lista do que a nave evita (`reservedRects`).
 */
export function useFloatingButtonsHidden(): boolean {
  const phone = useMediaQuery(MOBILE_QUERY)
  const selected = useUniverse((s) => s.selection.kind !== 'none')
  const presenting = usePresentation((s) => s.state !== null)
  return floatingButtonsHidden(phone, { panel: selected, presentation: presenting })
}
