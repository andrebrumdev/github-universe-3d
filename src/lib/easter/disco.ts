/**
 * Modo disco (Konami Code): linha do tempo, nível de intensidade, regras de exclusão e a dancinha do Octocat. Puro,
 * imports relativos. Enquanto `discoReversed`, o relógio da simulação vira ao contrário (lib/universe/clock); o nível
 * acende o sol-globo, os fachos e a chuva de estrelas e os apaga suave no fim.
 */
import { BARREL_ROLL_SECONDS, barrelRollAngle } from '../ship/play'

/** Quanto dura a festa (s), quanto leva para acender e para apagar. */
export const DISCO_SECONDS = 20
export const DISCO_FADE_IN = 1.5
export const DISCO_FADE_OUT = 2

/** off; queued (pedido com o tutorial, a apresentação ou a trombada na tela); on; fading (apagando). */
export type DiscoPhase = 'off' | 'queued' | 'on' | 'fading'

export interface DiscoState {
  phase: DiscoPhase
  /** s na fase atual (em `on`, desde que acendeu). */
  elapsed: number
  /** Nível quando começou a apagar (o apagar parte dele). */
  from: number
  /** Sobe a cada vez que acende: quem fala ou dança nota a festa nova. */
  seq: number
}

export const DISCO_OFF: DiscoState = { phase: 'off', elapsed: 0, from: 0, seq: 0 }

export type DiscoAction = { type: 'code'; blocked: boolean } | { type: 'tick'; dt: number; blocked: boolean }

const smoothstep = (u: number) => {
  const x = Math.min(1, Math.max(0, u))
  return x * x * (3 - 2 * x)
}

/** Intensidade de 0 a 1: acende em DISCO_FADE_IN, fica, e apaga em DISCO_FADE_OUT a partir de onde estava. */
export function discoLevel(s: DiscoState): number {
  if (s.phase === 'on') return smoothstep(s.elapsed / DISCO_FADE_IN)
  if (s.phase === 'fading') return s.from * (1 - smoothstep(s.elapsed / DISCO_FADE_OUT))
  return 0
}

/** As órbitas andam ao contrário só com a festa acesa; apagando, o relógio já vira de volta. */
export function discoReversed(s: DiscoState): boolean {
  return s.phase === 'on'
}

/** Liga do zero ou continuando de um nível (religar enquanto apaga não dá salto). */
function light(s: DiscoState, level = 0): DiscoState {
  // o `elapsed` em que a subida passa por `level` (inverte o smoothstep por bissecção: só no clique)
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (smoothstep(mid) < level) lo = mid
    else hi = mid
  }
  return { phase: 'on', elapsed: level > 0 ? hi * DISCO_FADE_IN : 0, from: 0, seq: s.seq + 1 }
}

const fade = (s: DiscoState): DiscoState => ({ phase: 'fading', elapsed: 0, from: discoLevel(s), seq: s.seq })

/**
 * O código (de novo) e o passar do tempo. O código liga (ou entra na fila, se algo bloqueia), apaga a festa acesa,
 * religa a que está apagando e desiste da que está na fila. A fila liga quando libera; algo que bloqueia no meio
 * da festa a apaga.
 */
export function discoReducer(s: DiscoState, a: DiscoAction): DiscoState {
  if (a.type === 'code') {
    switch (s.phase) {
      case 'off':
        return a.blocked ? { ...s, phase: 'queued', elapsed: 0 } : light(s)
      case 'queued':
        return { ...s, phase: 'off', elapsed: 0 }
      case 'on':
        return fade(s)
      case 'fading':
        return a.blocked ? s : light(s, discoLevel(s))
    }
  }
  const dt = Math.max(0, a.dt)
  switch (s.phase) {
    case 'off':
      return s
    case 'queued':
      return a.blocked ? s : light(s)
    case 'on': {
      if (a.blocked) return fade(s)
      const next = { ...s, elapsed: s.elapsed + dt }
      return next.elapsed >= DISCO_SECONDS ? fade(next) : next
    }
    case 'fading': {
      const elapsed = s.elapsed + dt
      return elapsed >= DISCO_FADE_OUT ? { ...DISCO_OFF, seq: s.seq } : { ...s, elapsed }
    }
  }
}

/** O disco não começa (fica na fila) com o tutorial aberto, a apresentação rodando ou a trombada na tela. */
export function discoBlocked(o: { tutorial: boolean; presentation: boolean; crash: boolean }): boolean {
  return o.tutorial || o.presentation || o.crash
}

/** Dancinha: quique (unidades do modelo da nave), balanço e o parafuso (rad), no grupo de dentro da nave. */
export interface Dance {
  bob: number
  sway: number
  roll: number
}

const BOB = 0.16
const BOB_HZ = 1.6
const SWAY = 0.2
const SWAY_HZ = 0.8
/** O parafuso começa logo depois de acender. */
const ROLL_AT = 0.5

/**
 * A dança `elapsed` s depois de acender, com o nível da festa: quica no ritmo, balança de um lado para o outro e dá um
 * parafuso inteiro no começo. Parada com movimento reduzido. Escreve em `out`.
 */
export function discoDance(elapsed: number, level: number, reduced: boolean, out: Dance): Dance {
  if (reduced || level <= 0) {
    out.bob = 0
    out.sway = 0
    out.roll = 0
    return out
  }
  out.bob = BOB * level * Math.abs(Math.sin(Math.PI * BOB_HZ * elapsed))
  out.sway = SWAY * level * Math.sin(2 * Math.PI * SWAY_HZ * elapsed)
  const t = elapsed - ROLL_AT
  out.roll = t > 0 && t <= BARREL_ROLL_SECONDS ? barrelRollAngle(t) : 0
  return out
}
