/** Flutuação suave do Octocat parado. */
export function hoverOffset(t: number): { y: number; roll: number } {
  return { y: Math.sin(t * 1.6) * 0.06, roll: Math.sin(t * 0.9) * 0.03 }
}

export const WAVE_AMPLITUDE = 0.45
/** Ângulo do braço livre acenando (rad, em torno do ombro). */
export function waveAngle(t: number): number {
  return WAVE_AMPLITUDE * Math.sin(t * 7)
}

/** Braço livre esticado para o lado, apontando (rad). */
export const POINT_ANGLE = 0.9

/** Comprimento relativo da chama: 0 apaga; senão tremula ±23% em volta do nível. */
export function thrusterScale(t: number, level: number): number {
  if (level <= 0) return 0
  return level * (1 + 0.15 * Math.sin(t * 31) + 0.08 * Math.sin(t * 53))
}

export const BLINK_EVERY = 4
export const BLINK_LENGTH = 0.15
export function isBlinking(t: number): boolean {
  return t % BLINK_EVERY < BLINK_LENGTH
}
