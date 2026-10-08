export interface ClockState {
  /** segundos de simulação */
  time: number
  /** 0 = parado, 1 = velocidade normal */
  scale: number
}

/** Taxa (1/s) com que a escala persegue o alvo: ~95% em 1 s. */
export const SCALE_RATE = 3
/** Maior passo aceito; protege contra o dt gigante de uma aba que volta do segundo plano. */
export const MAX_DT = 0.1

export function advanceClock(s: ClockState, dt: number, target: number): ClockState {
  const step = Math.min(Math.max(dt, 0), MAX_DT)
  const k = 1 - Math.exp(-SCALE_RATE * step)
  let scale = s.scale + (target - s.scale) * k
  if (Math.abs(scale - target) < 1e-3) scale = target
  return { time: s.time + step * scale, scale }
}

/** Tempo em que a simulação para se o alvo virar 0 agora (integral do decaimento exponencial). */
export function predictStopTime(s: ClockState): number {
  return s.time + s.scale / SCALE_RATE
}

export function clockTarget(o: { reducedMotion: boolean; focused: boolean; tutorialFocus: boolean }): 0 | 1 {
  return o.reducedMotion || o.focused || o.tutorialFocus ? 0 : 1
}
