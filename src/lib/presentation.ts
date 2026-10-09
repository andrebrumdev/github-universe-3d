import type { UniverseSelection } from './interaction'
import type { ShipTarget } from './ship/escort'
import { MAX_FRAME_DT } from './ship/motion'
import type { ShipMode } from './ship/shipMachine'
import type { Universe } from './types'

/** Quanto tempo (s) cada parada fica na tela depois que a nave chega. A viagem não conta. */
export const STOP_SECONDS = 9
/** Quantos repos a apresentação percorre, no máximo (os do topo do ranking). */
export const MAX_PRESENTED_REPOS = 10
/** Se a nave não chegar nesse tempo (s) — alvo que não virou planeta, por exemplo —, a parada começa mesmo assim. */
export const ARRIVAL_TIMEOUT = 12
/** Maior passo (s) por quadro do relógio da nave (ShipRig): a espera pela chegada conta no mesmo relógio. */
export const SHIP_MAX_DT = MAX_FRAME_DT

export type Stop = { kind: 'profile' } | { kind: 'repo'; name: string } | { kind: 'outro' }

/**
 * Perfil (sol), os repos do topo do ranking e o encerramento. `universe.repos` já vem ranqueado e limitado aos
 * planetas renderizados (MAX_PLANETS): todo repo dele é um planeta.
 */
export function buildStops(universe: Pick<Universe, 'repos'>): Stop[] {
  const repos = universe.repos.slice(0, MAX_PRESENTED_REPOS).map((r): Stop => ({ kind: 'repo', name: r.name }))
  return [{ kind: 'profile' }, ...repos, { kind: 'outro' }]
}

export interface PresentationState {
  /** Parada atual (índice em `buildStops`). */
  index: number
  /** Total de paradas; a última é o encerramento. */
  count: number
  /** Pausa do usuário (botão ⏸ / Espaço). */
  paused: boolean
  /** Aba escondida (`document.visibilityState`). */
  hidden: boolean
  /** Mouse sobre o cartão ou foco de teclado dentro dele. */
  hovering: boolean
  /** A nave já chegou à parada: só então o tempo dela corre. */
  arrived: boolean
  /** Tempo (s) já passado na parada, depois da chegada. */
  holdElapsed: number
}

export type PresentationAction =
  | { type: 'start'; count: number }
  | { type: 'restart' }
  | { type: 'tick'; dt: number }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'arrived' }
  | { type: 'visibility'; hidden: boolean }
  | { type: 'hover'; on: boolean }
  | { type: 'exit' }

/** O tempo da parada está segurado (pelo usuário, pela aba escondida ou pelo cartão em uso). */
export function isHeld(s: PresentationState): boolean {
  return s.paused || s.hidden || s.hovering
}

export function isOutro(s: PresentationState): boolean {
  return s.index === s.count - 1
}

const goTo = (s: PresentationState, index: number): PresentationState =>
  index === s.index || index < 0 || index >= s.count ? s : { ...s, index, arrived: false, holdElapsed: 0 }

/**
 * Máquina da apresentação. Devolve o mesmo objeto quando nada muda (o laço por frame não re-renderiza à toa).
 * `null` = fora da apresentação.
 */
export function presentationReducer(s: PresentationState | null, a: PresentationAction): PresentationState | null {
  if (a.type === 'start') {
    return { index: 0, count: a.count, paused: false, hidden: false, hovering: false, arrived: false, holdElapsed: 0 }
  }
  if (s === null || a.type === 'exit') return null
  switch (a.type) {
    case 'restart':
      return { ...s, index: 0, paused: false, arrived: false, holdElapsed: 0 }
    case 'next':
      return goTo(s, s.index + 1)
    case 'prev':
      return goTo(s, s.index - 1)
    case 'pause':
      return s.paused ? s : { ...s, paused: true }
    case 'resume':
      return s.paused ? { ...s, paused: false } : s
    case 'arrived':
      return s.arrived ? s : { ...s, arrived: true }
    case 'visibility':
      return s.hidden === a.hidden ? s : { ...s, hidden: a.hidden }
    case 'hover':
      return s.hovering === a.on ? s : { ...s, hovering: a.on }
    case 'tick': {
      // Em viagem nada muda (o mesmo objeto: ninguém re-renderiza); a espera pela nave fica no watchArrival.
      if (isOutro(s) || isHeld(s) || !s.arrived || a.dt <= 0) return s
      const holdElapsed = s.holdElapsed + a.dt
      return holdElapsed >= STOP_SECONDS ? goTo(s, s.index + 1) : { ...s, holdElapsed }
    }
  }
}

