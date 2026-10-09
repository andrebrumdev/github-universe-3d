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
 * Nível do propulsor nos voos (ver `burnPhaseAt` em burn.ts): na partida, forte e acima do 1 da viagem antiga (chama
 * longa, discos de choque claros), com um pico curto na ignição; na planagem e na frenagem, uma chama-piloto pequena
 * e firme, tremulando de leve — nunca apaga (quem freia é o puff de ré).
 */
export const BURN_THRUST = 1.25
export const COAST_THRUST = 0.4
/** O nível vai para o React em degraus deste tamanho (cada degrau é uma renderização). */
export const THRUST_STEP = 0.05
/** Ritmo (1/s) com que a chama assenta no nível de quem fica parado (visita, escolta, entrada). */
const SETTLE_RATE = 4

/**
 * Próximo nível da chama, parada: aproxima `target` aos poucos (sem estalo depois da chegada, quando a chama-piloto do
 * voo vira a da visita), no máximo THRUST_STEP por quadro, e assenta nele quando chega perto.
 */
export function settleThrust(current: number, target: number, dt: number): number {
  const step = (target - current) * (1 - Math.exp(-SETTLE_RATE * dt))
  const next = current + Math.max(-THRUST_STEP, Math.min(THRUST_STEP, step))
  return Math.abs(target - next) < 0.01 ? target : next
}

/** Pico da ignição, somado ao nível da partida, e o tempo (s) até o máximo dele. */
export const IGNITION_SPIKE = 0.35
const IGNITION_RISE = 0.06

/** Nível do propulsor pela fase do motor e pelo instante do voo `t` (s desde a partida: o pico da ignição). */
export function flameLevel(burn: { phase: 'departure' | 'coast' | 'arrival'; intensity: number }, t: number): number {
  const k = Math.min(1, Math.max(0, burn.intensity))
  const base = COAST_THRUST + (BURN_THRUST - COAST_THRUST) * k
  if (burn.phase !== 'departure' || !(t > 0)) return base
  const u = t / IGNITION_RISE
  return base + IGNITION_SPIKE * u * Math.exp(1 - u)
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
