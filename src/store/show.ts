import { create } from 'zustand'
import { SHOW_IDLE, showReducer, type ShowAction, type ShowState } from '@/lib/easter/show'

/** Show do botão "Não clique aqui" (easter egg, lib/easter/show): o estado mutável (o tempo anda no `ShowDriver`). */
export const show: { state: ShowState } = { state: SHOW_IDLE }

/** A fase e a rodada no React (o botão some durante o show e volta na rodada seguinte). */
export const useShow = create<{ phase: ShowState['phase']; round: number }>()(() => ({ phase: 'idle', round: 0 }))

export function dispatchShow(action: ShowAction): ShowState {
  const prev = show.state
  const next = showReducer(prev, action)
  show.state = next
  if (next.phase !== prev.phase || next.round !== prev.round) useShow.setState({ phase: next.phase, round: next.round })
  return next
}

/**
 * Efeitos do show para a cena, por contador (cada consumidor guarda o último que viu): parafuso e estouro da chama e
 * pulinho do Clawd e aceno (ShipRig), confete (ShowConfetti).
 */
export const showFx = { roll: 0, burst: 0, hop: 0, wave: 0, confetti: 0 }
