import { FrameClock, watchVisibility } from '@/lib/ship/frameClock'

/**
 * Passo de quadro suavizado compartilhado pela nave (ShipRig), pela câmera (CameraRig) e por quem mede o movimento
 * dela (amostra de inércia dos tentáculos e da antena, puffs, rastro): todos andam com o mesmo passo no mesmo quadro,
 * sem o tremido do horário do callback (ver lib/ship/frameClock). A chave do quadro é o `clock.elapsedTime` do R3F
 * (o mesmo para todos os useFrame do quadro). Recomeça quando a aba volta a ficar visível (um ouvinte só, da vida da
 * página).
 */
export const flightClock = new FrameClock()

if (typeof document !== 'undefined') watchVisibility(document, flightClock)
