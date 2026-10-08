import { create } from 'zustand'
import { tutorialReducer, type TutorialStep } from '@/lib/tutorial'
import { useUniverse } from './universe'

interface TutorialState {
  step: TutorialStep | null
  start: () => void
  next: () => void
  skip: () => void
}

export const useTutorial = create<TutorialState>()((set, get) => ({
  step: null,
  start: () => {
    useUniverse.getState().clearSelection()
    set({ step: tutorialReducer(get().step, 'start') })
  },
  next: () => set({ step: tutorialReducer(get().step, 'next') }),
  skip: () => set({ step: tutorialReducer(get().step, 'skip') }),
}))

// A intenção do usuário vence: clicar num planeta ou no sol durante um passo guiado
// encerra o tutorial, e a câmera voa para a seleção (CameraRig).
useUniverse.subscribe((state, prev) => {
  const { step, skip } = useTutorial.getState()
  if (step !== null && step !== 'free' && state.selection !== prev.selection && state.selection.kind !== 'none') skip()
})
