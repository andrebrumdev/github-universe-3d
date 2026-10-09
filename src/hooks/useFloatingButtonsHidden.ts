import { panelSelection } from '@/lib/interaction'
import { floatingButtonsHidden } from '@/lib/uiLayout'
import { usePresentation } from '@/store/presentation'
import { useSceneReady } from '@/store/sceneReady'
import { useUniverse } from '@/store/universe'
import { MOBILE_QUERY, useMediaQuery } from './useMediaQuery'

/**
 * "? Tutorial" e "▶ Apresentação" esperam a cena desenhar o primeiro quadro, e somem enquanto o painel (planeta, lua,
 * perfil) está aberto, no modo de foco na nave, ou com a folha da apresentação no celular: a mesma regra que tira os
 * dois da lista do que a nave evita (`reservedRects`).
 */
export function useFloatingButtonsHidden(): boolean {
  const phone = useMediaQuery(MOBILE_QUERY)
  const panel = useUniverse((s) => panelSelection(s.selection))
  const ship = useUniverse((s) => s.selection.kind === 'ship')
  const presenting = usePresentation((s) => s.state !== null)
  const sceneReady = useSceneReady((s) => s.ready)
  return !sceneReady || floatingButtonsHidden(phone, { panel, ship, presentation: presenting })
}
