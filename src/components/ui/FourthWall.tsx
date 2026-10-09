import { useEffect } from 'react'
import { useFpsCue } from '@/hooks/useFpsCue'
import { usePanelArrivalCue } from '@/hooks/usePanelArrivalCue'
import { useRecruiterCue } from '@/hooks/useRecruiterCue'
import { useShrinkCue } from '@/hooks/useShrinkCue'
import { useSleepCue } from '@/hooks/useSleepCue'
import type { Universe } from '@/lib/types'
import { cue } from '@/store/fourthWall'
import { useSceneReady } from '@/store/sceneReady'

/** De quanto em quanto tempo (ms) as falas que esperam a vez (recrutador, fps) conferem se já podem sair. */
const TICK_MS = 1000

type Props = { universe: Pick<Universe, 'profile' | 'repos'> }

/**
 * Roteiro da quarta parede (lib/octocat/script): liga os medidores (link/origem do visitante, chegada no painel,
 * inatividade, janela, fps) ao diretor. Não desenha nada: as falas vão para o balão do Octocat (aria-live) e as
 * reações, para a nave (store/fourthWall). A tontura do zoom é medida dentro da cena (ShipRig). Tudo começa só com a
 * cena na tela (antes, o Loader cobre tudo e o relógio do "25 s na página" nem conta).
 */
export function FourthWall({ universe }: Props) {
  const ready = useSceneReady((s) => s.ready)
  return ready ? <Cues universe={universe} /> : null
}

function Cues({ universe }: Props) {
  useRecruiterCue(universe)
  usePanelArrivalCue(universe)
  useSleepCue()
  useShrinkCue()
  useFpsCue()
  useEffect(() => {
    const timer = window.setInterval(() => cue({ type: 'tick' }), TICK_MS)
    return () => window.clearInterval(timer)
  }, [])
  return null
}
