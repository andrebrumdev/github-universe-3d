import { useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import { showCuesBetween } from '@/lib/easter/show'
import { EASTER_LINES } from '@/lib/octocat/lines'
import { dispatchShow, show, showFx } from '@/store/show'
import { usePresentation } from '@/store/presentation'
import { shipPose } from '@/store/shipPose'
import { useTutorial } from '@/store/tutorial'
import { useUniverse } from '@/store/universe'

/**
 * Show do botão "Não clique aqui" (lib/easter/show), a cada quadro: chama a nave para o palco (o modo de foco: ela
 * estaciona no meio da tela e a câmera vai até ela), solta as deixas do roteiro (falas aqui; parafusos, chama, pulos do
 * Clawd e aceno na nave, confete no ShowConfetti, por `showFx`) e, no fim, solta a nave. O tutorial ou a apresentação
 * começando encerram o show.
 */
export function ShowDriver() {
  const reduced = useReducedMotion() ?? false
  useFrame((_, dt) => {
    const before = show.state
    if (before.phase === 'idle') return
    const universe = useUniverse.getState()
    if (useTutorial.getState().step !== null || usePresentation.getState().state !== null) {
      dispatchShow({ type: 'interrupt' })
      return
    }
    const focused = universe.selection.kind === 'ship'
    const next = dispatchShow({ type: 'tick', dt, reduced, shipMode: shipPose.mode, focused })
    // a nave parou: vai para o palco (sem a fala do guia: o show tem as dele)
    if (before.phase === 'calling' && next.phase === 'arriving') universe.select({ kind: 'ship' }, { quiet: true })
    if (next.phase === 'performing') {
      const from = before.phase === 'performing' ? before.elapsed : -1
      for (const cue of showCuesBetween(from, next.elapsed, reduced)) {
        if (cue === 'line-1') universe.play(EASTER_LINES.showStart, 'surprised')
        else if (cue === 'line-2') universe.play(EASTER_LINES.showThanks, 'wink')
        else showFx[cue]++
      }
    }
    // acabou: a nave sai do palco (se o usuário já não a tirou de lá)
    if (next.phase === 'idle' && before.staged && focused) universe.clearSelection()
  })
  return null
}
