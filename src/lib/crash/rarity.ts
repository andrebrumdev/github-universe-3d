/**
 * Trombada na tela (easter egg): de vez em quando, voltando de um planeta ou do sol, a nave vem rápido demais e bate no
 * vidro. Tem de ser rara — se acontece sempre, perde a graça; de vez em quando, vira um "pera, o que foi isso?".
 */
import type { ShipTarget } from '../ship/escort'

/** Chance de base de uma volta elegível virar trombada (na velocidade de referência). */
export const CRASH_CHANCE = 0.12
/**
 * Embalo: quanto mais rápido a nave vem voltando, mais fácil passar do ponto e bater na tela. A chance é
 * CRASH_CHANCE × (v / REFERENCE_SPEED)^MOMENTUM_EXPONENT, com o fator entre MIN e MAX e a chance final com teto.
 * REFERENCE_SPEED (unidades/s) é a mediana da maior velocidade das voltas planejadas (ver momentum.test.ts).
 */
export const REFERENCE_SPEED = 16.5
export const MOMENTUM_EXPONENT = 1.5
export const MIN_MOMENTUM_FACTOR = 0.5
export const MAX_MOMENTUM_FACTOR = 3
/** Teto da chance: mesmo no maior embalo, continua surpresa. */
export const MAX_CRASH_CHANCE = 0.35
/** Voltas normais obrigatórias depois de uma trombada (nunca duas seguidas). */
export const CRASH_COOLDOWN = 4

export interface CrashHistory {
  /** Voltas já feitas nesta sessão. */
  returns: number
  /** Voltas normais desde a última trombada (Infinity: nenhuma ainda). */
  sinceCrash: number
}

export const INITIAL_CRASH_HISTORY: Readonly<CrashHistory> = { returns: 0, sinceCrash: Infinity }

/** `force`: `?crash` (só em desenvolvimento); `never`: `?nocrash` (testes e2e). */
export type CrashOverride = 'force' | 'never' | null

export interface CrashContext {
  /** De onde a nave volta (planeta ou sol); null se não é uma volta de um alvo. */
  from: ShipTarget | null
  tutorial: boolean
  presentation: boolean
  reducedMotion: boolean
  /** Volta saindo do modo de foco da nave (estacionada para brincar): nunca bate. */
  fromFocus?: boolean
  /** Embalo da volta: a maior velocidade dela (unidades/s, ver `returnMomentum`); sem ele, a chance de base. */
  momentum?: number
  override?: CrashOverride
}

/** Multiplicador da chance pelo embalo, entre MIN_MOMENTUM_FACTOR e MAX_MOMENTUM_FACTOR. */
export function momentumFactor(speed: number): number {
  const f = Math.max(0, speed / REFERENCE_SPEED) ** MOMENTUM_EXPONENT
  return Math.min(MAX_MOMENTUM_FACTOR, Math.max(MIN_MOMENTUM_FACTOR, Number.isNaN(f) ? 1 : f))
}

/** Chance da trombada para uma volta com este embalo (sem embalo: a de base), com teto. */
export function crashChance(speed: number | undefined): number {
  if (speed === undefined) return CRASH_CHANCE
  return Math.min(MAX_CRASH_CHANCE, CRASH_CHANCE * momentumFactor(speed))
}

/**
 * Esta volta vira trombada? Nunca no tutorial, na apresentação, com movimento reduzido, saindo do modo de foco nem
 * fora da volta de um alvo; nunca na primeira volta da sessão (a pessoa vê uma volta normal antes) nem antes de
 * CRASH_COOLDOWN voltas normais depois da última. Fora disso, sorteia com `rng` (Math.random no app) contra a chance
 * do embalo (`crashChance`). `?crash` pula a raridade, não as exclusões.
 * Só consome o gerador quando sorteia de fato.
 */
export function shouldCrash(rng: () => number, history: CrashHistory, context: CrashContext): boolean {
  const { from, tutorial, presentation, reducedMotion, fromFocus = false, momentum, override = null } = context
  if (!from || tutorial || presentation || reducedMotion || fromFocus || override === 'never') return false
  if (override === 'force') return true
  if (history.returns === 0 || history.sinceCrash < CRASH_COOLDOWN) return false
  return rng() < crashChance(momentum)
}

/** Histórico depois de uma volta (normal ou trombada). */
export function recordReturn(history: CrashHistory, crashed: boolean): CrashHistory {
  return { returns: history.returns + 1, sinceCrash: crashed ? 0 : history.sinceCrash + 1 }
}

/** Lê `?crash` / `?nocrash` da URL. `?crash` só vale em desenvolvimento (`dev`: import.meta.env.DEV). */
export function crashOverride(search: string, dev: boolean): CrashOverride {
  const params = new URLSearchParams(search)
  if (params.has('nocrash')) return 'never'
  if (dev && params.has('crash')) return 'force'
  return null
}
