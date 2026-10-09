export interface ClockState {
  /** segundos de simulação */
  time: number
  /** 0 = parado, 1 = velocidade normal (sempre ≥ 0: o sentido é o `turn`) */
  scale: number
  /**
   * Quanto o relógio já virou para trás (modo disco): 0 = para a frente, 1 = ao contrário. O sentido sai suave daqui
   * (`clockDirection`). Ausente = 0.
   */
  turn?: number
}

/** Taxa (1/s) com que a escala persegue o alvo: ~95% em 1 s. */
export const SCALE_RATE = 3
/** Maior passo aceito; protege contra o dt gigante de uma aba que volta do segundo plano. */
export const MAX_DT = 0.1
/** Quanto leva a virada de sentido (s): desacelera, para no meio e acelera para o outro lado. */
export const TURN_SECONDS = 1.5

const smoothstep = (u: number) => u * u * (3 - 2 * u)

/** Sentido do relógio, de +1 (para a frente) a −1 (ao contrário), liso nas pontas da virada. */
export function clockDirection(s: Pick<ClockState, 'turn'>): number {
  return 1 - 2 * smoothstep(Math.min(1, Math.max(0, s.turn ?? 0)))
}

/**
 * Um passo do relógio. `target` é a escala desejada (0 ou 1); `reverse` pede o sentido ao contrário (modo disco).
 * As órbitas são analíticas em t: andar com o tempo para trás as roda de volta, sem nada a acumular. Com o alvo em 0
 * (foco, tutorial) a virada congela: o tempo para por um decaimento exponencial com o sentido fixo, e a integral dele
 * (`predictStopTime`) continua exata para a câmera e a nave mirarem onde o alvo vai estar.
 */
export function advanceClock(s: ClockState, dt: number, target: number, reverse = false): ClockState {
  const step = Math.min(Math.max(dt, 0), MAX_DT)
  const k = 1 - Math.exp(-SCALE_RATE * step)
  let scale = s.scale + (target - s.scale) * k
  if (Math.abs(scale - target) < 1e-3) scale = target
  let turn = s.turn ?? 0
  if (target !== 0) {
    const goal = reverse ? 1 : 0
    const move = step / TURN_SECONDS
    turn = goal > turn ? Math.min(goal, turn + move) : Math.max(goal, turn - move)
  }
  const next = { time: s.time, scale, turn }
  next.time = s.time + step * scale * clockDirection(next)
  return next
}

/** Tempo em que a simulação para se o alvo virar 0 agora (integral do decaimento exponencial, no sentido atual). */
export function predictStopTime(s: ClockState): number {
  return s.time + (s.scale * clockDirection(s)) / SCALE_RATE
}

export function clockTarget(o: { reducedMotion: boolean; focused: boolean; tutorialFocus: boolean }): 0 | 1 {
  return o.reducedMotion || o.focused || o.tutorialFocus ? 0 : 1
}
