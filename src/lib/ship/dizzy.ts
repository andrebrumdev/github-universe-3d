/**
 * Tonto de tanto girar (modo de foco): um medidor que integra a velocidade do giro (|ω|·t, em rad) e vaza de volta
 * para zero (decaimento exponencial, exato para qualquer passo). Passou do limite, o Octocat fica tonto pelo tempo das
 * estrelinhas da trombada (as mesmas, ver crash/timeline), balança a cabeça e volta ao normal; depois, uma folga antes
 * de poder ficar tonto de novo. Com movimento reduzido, nunca. Mutável no lugar. Puro, imports relativos.
 */
import { DAZED_FADE, DAZED_SPIN } from '../crash/timeline'

/** Limite do medidor (rad): ~3,5 voltas, que só se juntam girando rápido por uns segundos (o vazamento come o resto). */
export const DIZZY_THRESHOLD = 3.5 * 2 * Math.PI
/** Vazamento do medidor (1/s): a 2 rad/s ele para em 5 rad, longe do limite; a 14 rad/s, passa em ~2,5 s. */
export const DIZZY_LEAK = 0.4
/** Tonto pelo tempo das estrelinhas (girando e sumindo), como depois da trombada. */
export const DIZZY_SECONDS = DAZED_SPIN + DAZED_FADE
/** Balançada de cabeça ao voltar a si. */
export const HEAD_SHAKE_SECONDS = 0.6
/** Folga depois de voltar ao normal: o medidor fica zerado. */
export const DIZZY_COOLDOWN = 2

export type DizzyState = 'ok' | 'dizzy' | 'recovering'
export type DizzyEvent = 'dizzy' | 'recovering' | 'recovered'

export interface Dizziness {
  /** Medidor (rad). */
  level: number
  state: DizzyState
  /** s no estado atual (tonto ou balançando a cabeça). */
  timer: number
  /** s desde que ficou tonto (−1 fora disso): as estrelinhas e o bambeio leem daqui. */
  since: number
  /** s de folga que ainda faltam depois de voltar ao normal. */
  cooldown: number
}

export function newDizziness(): Dizziness {
  return { level: 0, state: 'ok', timer: 0, since: -1, cooldown: 0 }
}

/** Esquece tudo (saiu do modo de foco). */
export function resetDizziness(d: Dizziness): Dizziness {
  return Object.assign(d, newDizziness())
}

/** Avança `dt` s com o giro a `speed` rad/s. Devolve a transição do quadro, se houve. */
export function stepDizziness(d: Dizziness, speed: number, dt: number, reduced: boolean): DizzyEvent | null {
  if (reduced) {
    resetDizziness(d)
    return null
  }
  if (dt <= 0) return null
  if (d.state === 'dizzy') {
    d.timer += dt
    d.since += dt
    if (d.timer < DIZZY_SECONDS) return null
    d.state = 'recovering'
    d.timer = 0
    return 'recovering'
  }
  if (d.state === 'recovering') {
    d.timer += dt
    d.since += dt
    if (d.timer < HEAD_SHAKE_SECONDS) return null
    Object.assign(d, newDizziness(), { cooldown: DIZZY_COOLDOWN })
    return 'recovered'
  }
  if (d.cooldown > 0) {
    d.cooldown = Math.max(0, d.cooldown - dt)
    return null
  }
  const e = Math.exp(-DIZZY_LEAK * dt)
  d.level = d.level * e + (Math.abs(speed) * (1 - e)) / DIZZY_LEAK
  if (d.level < 1e-4) d.level = 0
  if (d.level < DIZZY_THRESHOLD) return null
  d.state = 'dizzy'
  d.level = 0
  d.timer = 0
  d.since = 0
  return 'dizzy'
}

/** Balançada de cabeça ao voltar a si (rad em volta do eixo vertical do piloto): três vaivéns que morrem; 0 fora dela. */
export function headShakeAngle(t: number): number {
  if (!(t > 0 && t < HEAD_SHAKE_SECONDS)) return 0
  const u = t / HEAD_SHAKE_SECONDS
  return 0.4 * Math.sin(2 * Math.PI * 3 * u) * (1 - u) ** 2
}
