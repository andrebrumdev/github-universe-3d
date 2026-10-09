import { create } from 'zustand'
import { DISCO_OFF, discoBlocked, discoLevel, discoReducer, type DiscoAction, type DiscoState } from '@/lib/easter/disco'
import { crashCamera, crashTimeline } from './crash'
import { usePresentation } from './presentation'
import { useTutorial } from './tutorial'

/**
 * Modo disco (easter egg do Konami Code): o estado mora aqui (lib/easter/disco), mutável e lido a cada quadro pelo
 * relógio, pelo sol, pelos fachos, pela chuva e pela nave (`disco.level` já calculado); o store do React só muda quando
 * a fase muda (monta e desmonta os efeitos, fala).
 */
export const disco: { state: DiscoState; level: number } = { state: DISCO_OFF, level: 0 }

export const useDisco = create<{ phase: DiscoState['phase']; seq: number }>()(() => ({ phase: 'off', seq: 0 }))

/** Tutorial, apresentação ou trombada (do mergulho até a trinca sumir) seguram o disco. */
export function discoBlockedNow(): boolean {
  return discoBlocked({
    tutorial: useTutorial.getState().step !== null,
    presentation: usePresentation.getState().state !== null,
    crash: crashTimeline.since >= 0 || crashCamera.hold,
  })
}

export function dispatchDisco(action: DiscoAction): void {
  const next = discoReducer(disco.state, action)
  if (next === disco.state) return
  disco.state = next
  disco.level = discoLevel(next)
  const { phase, seq } = useDisco.getState()
  if (next.phase !== phase || next.seq !== seq) useDisco.setState({ phase: next.phase, seq: next.seq })
}

/** O código foi digitado (ou o gesto feito no celular). */
export function konami(): void {
  dispatchDisco({ type: 'code', blocked: discoBlockedNow() })
}
