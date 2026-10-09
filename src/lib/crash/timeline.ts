/**
 * Linha do tempo da trombada, em segundos desde o impacto (a nave chegou à distância mínima da lente):
 * clarão (60 ms), tela tremendo (~300 ms), vidro trincado que se conserta sozinho, estrelinhas girando em volta da
 * cabeça do Octocat e, depois que elas somem, a fala.
 */

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

export function dazedStars(t: number): { opacity: number; angle: number } {
  const opacity = t < 0 ? 0 : 1 - smoothstep(DAZED_SPIN, DAZED_SPIN + DAZED_FADE, t)
  return { opacity, angle: 2 * Math.PI * DAZED_TURNS_PER_SECOND * Math.max(0, t) }
}

/** A fala ("Opa, foi mal…") sai quando as estrelas já sumiram; até lá, o rosto fica tonto. */
export const CRASH_LINE_AT = DAZED_SPIN + DAZED_FADE
