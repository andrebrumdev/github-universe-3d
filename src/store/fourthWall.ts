import { create } from 'zustand'
import { direct, newScriptState, noteLine, type Cue, type Directive, type ScriptContext } from '@/lib/octocat/script'
import { usePanelReadyKey } from './panelReady'
import { shipPose } from './shipPose'
import { usePresentation } from './presentation'
import { useTutorial } from './tutorial'
import { useUniverse } from './universe'

/** Chave do visitante já avisado (o recrutador ouve a piada uma vez, nesta e nas próximas visitas). */
export const RECRUITER_SEEN_KEY = 'gu3d:recruiter-seen'
/** Chave da primeira visita (o palpite do recrutador por tempo na página só vale nela). */
export const VISITED_KEY = 'gu3d:visited'

/** localStorage pode faltar ou lançar (aba anônima, dados bloqueados): sem ele, vale só a sessão. */
export function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

export function writeFlag(key: string): void {
  try {
    window.localStorage.setItem(key, '1')
  } catch {
    // sem armazenamento: a vez única fica só nesta sessão (o diretor já lembra)
  }
}

let firstVisit: boolean | null = null

/** Primeira visita deste navegador? Lido e marcado uma vez por página (o StrictMode roda os efeitos duas vezes). */
export function isFirstVisit(): boolean {
  if (firstVisit === null) {
    firstVisit = !readFlag(VISITED_KEY)
    writeFlag(VISITED_KEY)
  }
  return firstVisit
}

/**
 * O que a nave lê do roteiro da quarta parede (lib/octocat/script): a soneca (encostada na borda, bocejando), o susto da
 * janela apertada e a tontura do zoom. Os contadores sobem a cada reação (quem desenha nota a mudança); `motion` é
 * falso com movimento reduzido (só a expressão muda).
 */
interface FourthWallState {
  sleep: { on: boolean; motion: boolean }
  /** `at`: performance.now() do último susto (o sol se assusta junto por BRACE_SUN_MS). */
  brace: { seq: number; motion: boolean; at: number }
  dizzy: { seq: number; motion: boolean }
}

export const useFourthWall = create<FourthWallState>()(() => ({
  sleep: { on: false, motion: true },
  brace: { seq: 0, motion: true, at: -Infinity },
  dizzy: { seq: 0, motion: true },
}))

/** Um diretor por página (a sessão). */
const script = newScriptState()

// Toda fala nova no balão (do guia, da apresentação, do roteiro) conta para o intervalo das espontâneas.
// O balão sumiu: a fala de repo guardada sai já, sem esperar o próximo tick.
useUniverse.subscribe((state, prev) => {
  if (state.bubble && state.bubble !== prev.bubble) noteLine(script, performance.now())
  else if (!state.bubble && prev.bubble && script.pendingRepo) cue({ type: 'tick' })
})

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

function context(): ScriptContext {
  const { bubble, selection } = useUniverse.getState()
  return {
    now: performance.now(),
    busy: useTutorial.getState().step !== null || usePresentation.getState().state !== null,
    bubble: bubble !== null,
    parked: shipPose.mode === 'escort' && selection.kind === 'none',
    reduced: prefersReducedMotion(),
    panelKey: usePanelReadyKey.getState().key,
  }
}

function apply(d: Directive): void {
  const universe = useUniverse.getState()
  if (d.line) universe.say(d.line.text, d.line.expression)
  if (d.guide) universe.emitGuide(d.guide)
  if (d.remember === 'recruiter') writeFlag(RECRUITER_SEEN_KEY)
  const { brace, dizzy } = useFourthWall.getState()
  switch (d.action) {
    case 'sleep':
      useFourthWall.setState({ sleep: { on: true, motion: d.motion } })
      break
    case 'wake':
      useFourthWall.setState({ sleep: { on: false, motion: d.motion } })
      break
    case 'brace':
      // o susto acorda
      useFourthWall.setState({ brace: { seq: brace.seq + 1, motion: d.motion, at: performance.now() }, sleep: { on: false, motion: d.motion } })
      break
    case 'dizzy':
      useFourthWall.setState({ dizzy: { seq: dizzy.seq + 1, motion: d.motion } })
      break
  }
}

/** Manda um evento medido para o diretor e aplica a decisão (fala no balão, reação da nave). */
export function cue(c: Cue): void {
  const d = direct(script, c, context())
  if (d) apply(d)
}

/** Quanto tempo (ms) o sol fica assustado com o susto da janela apertada. */
export const BRACE_SUN_MS = 1300

/** O sinal do roteiro para o humor do sol (lib/sun/mood, `MoodContext.octocat`): susto da janela ou cochilo na borda. */
export function octocatMood(now: number = performance.now()): 'none' | 'lean' | 'brace' {
  const { sleep, brace } = useFourthWall.getState()
  if (now - brace.at < BRACE_SUN_MS) return 'brace'
  return sleep.on ? 'lean' : 'none'
}
