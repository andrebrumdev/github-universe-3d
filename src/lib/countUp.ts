/**
 * Contagem dos números dos cartões (stars, forks, seguidores…): de 0 até o valor quando o cartão aparece. Puro: o
 * relógio (requestAnimationFrame) e a escrita no texto ficam em quem chama (components/ui/CountUp).
 */

/** Duração da contagem (ms) do menor número… */
export const COUNT_UP_MIN_MS = 700
/** …ao maior: um milhão ou mais conta por 1,1 s. */
export const COUNT_UP_MAX_MS = 1100
/** Grandeza (casas decimais) em que a duração chega ao máximo. */
const MAX_DIGITS = 6

/** Quanto tempo (ms) a contagem até `target` leva: cresce devagar com a grandeza; zero ou inválido não conta. */
export function countUpDuration(target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0
  const digits = Math.min(Math.log10(Math.max(1, target)) / MAX_DIGITS, 1)
  return Math.round(COUNT_UP_MIN_MS + (COUNT_UP_MAX_MS - COUNT_UP_MIN_MS) * digits)
}

/** Desaceleração (quarta potência): os números correm no começo e assentam devagar no valor. */
function easeOutQuart(t: number): number {
  return 1 - (1 - t) ** 4
}

/**
 * O número na tela `elapsedMs` depois do início de uma contagem de `durationMs` até `target`: inteiro, entre 0 e o
 * valor, sem voltar, e exatamente o valor no fim (ou na hora, sem duração).
 */
export function countUpValue(target: number, elapsedMs: number, durationMs: number): number {
  if (!Number.isFinite(target) || target <= 0) return Math.max(0, Number.isFinite(target) ? target : 0)
  if (durationMs <= 0 || elapsedMs >= durationMs) return target
  if (elapsedMs <= 0) return 0
  const value = Math.floor(target * easeOutQuart(elapsedMs / durationMs))
  // o valor exato só no fim, mesmo quando a curva arredonda para 1 um pouco antes
  return Math.min(value, Math.ceil(target) - 1)
}

/** Espera (ms) antes de contar: os números começam quando o grupo deles entra no cartão (ver cardMotion). */
export const COUNT_UP_DELAY_MS = 130
