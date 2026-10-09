/**
 * Linha do tempo da trombada, em segundos desde o impacto (a nave chegou à distância mínima da lente):
 * clarão (60 ms), tela tremendo (~300 ms), vidro trincado que se conserta sozinho, estrelinhas girando em volta da
 * cabeça do Octocat e, depois que elas somem, a fala.
 */
import type { ShipMode } from '../ship/shipMachine'

/** Clarão branco: um só, curto e fraco (bem abaixo de qualquer limite de flash: 1 por trombada). */
export const FLASH_SECONDS = 0.06
export const FLASH_PEAK = 0.35

/** Opacidade do clarão: começa no pico e apaga em linha reta em FLASH_SECONDS. */
export function crashFlash(t: number): number {
  if (!(t >= 0 && t < FLASH_SECONDS)) return 0
  return FLASH_PEAK * (1 - t / FLASH_SECONDS)
}

/** Tela tremendo: duração (s), amplitude inicial (px) e constante de tempo da queda exponencial (s). */
export const SHAKE_SECONDS = 0.3
export const SHAKE_AMPLITUDE = 8
const SHAKE_DECAY = 0.07
/** Frequências (Hz) incomensuráveis em x e y: o tremor não vira um círculo nem uma linha. */
const SHAKE_FX = 31
const SHAKE_FY = 23

/** Deslocamento (px) da tela tremendo; zero fora da janela. Escreve em `out` (sem alocar no laço por quadro). */
export function crashShake(t: number, out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
  if (!(t >= 0 && t < SHAKE_SECONDS)) {
    out.x = 0
    out.y = 0
    return out
  }
  const a = SHAKE_AMPLITUDE * Math.exp(-t / SHAKE_DECAY)
  out.x = a * Math.cos(2 * Math.PI * SHAKE_FX * t)
  out.y = a * Math.sin(2 * Math.PI * SHAKE_FY * t + 0.7)
  return out
}

/** Vidro: trincado inteiro até HEAL_START, conserta-se até HEAL_END (e a camada sai). */
export const HEAL_START = 0.45
export const HEAL_END = 2.3

const smoothstep = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return u * u * (3 - 2 * u)
}

/** Quanto do vidro já se consertou (0..1). */
export function crackHeal(t: number): number {
  return smoothstep(HEAL_START, HEAL_END, t)
}

/** Estrelinhas: giram DAZED_SPIN s e somem em DAZED_FADE s; voltas por segundo. */
export const DAZED_SPIN = 2.5
export const DAZED_FADE = 0.5
const DAZED_TURNS_PER_SECOND = 0.9

export interface StarsView {
  opacity: number
  angle: number
}

/** Opacidade e giro (rad) das estrelinhas. Escreve em `out` (sem alocar no laço por quadro). */
export function dazedStars(t: number, out: StarsView = { opacity: 0, angle: 0 }): StarsView {
  out.opacity = t < 0 ? 0 : 1 - smoothstep(DAZED_SPIN, DAZED_SPIN + DAZED_FADE, t)
  out.angle = 2 * Math.PI * DAZED_TURNS_PER_SECOND * Math.max(0, t)
  return out
}

/** A fala ("Opa, foi mal…") sai quando as estrelas já sumiram; até lá, o rosto fica tonto. */
export const CRASH_LINE_AT = DAZED_SPIN + DAZED_FADE

// ─── Máquina da trombada ─────────────────────────────────────────────────────────────────────────────────────────

/** Interrompida (outra viagem, seleção, tutorial, apresentação): as estrelas somem e o vidro termina de curar nisto (s). */
export const CANCEL_STARS_FADE = 0.2
export const CANCEL_HEAL = 0.3

/**
 * Estado da trombada, mutável de propósito (avança a cada quadro sem alocar): a nave escreve (impacto, tick,
 * cancelamento), a camada do vidro e as estrelinhas leem. Parada: `since` = −1.
 */
export interface CrashTimeline {
  /** Segundos de cena desde o impacto (o passo da simulação da nave); −1 sem trombada. */
  since: number
  /** `since` na hora do cancelamento; −1 se não foi cancelada. */
  cancelledAt: number
  /** A fala já saiu (ou foi pulada pelo cancelamento). */
  spoken: boolean
}

