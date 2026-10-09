import { create } from 'zustand'
import type { UniverseSelection } from '@/lib/interaction'
import {
  buildStops,
  presentationReducer,
  type PresentationAction,
  type PresentationState,
  type Stop,
  stopLine,
  stopSelection,
} from '@/lib/presentation'
import type { Universe } from '@/lib/types'
import { useTutorial } from './tutorial'
import { useUniverse } from './universe'

interface PresentationStore {
  /** null = fora da apresentação. */
  state: PresentationState | null
  stops: Stop[]
  universe: Pick<Universe, 'repos'> | null
  /** Como a última apresentação terminou: pelo ✕/Esc/Explorar ('exit') ou porque o usuário assumiu ('interrupt'). */
  ended: 'exit' | 'interrupt' | null
  start: (universe: Pick<Universe, 'repos'>) => void
  restart: () => void
  next: () => void
  prev: () => void
  pause: () => void
  resume: () => void
  togglePause: () => void
  tick: (dt: number) => void
  arrived: () => void
  setHidden: (hidden: boolean) => void
  setHovering: (on: boolean) => void
  /** Sair pelo ✕, pelo Esc ou pelo "Explorar": volta à galáxia. */
  exit: () => void
  /** O usuário assumiu (clicou, arrastou a câmera, abriu o tutorial): encerra sem mexer na seleção. */
  interrupt: () => void
}

/** Ligado enquanto a própria apresentação mexe na seleção: aí a mudança não é do usuário. */
let selecting = false

function applySelection(selection: UniverseSelection): void {
  selecting = true
  try {
    if (selection.kind === 'none') useUniverse.getState().clearSelection()
    else useUniverse.getState().select(selection, { quiet: true })
  } finally {
    selecting = false
  }
}

export const usePresentation = create<PresentationStore>()((set, get) => {
  /** Aplica a ação e os efeitos dela: a seleção da parada nova e a fala do Octocat. */
  const dispatch = (action: PresentationAction) => {
    const { state: prev, stops, universe } = get()
    const state = presentationReducer(prev, action)
    if (state === prev) return
    set({ state })
    if (!state || !universe) return
    const stop = stops[state.index]
    const entered = prev === null || prev.index !== state.index || action.type === 'restart'
    if (entered) applySelection(stopSelection(stop))
    // Fala na chegada (o balão segue a nave até o alvo); o encerramento fala ao entrar.
    const spoke = stop.kind === 'outro' ? entered : state.arrived && prev !== null && !prev.arrived
    if (spoke) useUniverse.getState().say(stopLine(stop, universe))
  }

  return {
    state: null,
    stops: [],
    universe: null,
    ended: null,
    start: (universe) => {
      // Mutuamente exclusivos: a apresentação fecha o tutorial.
      if (useTutorial.getState().step !== null) useTutorial.getState().skip()
      const stops = buildStops(universe)
      set({ stops, universe, state: null, ended: null })
      dispatch({ type: 'start', count: stops.length })
    },
    restart: () => dispatch({ type: 'restart' }),
    next: () => dispatch({ type: 'next' }),
    prev: () => dispatch({ type: 'prev' }),
    pause: () => dispatch({ type: 'pause' }),
    resume: () => dispatch({ type: 'resume' }),
    togglePause: () => dispatch({ type: get().state?.paused ? 'resume' : 'pause' }),
    tick: (dt) => dispatch({ type: 'tick', dt }),
    arrived: () => dispatch({ type: 'arrived' }),
    setHidden: (hidden) => dispatch({ type: 'visibility', hidden }),
    setHovering: (on) => dispatch({ type: 'hover', on }),
    exit: () => {
      if (!get().state) return
      set({ state: null, ended: 'exit' })
      applySelection({ kind: 'none' })
    },
    interrupt: () => {
      if (get().state) set({ state: null, ended: 'interrupt' })
    },
  }
})

// A intenção do usuário vence: clicar num planeta, numa lua ou no sol durante a apresentação a encerra
// (a seleção do usuário fica, e o painel normal abre). Limpar a seleção não encerra, como no tutorial.
useUniverse.subscribe((state, prev) => {
  if (!selecting && state.selection !== prev.selection && state.selection.kind !== 'none') usePresentation.getState().interrupt()
})

/**
 * Clique no vazio do canvas: fora da apresentação, volta à galáxia; durante ela, não faz nada (um clique perdido
 * para focar a janela não derruba quem está assistindo). No modo de foco na nave também não: brincando, um toque que
 * erra a nave por pouco não pode jogar a câmera de volta (sai pelo "← Galáxia" ou pelo Esc).
 */
export function missCanvas(): void {
  if (usePresentation.getState().state || useUniverse.getState().selection.kind === 'ship') return
  useUniverse.getState().clearSelection()
}

// Abrir o tutorial encerra a apresentação (o tutorial já limpa a seleção ao começar).
useTutorial.subscribe((state, prev) => {
  if (state.step !== null && prev.step === null) usePresentation.getState().interrupt()
})
