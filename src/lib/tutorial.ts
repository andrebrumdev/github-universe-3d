export const TUTORIAL_STEPS = ['welcome', 'repos', 'tech', 'free'] as const
export type TutorialStep = (typeof TUTORIAL_STEPS)[number]
export type TutorialAction = 'start' | 'next' | 'skip'

export function tutorialReducer(step: TutorialStep | null, action: TutorialAction): TutorialStep | null {
  if (action === 'start') return 'welcome'
  if (action === 'skip' || step === null) return null
  return TUTORIAL_STEPS[TUTORIAL_STEPS.indexOf(step) + 1] ?? null
}

/** `{name}` vira o primeiro nome do perfil (formatLine). */
export const TUTORIAL_COPY: Record<TutorialStep, string> = {
  welcome: 'Bem-vindo ao universo GitHub de {name}! O sol no centro é o perfil: clique nele quando quiser.',
  repos: 'Cada planeta é um repositório. Quanto maior o planeta, mais stars e forks ele tem.',
  tech: 'As luas são as linguagens do repo, com a marca e a cor de cada uma. Os quadradinhos verdes são os commits de cada dia.',
  free: 'Agora é com você: arraste para girar, role para aproximar e clique em tudo. Se precisar, é só me chamar!',
}

export function tutorialFocusesPlanet(step: TutorialStep | null): boolean {
  return step === 'tech'
}
