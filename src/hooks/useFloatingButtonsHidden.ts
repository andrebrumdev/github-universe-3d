import { floatingButtonsHidden } from '@/lib/uiLayout'
import { usePresentation } from '@/store/presentation'
import { useSceneReady } from '@/store/sceneReady'
import { useUniverse } from '@/store/universe'
import { MOBILE_QUERY, useMediaQuery } from './useMediaQuery'

/**
 * "? Tutorial" e "▶ Apresentação" esperam a cena desenhar o primeiro quadro, e somem enquanto o painel (qualquer
 * seleção) está aberto, ou a folha da apresentação no celular: a mesma regra que tira os dois da lista do que a nave
 * evita (`reservedRects`).
 */
export function useFloatingButtonsHidden(): boolean {
  const phone = useMediaQuery(MOBILE_QUERY)
  const selected = useUniverse((s) => s.selection.kind !== 'none')
  const presenting = usePresentation((s) => s.state !== null)
  const sceneReady = useSceneReady((s) => s.ready)
  return !sceneReady || floatingButtonsHidden(phone, { panel: selected, presentation: presenting })
}
