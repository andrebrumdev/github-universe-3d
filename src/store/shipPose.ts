import type { ShipMode } from '@/lib/ship/shipMachine'
import type { Vec3 } from '@/lib/universe/orbits'

export interface ShipPose {
  position: Vec3
  tangent: Vec3
  /** Velocidade analítica no caminho (unidades/s); zero fora de viagem. A câmera antecipa por ela. */
  velocity: Vec3
  mode: ShipMode
  userTravel: boolean
  /** Ponto da tela (px, como o canvas: tela cheia) onde o balão da fala se apoia; escrito pela nave a cada frame. */
  speechX: number
  speechY: number
  speechOnScreen: boolean
}

/** Estado inicial: fora do raio do sol (o ShipRig põe a nave no ponto de entrada ao montar). */
export const INITIAL_SHIP_POSE: Readonly<ShipPose> = {
  position: [0, 40, 60],
  tangent: [0, 0, 1],
  velocity: [0, 0, 0],
  mode: 'entering',
  userTravel: false,
  speechX: 0,
  speechY: 0,
  speechOnScreen: false,
}

/** Mutável de propósito: escrito pela nave a cada frame, lido pela câmera e pelo balão da fala. */
export const shipPose: ShipPose = { ...INITIAL_SHIP_POSE }
