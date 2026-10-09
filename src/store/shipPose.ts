import type { ShipTarget } from '@/lib/ship/escort'
import type { ShipMode } from '@/lib/ship/shipMachine'
import type { Vec3 } from '@/lib/universe/orbits'

export interface ShipPose {
  position: Vec3
  tangent: Vec3
  /** Velocidade analítica no caminho (unidades/s); zero fora de viagem. A câmera antecipa por ela. */
  velocity: Vec3
  /** Dentro da janela do estilingue gravitacional da viagem atual (o rastro esquenta). */
  slingshot: boolean
  /** Inclinação lateral da nave nas curvas (rad); a câmera de perseguição acompanha um pouco. */
  bank: number
  /** Peso do enquadramento final na câmera de perseguição durante a chegada (ver `arrivalBlendWeight`); 0 fora dela. */
  arrival: number
  /**
   * Força do motor na viagem, 0..1 (`burnPhase`): 1 nas queimas, 0 na planagem; fora da viagem, 1. O rastro de fogo
   * só solta pedaço quente com o motor ligado.
   */
  engine: number
  /** Planando na viagem (motor desligado entre as queimas): as pontas das asas soltam o rastro de vapor. */
  coasting: boolean
  /**
   * Último puff de ré da frenagem: `seq` sobe a cada um (quem desenha os puffs nota a mudança), com a força relativa
   * ao puff médio (1 = médio; os primeiros são mais fortes), a duração (s) e a escala do desenho (menor perto da lente).
   */
  puff: { seq: number; strength: number; duration: number; scale: number }
  mode: ShipMode
  /** Alvo da viagem/visita atual (null na escolta). A apresentação compara com a parada para saber se a nave chegou. */
  target: ShipTarget | null
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
  slingshot: false,
  bank: 0,
  arrival: 0,
  engine: 1,
  coasting: false,
  puff: { seq: 0, strength: 0, duration: 0, scale: 1 },
  mode: 'entering',
  target: null,
  userTravel: false,
  speechX: 0,
  speechY: 0,
  speechOnScreen: false,
}

/** Mutável de propósito: escrito pela nave a cada frame, lido pela câmera e pelo balão da fala. */
export const shipPose: ShipPose = freshPose(INITIAL_SHIP_POSE.position)

/** Estado inicial com vetores próprios (a nave escreve neles no lugar, sem alocar por frame). */
function freshPose(position: Vec3): ShipPose {
  return {
    ...INITIAL_SHIP_POSE,
    position: [...position],
    tangent: [...INITIAL_SHIP_POSE.tangent],
    velocity: [...INITIAL_SHIP_POSE.velocity],
    puff: { ...INITIAL_SHIP_POSE.puff },
  }
}

export function resetShipPose(position: Vec3 = INITIAL_SHIP_POSE.position): void {
  Object.assign(shipPose, freshPose(position))
}