/** Espera pela chegada da nave na parada `index`, fora do estado do React (escrita no lugar, sem alocar). */
export interface ArrivalWatch {
  index: number
  waited: number
}

/**
 * Soma a espera na parada `index` (zera ao trocar de parada) e diz se já passou de ARRIVAL_TIMEOUT. Conta no relógio
 * da nave (passo de no máximo SHIP_MAX_DT): com poucos quadros por segundo, a viagem e a espera andam juntas.
 */
export function watchArrival(w: ArrivalWatch, index: number, dt: number): boolean {
  if (w.index !== index) {
    w.index = index
    w.waited = 0
  }
  w.waited += Math.min(dt, SHIP_MAX_DT)
  return w.waited >= ARRIVAL_TIMEOUT
}

export type AutostartDecision = 'wait' | 'start' | 'cancel'

/**
 * `?apresentacao`: começa quando a cena montou e a nave terminou a entrada (está na escolta). Se o usuário agiu antes
 * (selecionou algo, abriu o tutorial, já começou a apresentação ou mandou a nave voar), desiste.
 */
export function autostartDecision(o: { shipMode: ShipMode; selected: boolean; tutorialOpen: boolean; presenting: boolean }): AutostartDecision {
  if (o.selected || o.tutorialOpen || o.presenting) return 'cancel'
  if (o.shipMode === 'entering') return 'wait'
  return o.shipMode === 'escort' ? 'start' : 'cancel'
}

/** A seleção que a parada impõe: o painel some e a câmera e a nave seguem pelo caminho normal da seleção. */
export function stopSelection(stop: Stop): UniverseSelection {
  if (stop.kind === 'profile') return { kind: 'profile' }
  if (stop.kind === 'repo') return { kind: 'planet', name: stop.name }
  return { kind: 'none' }
}

export function stopTarget(stop: Stop): ShipTarget | null {
  if (stop.kind === 'profile') return { kind: 'sun' }
  if (stop.kind === 'repo') return { kind: 'planet', name: stop.name }
  return null
}

/** A nave está visitando o alvo desta parada (o encerramento não espera ninguém). */
export function shipAtStop(stop: Stop, mode: ShipMode, target: ShipTarget | null): boolean {
  const want = stopTarget(stop)
  if (!want) return true
  if (mode !== 'visiting' || !target || target.kind !== want.kind) return false
  return want.kind === 'sun' || (target.kind === 'planet' && target.name === want.name)
}

const MAX_SENTENCE = 90

/** A primeira frase do texto, cortada com reticências se passar de ~90 caracteres. */
export function firstSentence(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  // Fim de frase: . ! ? seguidos de espaço (não corta "v1.2" nem URLs).
  const match = /^.*?[.!?](?=\s|$)/.exec(clean)
  const sentence = match ? match[0] : clean
  return sentence.length <= MAX_SENTENCE ? sentence : `${sentence.slice(0, MAX_SENTENCE - 1).trimEnd()}…`
}

/** Fala do Octocat em cada parada. `{name}` vira o primeiro nome do perfil (formatLine, no balão). */
export function stopLine(stop: Stop, universe: Pick<Universe, 'repos'>): string {
  if (stop.kind === 'profile') return 'Esse é o perfil de {name}!'
  if (stop.kind === 'outro') return 'Até a próxima!'
  const repo = universe.repos.find((r) => r.name === stop.name)
  const about = repo?.description || repo?.readme
  return about ? `${stop.name}: ${firstSentence(about)}` : `Olha só o ${stop.name}!`
}

/** `?apresentacao` na URL abre a apresentação depois de carregar (para compartilhar o link). */
export function presentationRequested(search: string): boolean {
  return new URLSearchParams(search).has('apresentacao')
}
