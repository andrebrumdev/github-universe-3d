import { FrameClock } from '@/lib/ship/frameClock'

/**
 * Passo de quadro suavizado compartilhado pela nave (ShipRig) e pela câmera (CameraRig): os dois andam com o mesmo
 * passo no mesmo quadro, sem o tremido do horário do callback (ver lib/ship/frameClock). A chave do quadro é o
 * `clock.elapsedTime` do R3F (o mesmo para todos os useFrame do quadro).
 */
export const flightClock = new FrameClock()
