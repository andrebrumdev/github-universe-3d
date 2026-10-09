/**
 * Trombada na tela (easter egg): de vez em quando, voltando de um planeta ou do sol, a nave vem rápido demais e bate no
 * vidro. Tem de ser rara — se acontece sempre, perde a graça; de vez em quando, vira um "pera, o que foi isso?".
 */
import type { ShipTarget } from '../ship/escort'

/** Chance de uma volta elegível virar trombada. */
export const CRASH_CHANCE = 0.1
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
  override?: CrashOverride
}

/**
 * Esta volta vira trombada? Nunca no tutorial, na apresentação, com movimento reduzido nem fora da volta de um alvo;
 * nunca na primeira volta da sessão (a pessoa vê uma volta normal antes) nem antes de CRASH_COOLDOWN voltas normais
 * depois da última. Fora disso, sorteia com `rng` (Math.random no app). `?crash` pula a raridade, não as exclusões.
 * Só consome o gerador quando sorteia de fato.
 */
export function shouldCrash(rng: () => number, history: CrashHistory, context: CrashContext): boolean {
  const { from, tutorial, presentation, reducedMotion, override = null } = context
  if (!from || tutorial || presentation || reducedMotion || override === 'never') return false
  if (override === 'force') return true
  if (history.returns === 0 || history.sinceCrash < CRASH_COOLDOWN) return false
  return rng() < CRASH_CHANCE
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
