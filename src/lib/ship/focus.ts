/**
 * Modo de foco na nave: clicar no Octocat (ou na nave) estaciona a nave no mundo, na frente da câmera, e a câmera
 * passa a orbitar em volta dela para o usuário girar e brincar. Aqui ficam as regras puras: quando o clique entra
 * (e quando só cancela a trombada), onde a nave estaciona e o enquadramento de três-quartos para onde a câmera voa.
 *
 * A seleção `{ kind: 'ship' }` (store/universe) é a fonte do modo: sair dela (← Galáxia, Esc, outro alvo, tutorial,
 * apresentação) sai do modo; a nave volta para a escolta pelo voo de volta de sempre, sem trombada.
 */
import type { Pose, Viewport } from '../cameraPoses'
import type { TutorialStep } from '../tutorial'
import type { Vec3 } from '../universe/orbits'
import { SHIP_BOX_CENTER_Y, SHIP_WORLD_WIDTH } from './escort'
import type { ShipMode } from './shipMachine'

export interface FocusContext {
  /** Já no modo (a seleção é a nave). */
  focused: boolean
  shipMode: ShipMode
  tutorial: TutorialStep | null
  presenting: boolean
  /** Trombada na tela em curso (a linha do tempo correndo e não cancelada). */
  crashActive: boolean
}

export type ShipClick = 'enter' | 'play' | 'cancelCrash' | 'none'

/** Modos em que a nave está parada e pode estacionar. */
const PARKABLE: ReadonlySet<ShipMode> = new Set(['escort', 'visiting'])

/**
 * Dá para entrar no modo agora: nave parada (escolta ou visita), sem a apresentação, sem um passo guiado do tutorial
 * (o passo livre convive com qualquer seleção) e sem trombada em curso.
 */
export function focusAllowed(c: FocusContext): boolean {
  return PARKABLE.has(c.shipMode) && !c.presenting && (c.tutorial === null || c.tutorial === 'free') && !c.crashActive
}

/** O que um clique na nave faz. Com a trombada em curso, só a cancela (como fazia quando o clique abria o tutorial). */
export function shipClick(c: FocusContext): ShipClick {
  if (c.focused && c.shipMode === 'focus') return 'play'
  if (c.crashActive) return 'cancelCrash'
  return focusAllowed(c) ? 'enter' : 'none'
}

/**
 * Onde a nave estaciona: no eixo da visão, a meio caminho do que a câmera olha, entre um piso (longe da lente e do
 * plano próximo, com a envergadura inteira) e um teto (na visão geral o alvo fica a dezenas de unidades).
 */
export const PARK_TARGET_SHARE = 0.5
export const PARK_MIN_DISTANCE = 2
export const PARK_MAX_DISTANCE = 10

export function focusParking(eye: Vec3, forward: Vec3, targetDistance: number, near = 0.1): Vec3 {
  const l = Math.hypot(forward[0], forward[1], forward[2]) || 1
  const floor = Math.max(PARK_MIN_DISTANCE, near + SHIP_WORLD_WIDTH)
  const d = Math.min(PARK_MAX_DISTANCE, Math.max(floor, targetDistance * PARK_TARGET_SHARE))
  return [eye[0] + (forward[0] / l) * d, eye[1] + (forward[1] / l) * d, eye[2] + (forward[2] / l) * d]
}

/** Direção (no plano, unitária) da nave para a câmera: a frente da nave estacionada aponta para quem a chamou. */
export function focusFront(ship: Vec3, eye: Vec3): Vec3 {
  const x = eye[0] - ship[0]
  const z = eye[2] - ship[2]
  const l = Math.hypot(x, z)
  return l < 1e-9 ? [0, 0, 1] : [x / l, 0, z / l]
}

/** Centro da caixa da nave (para onde a câmera olha e em volta do que ela orbita). */
export function focusCenter(ship: Vec3): Vec3 {
  return [ship[0], ship[1] + SHIP_BOX_CENTER_Y, ship[2]]
}

/** Distância padrão da câmera à nave no modo, e os limites do zoom: perto o bastante para ver o rosto, fora da cúpula. */
export const FOCUS_DISTANCE = 1.5
export const FOCUS_MIN_DISTANCE = 0.8
export const FOCUS_MAX_DISTANCE = 4.5
/** Três-quartos: giro em volta da nave a partir da frente, e um pouco de cima (rad). */
export const FOCUS_YAW = 0.6
export const FOCUS_ELEVATION = 0.22
/** Envergadura com folga que precisa caber na largura da tela. */
const FIT_WIDTH = SHIP_WORLD_WIDTH * 1.25

/**
 * Enquadramento de três-quartos de frente: olhando o centro da nave, girado `FOCUS_YAW` da frente dela e um pouco de
 * cima. Numa tela estreita (em pé), afasta até a envergadura caber na largura (sem passar do limite do zoom).
 */
export function focusPose(center: Vec3, front: Vec3, viewport: Viewport): Pose {
  const tanY = Math.tan((viewport.fov * Math.PI) / 360)
  const fit = FIT_WIDTH / 2 / (tanY * viewport.aspect)
  const distance = Math.min(FOCUS_MAX_DISTANCE, Math.max(FOCUS_DISTANCE, fit))
  const c = Math.cos(FOCUS_YAW)
  const s = Math.sin(FOCUS_YAW)
  // gira a frente (no plano) em volta do eixo vertical
  const dx = front[0] * c + front[2] * s
  const dz = -front[0] * s + front[2] * c
  const h = Math.cos(FOCUS_ELEVATION) * distance
  return {
    position: [center[0] + dx * h, center[1] + Math.sin(FOCUS_ELEVATION) * distance, center[2] + dz * h],
    target: [center[0], center[1], center[2]],
  }
}

/** Dica no pé da tela ao entrar no modo (some no primeiro toque, arrasto ou rolagem). No toque não há Esc. */
export const FOCUS_HINT = 'Arraste para girar · Toque para brincar · Esc para voltar'
// espaço que não quebra: a seta não fica sozinha no fim da linha
export const FOCUS_HINT_TOUCH = 'Arraste para girar · Toque para brincar · ←\u00a0Galáxia para voltar'

export function focusHint(touch: boolean): string {
  return touch ? FOCUS_HINT_TOUCH : FOCUS_HINT
}