export function newCrashTimeline(): CrashTimeline {
  return { since: -1, cancelledAt: -1, spoken: false }
}

/** Impacto: começa do zero (mesmo no meio de outra). */
export function crashImpact(tl: CrashTimeline): void {
  tl.since = 0
  tl.cancelledAt = -1
  tl.spoken = false
}

/** Interrupção: o rosto volta ao normal na hora, as estrelas somem, a fala é pulada e o vidro termina de curar rápido. */
export function crashCancel(tl: CrashTimeline): void {
  if (tl.since < 0 || tl.cancelledAt >= 0) return
  tl.cancelledAt = tl.since
  tl.spoken = true
}

/** Para tudo na hora (a nave desmontou). */
export function crashReset(tl: CrashTimeline): void {
  tl.since = -1
  tl.cancelledAt = -1
  tl.spoken = false
}

const cancelProgress = (tl: CrashTimeline, span: number) => Math.min(1, (tl.since - tl.cancelledAt) / span)

/**
 * Avança `dt` s. Devolve true uma única vez por trombada: na hora da fala (as estrelas sumiram), se não foi cancelada.
 * Terminada (a fala saiu, ou o cancelamento acabou de apagar tudo), volta a parar.
 */
export function crashTick(tl: CrashTimeline, dt: number): boolean {
  if (tl.since < 0) return false
  tl.since += dt
  if (tl.cancelledAt >= 0) {
    if (tl.since - tl.cancelledAt >= Math.max(CANCEL_STARS_FADE, CANCEL_HEAL)) crashReset(tl)
    return false
  }
  if (!tl.spoken && tl.since >= CRASH_LINE_AT) {
    crashReset(tl)
    return true
  }
  return false
}

/** Quanto do vidro já se consertou (0..1; 1 sem trombada). Cancelada, vai do ponto em que estava a 1 em CANCEL_HEAL. */
export function crashHealAt(tl: CrashTimeline): number {
  if (tl.since < 0) return 1
  if (tl.cancelledAt < 0) return crackHeal(tl.since)
  const from = crackHeal(tl.cancelledAt)
  const u = cancelProgress(tl, CANCEL_HEAL)
  return u >= 1 ? 1 : from + (1 - from) * u * u * (3 - 2 * u)
}

/** A camada do vidro fica montada enquanto houver o que curar. */
export function crashOverlayOn(tl: CrashTimeline): boolean {
  return tl.since >= 0 && crashHealAt(tl) < 1
}

/** Clarão (nunca depois de cancelada). */
export function crashFlashAt(tl: CrashTimeline): number {
  return tl.cancelledAt >= 0 ? 0 : crashFlash(tl.since)
}

/** Tremor da tela (px; para na hora no cancelamento). */
export function crashShakeAt(tl: CrashTimeline, out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
  return crashShake(tl.cancelledAt >= 0 ? -1 : tl.since, out)
}

/** Estrelinhas: as da linha do tempo; canceladas, somem em CANCEL_STARS_FADE a partir de onde estavam. */
export function crashStarsAt(tl: CrashTimeline, out: StarsView = { opacity: 0, angle: 0 }): StarsView {
  dazedStars(tl.since, out)
  if (tl.cancelledAt >= 0) {
    const from = dazedStars(tl.cancelledAt).opacity
    out.opacity = from * (1 - cancelProgress(tl, CANCEL_STARS_FADE))
  }
  return out
}

/** Rosto tonto (olhos em espiral): do impacto até a fala; cancelada, volta ao normal na hora. */
export function crashDizzy(tl: CrashTimeline): boolean {
  return tl.since >= 0 && tl.cancelledAt < 0 && tl.since < CRASH_LINE_AT
}

export interface CrashSituation {
  /** Modo da nave (ver shipMachine; o modo de foco também interrompe). */
  mode: ShipMode
  /** Algo selecionado (planeta, lua, perfil). */
  selection: boolean
  tutorial: boolean
  presentation: boolean
}

/** A trombada é interrompida: seleção, tutorial, apresentação, ou a nave fora da volta/escolta (outra viagem). */
export function crashInterrupted({ mode, selection, tutorial, presentation }: CrashSituation): boolean {
  return selection || tutorial || presentation || (mode !== 'returning' && mode !== 'escort')
}
