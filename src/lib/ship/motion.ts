/**
 * Maior passo de quadro (s) que a nave, a câmera, o rastro, a sonda de inércia e o relógio da apresentação aceitam:
 * um quadro mais longo (aba em segundo plano, engasgo) anda só isso.
 */
export const MAX_FRAME_DT = 0.1

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

/**
 * Nível do propulsor nas queimas da viagem (ver `burnPhase` em transfer.ts): no auge, acima do 1 da viagem antiga
 * (chama máxima e longa); na planagem, só uma chama-piloto tremulando.
 */
export const BURN_THRUST = 1.2
export const COAST_THRUST = 0.05

/** Intensidade da queima (0..1) → nível do propulsor. */
export function burnThrust(intensity: number): number {
  const k = Math.min(1, Math.max(0, intensity))
  return COAST_THRUST + (BURN_THRUST - COAST_THRUST) * k
}

/** Tranco ao acender uma queima: avanço (unidades do modelo da nave) do primeiro pico; quanto dura (s). */
export const JOLT_SURGE = 0.3
export const JOLT_SECONDS = 0.7
const JOLT_FREQUENCY = 2.5
const JOLT_DAMPING = 6

/**
 * Deslocamento da nave para a frente (+z do modelo), `t` s depois de acender: um empurrão que passa um pouco e volta,
 * amortecido como uma mola. 0 fora de [0, JOLT_SECONDS).
 */
export function burnJolt(t: number): number {
  if (!(t > 0 && t < JOLT_SECONDS)) return 0
  return JOLT_SURGE * Math.sin(2 * Math.PI * JOLT_FREQUENCY * t) * Math.exp(-JOLT_DAMPING * t)
}

export const BLINK_EVERY = 4
export const BLINK_LENGTH = 0.15
export function isBlinking(t: number): boolean {
  return t % BLINK_EVERY < BLINK_LENGTH
}
