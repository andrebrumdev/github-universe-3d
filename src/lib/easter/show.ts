/**
 * Pegou o botão "Não clique aqui": o show do Octocat. Máquina pura (chamar a nave → ela chega ao palco → o show →
 * acabou), as deixas no tempo do show e a regra de quando o botão aparece. Imports relativos.
 *
 * O palco é o modo de foco na nave (lib/ship/focus): ela estaciona no meio da tela e a câmera vai até ela. Quem
 * dirige (ShowDriver) seleciona a nave ao entrar em `arriving` e a solta quando o show acaba.
 */

/** idle (botão na tela); calling (pegou: esperando a nave parar); arriving (indo para o palco); performing. */
export type ShowPhase = 'idle' | 'calling' | 'arriving' | 'performing'

export interface ShowState {
  phase: ShowPhase
  /** s na fase atual. */
  elapsed: number
  /** Shows terminados (o botão foge mais e melhor a cada um). */
  round: number
  /** A nave foi para o palco por causa do show (no fim, ela é solta). */
  staged: boolean
}

export const SHOW_IDLE: ShowState = { phase: 'idle', elapsed: 0, round: 0, staged: false }

/** Quanto o show dura depois de começar (s). */
export const SHOW_SECONDS = 7.5
/** A nave desliza para o palco: o show espera isto depois que ela entrou no modo de foco (s). */
export const SHOW_ARRIVE_SECONDS = 1.4
/** Nave ocupada (voando, voltando) por mais que isto (s): o show acontece onde ela estiver. */
export const SHOW_CALL_TIMEOUT = 5
/** Ao chegar, a seleção da nave entra no quadro seguinte: só depois disto sem ela conta como "saiu do palco" (s). */
const STAGE_GRACE = 0.5
/** Chegando há mais que isto sem entrar no modo de foco (s): faz o show assim mesmo. */
const ARRIVE_TIMEOUT = 6

export interface ShowTick {
  type: 'tick'
  dt: number
  reduced: boolean
  /** Modo da nave (shipPose.mode). */
  shipMode: string
  /** A seleção é a nave (modo de foco pedido). */
  focused: boolean
}

export type ShowAction = { type: 'catch' } | ShowTick | { type: 'interrupt' }

const end = (s: ShowState): ShowState => ({ ...SHOW_IDLE, round: s.round + 1 })

export function showReducer(s: ShowState, a: ShowAction): ShowState {
  if (a.type === 'catch') return s.phase === 'idle' ? { ...s, phase: 'calling', elapsed: 0, staged: false } : s
  if (a.type === 'interrupt') return s.phase === 'idle' ? s : end(s)
  if (s.phase === 'idle') return s
  const elapsed = s.elapsed + Math.max(0, a.dt)
  switch (s.phase) {
    case 'calling':
      // sem movimento, nada de voo: o show (rosto e falas) começa na hora
      if (a.reduced) return { ...s, phase: 'performing', elapsed: 0, staged: false }
      // só parada (escolta ou visita) a nave entra no modo de foco
      if (a.shipMode === 'escort' || a.shipMode === 'visiting') return { ...s, phase: 'arriving', elapsed: 0, staged: true }
      if (elapsed > SHOW_CALL_TIMEOUT) return { ...s, phase: 'performing', elapsed: 0, staged: false }
      return { ...s, elapsed }
    case 'arriving':
      if (!a.focused && elapsed > STAGE_GRACE) return end(s)
      if ((a.shipMode === 'focus' && elapsed >= SHOW_ARRIVE_SECONDS) || elapsed > ARRIVE_TIMEOUT) return { ...s, phase: 'performing', elapsed: 0 }
      return { ...s, elapsed }
    case 'performing':
      // saiu do palco (Esc, "← Galáxia", clicou num planeta): acabou
      if (s.staged && !a.focused) return end(s)
      return elapsed >= SHOW_SECONDS ? end(s) : { ...s, elapsed }
  }
}

export type ShowCue = 'line-1' | 'roll' | 'burst' | 'hop' | 'confetti' | 'wave' | 'line-2'

/** Roteiro (s desde o começo do show). As falas valem também com movimento reduzido. */
const SCRIPT: readonly { at: number; cue: ShowCue }[] = [
  { at: 0, cue: 'line-1' },
  { at: 0.6, cue: 'roll' },
  { at: 0.6, cue: 'burst' },
  { at: 1.7, cue: 'roll' },
  { at: 1.7, cue: 'burst' },
  { at: 2.7, cue: 'hop' },
  { at: 2.9, cue: 'confetti' },
  { at: 3.2, cue: 'hop' },
  { at: 3.6, cue: 'wave' },
  { at: 4.4, cue: 'line-2' },
]

/** As deixas entre dois instantes do show (`from` exclusivo, `to` inclusivo). Reduzido: só as falas. */
export function showCuesBetween(from: number, to: number, reduced: boolean): ShowCue[] {
  const out: ShowCue[] = []
  for (const { at, cue } of SCRIPT) {
    if (at > from && at <= to && (!reduced || cue === 'line-1' || cue === 'line-2')) out.push(cue)
  }
  return out
}

/**
 * O botão aparece só com a tela livre: some com os botões flutuantes (painel aberto, modo de foco), no tutorial, na
 * apresentação, na trombada e durante o show.
 */
export function noClickVisible(o: { floatingHidden: boolean; tutorial: boolean; presentation: boolean; crash: boolean; showing: boolean }): boolean {
  return !o.floatingHidden && !o.tutorial && !o.presentation && !o.crash && !o.showing
}
