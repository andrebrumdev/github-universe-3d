import type { Pose } from '../cameraPoses'
import { UI_GAP, type Rect } from '../uiLayout'
import { barycenterOffset } from '../universe/barycenter'
import { planetPosition, SUN_RADIUS, type OrbitSystem, type Vec3 } from '../universe/orbits'
import { SUN_SAFE_DISTANCE } from './travel'
import { add, cross, length, normalize, scale, sub } from './vec'

export type ShipTarget = { kind: 'sun' } | { kind: 'planet'; name: string }

export function targetAnchor(target: ShipTarget, system: OrbitSystem, time: number): { position: Vec3; radius: number } | null {
  // o sol bamboleia em torno do baricentro (a origem)
  if (target.kind === 'sun') return { position: barycenterOffset(system, time), radius: SUN_RADIUS }
  const orbit = system.orbits.find((o) => o.name === target.name)
  if (!orbit) return null
  return { position: planetPosition(system.rings[orbit.ring], orbit, time), radius: orbit.radius }
}

/**
 * Ao lado do alvo, do lado da câmera e um pouco acima; nunca perto demais do sol.
 * `side` escolhe o lado na visão da câmera: −1 = esquerda (padrão do plano), +1 = direita; frações aproximam do alvo.
 */
export function visitPosition(anchor: Vec3, radius: number, cameraPos: Vec3, side = -1): Vec3 {
  const toCamera = normalize(sub(cameraPos, anchor))
  const right = normalize(cross([0, 1, 0], toCamera), [1, 0, 0])
  let pos = add(add(anchor, scale(toCamera, radius + 1.6)), add(scale(right, side * (radius + 0.8)), [0, radius * 0.5 + 0.4, 0]))
  const d = length(pos)
  if (d < SUN_SAFE_DISTANCE + 0.5) pos = scale(normalize(pos, [0, 1, 0]), SUN_SAFE_DISTANCE + 0.5)
  return pos
}

/** Escala da nave na cena (modelo: 5,56 de envergadura × 4,10 de comprimento × 2,76 de altura; frente em +z). */
export const SHIP_SCALE = 0.18
/** Altura e largura (envergadura) da nave no mundo, para enquadrar a escolta. */
export const SHIP_WORLD_HEIGHT = 2.76 * SHIP_SCALE
export const SHIP_WORLD_WIDTH = 5.56 * SHIP_SCALE
/** Distância mínima entre a nave e a câmera: meia envergadura + plano próximo (0,1) + folga. */
export const MIN_SHIP_DISTANCE = 0.75

export interface EscortFraming {
  /** Fração da altura da tela que a nave ocupa quando há espaço. */
  heightFraction: number
  /** Menor fração aceita ao encolher para não cobrir a interface. */
  minHeightFraction: number
  /** Fração da largura da caixa que pode passar da borda do canto (só a asa de lá). */
  overhang: number
  /** 1 = canto direito, −1 = canto esquerdo. */
  side: 1 | -1
}

/** Desktop/paisagem: canto inferior direito, perto da lente; pode cortar só a ponta da asa de lá. */
export const ESCORT_WIDE: EscortFraming = { heightFraction: 0.25, minHeightFraction: 0.18, overhang: 0.1, side: 1 }
/**
 * Celular em pé: canto inferior esquerdo (o botão "? Tutorial" fica no direito) e a nave **inteira** dentro da
 * tela — nenhuma ponta de asa cortada (overhang 0).
 */
export const ESCORT_PORTRAIT: EscortFraming = { heightFraction: 0.16, minHeightFraction: 0.13, overhang: 0, side: -1 }

export function escortFraming(width: number, height: number): EscortFraming {
  return width < height ? ESCORT_PORTRAIT : ESCORT_WIDE
}

/** Giro (rad) em torno do eixo vertical para a nave ficar em três-quartos de frente, com o nariz para o centro da tela. */
export const THREE_QUARTER_YAW = 0.45
/**
 * Caixa da silhueta da nave na tela (perto da lente, em três-quartos), largura/altura. Medida nas capturas
 * (1920×1080 e 375×667: ~1,93) e arredondada para cima.
 */
export const SHIP_SCREEN_ASPECT = 2
/**
 * Em três-quartos, a cauda e a asa de lá giram para o lado do canto: a silhueta fica deslocada da origem do
 * modelo para o canto em ~0,45 × a altura da caixa (medido nas capturas). A origem vai para o outro lado.
 */
export const SHIP_BOX_SHIFT = 0.45
/** Centro da caixa acima da origem do modelo (y do modelo vai de −0,94 a 1,82). */
export const SHIP_BOX_CENTER_Y = ((1.82 - 0.94) / 2) * SHIP_SCALE

export interface EscortScreen {
  width: number
  height: number
  /** Retângulos (px) que a nave não pode cobrir: botão e, com o tutorial aberto, a zona do cartão. */
  reserved: readonly Rect[]
}

export interface EscortPlacement {
  heightFraction: number
  /** Centro da caixa da nave na tela (px). */
  centerX: number
  centerY: number
  /** false = não coube sem cobrir nada nem no tamanho mínimo (fica no canto, no mínimo). */
  fits: boolean
}

/** Caixa da nave na tela (px). */
export function shipScreenBox(p: EscortPlacement, screenHeight: number): Rect {
  const h = p.heightFraction * screenHeight
  const w = h * SHIP_SCREEN_ASPECT
  return { x: p.centerX - w / 2, y: p.centerY - h / 2, w, h }
}

/** Região do rosto do Octocat e do Clawd: faixa central da caixa, do topo até um pouco abaixo do meio. */
export function shipFaceBox(p: EscortPlacement, screenHeight: number): Rect {
  const box = shipScreenBox(p, screenHeight)
  return { x: p.centerX - box.w * 0.2, y: box.y, w: box.w * 0.4, h: box.h * 0.6 }
}

const overlaps = (a: Rect, b: Rect, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap

const STEP = 0.005

/**
 * Onde a nave fica na tela. Preferência: ficar no canto, encolhendo até o mínimo e subindo acima do que estiver
 * embaixo; se nem assim couber, desliza para longe do canto (passando o botão ou o cartão). Nunca cobre um
 * retângulo reservado; o rosto fica sempre na tela; só a asa do lado do canto pode passar da borda (`overhang`).
 */
export function escortPlacement(screen: EscortScreen, framing: EscortFraming = escortFraming(screen.width, screen.height)): EscortPlacement {
  const { width: W, height: H, reserved } = screen
  const { side, overhang } = framing
  const make = (f: number, edge: number, bottom: number): EscortPlacement => {
    const h = f * H
    const w = h * SHIP_SCREEN_ASPECT
    return { heightFraction: f, centerX: side === 1 ? edge - w / 2 : edge + w / 2, centerY: bottom - h / 2, fits: true }
  }
  const valid = (p: EscortPlacement) => {
    const box = shipScreenBox(p, H)
    const allowed = overhang * box.w
    const left = side === -1 ? -allowed : UI_GAP
    const right = side === 1 ? W + allowed : W - UI_GAP
    if (box.x < left || box.x + box.w > right || box.y < UI_GAP || box.y + box.h > H - UI_GAP) return false
    const face = shipFaceBox(p, H)
    if (face.x < 0 || face.x + face.w > W) return false
    return reserved.every((r) => !overlaps(box, r, UI_GAP))
  }
  // Borda do lado do canto (x da borda de fora da caixa): o canto e, depois, logo além de cada retângulo.
  const cornerEdge = (w: number) => (side === 1 ? W + overhang * w - (overhang > 0 ? 0 : UI_GAP) : -overhang * w + (overhang > 0 ? 0 : UI_GAP))
  const slideEdges = reserved.map((r) => (side === 1 ? r.x - UI_GAP : r.x + r.w + UI_GAP)).sort((a, b) => (side === 1 ? b - a : a - b))
  const bottoms = [H - UI_GAP, ...reserved.map((r) => r.y - UI_GAP)].sort((a, b) => b - a)

  for (const slide of [null, ...slideEdges]) {
    for (let f = framing.heightFraction; f >= framing.minHeightFraction - 1e-9; f -= STEP) {
      const edge = slide ?? cornerEdge(f * H * SHIP_SCREEN_ASPECT)
      for (const bottom of bottoms) {
        const p = make(f, edge, bottom)
        if (valid(p)) return p
      }
    }
  }
  const f = framing.minHeightFraction
  return { ...make(f, cornerEdge(f * H * SHIP_SCREEN_ASPECT), H - UI_GAP), fits: false }
}

/**
 * Posição da escolta no referencial da câmera (x à direita, y para cima, −z à frente) para um posicionamento
 * na tela: a profundidade sai da fração de altura; x e y, do centro da caixa.
 */
export function placementOffset(
  p: EscortPlacement,
  width: number,
  height: number,
  fov: number,
  /** Lado do giro de três-quartos (1 = nariz para a esquerda); sem ele, o nariz vai para o centro da tela. */
  side: 1 | -1 = Math.sign(p.centerX - width / 2) >= 0 ? 1 : -1,
): Vec3 {
  const t = Math.tan((fov * Math.PI) / 360)
  const depth = SHIP_WORLD_HEIGHT / (2 * p.heightFraction * t)
  const halfH = depth * t
  const halfW = halfH * (width / height)
  const originX = p.centerX - side * SHIP_BOX_SHIFT * p.heightFraction * height
  const ndcX = (2 * originX) / width - 1
  const ndcY = 1 - (2 * p.centerY) / height
  return [ndcX * halfW, ndcY * halfH - SHIP_BOX_CENTER_Y, -depth]
}


/** Batida no vidro: duração (s), quanto chega mais perto (fração da distância) e o avanço de cada batida (unidades). */
export const KNOCK_DURATION = 3.2
export const ESCORT_LEAN_DEPTH = 0.2
export const KNOCK_BOB = 0.12
const KNOCK_TAPS = [1.0, 1.45]
const KNOCK_TAP_LENGTH = 0.25

export interface Knock {
  /** 0..1: quanto se aproximou da lente (e se inclinou para a frente). */
  closer: number
  /** 0..1: pulso de cada batida. */
  bob: number
  waving: boolean
}

const smoothstep = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return u * u * (3 - 2 * u)
}

/**
 * Linha do tempo da batida: chega perto (0–0,7 s), bate duas vezes, acena e volta (2,4–3,2 s).
 * Escreve em `out` (para o laço por frame não alocar) e o devolve.
 */
export function knockPose(t: number, out: Knock = { closer: 0, bob: 0, waving: false }): Knock {
  if (!(t >= 0 && t < KNOCK_DURATION)) {
    out.closer = 0
    out.bob = 0
    out.waving = false
    return out
  }
  out.closer = smoothstep(0, 0.7, t) * (1 - smoothstep(2.4, KNOCK_DURATION, t))
  out.bob = 0
  for (const start of KNOCK_TAPS) {
    const u = (t - start) / KNOCK_TAP_LENGTH
    if (u > 0 && u < 1) out.bob += Math.sin(u * Math.PI)
  }
  out.waving = t >= 0.6 && t < 2.6
  return out
}

/**
 * Escolta durante a batida: mais perto da lente pelo mesmo raio de visão (o canto não muda na tela).
 * Com `out`, escreve nele em vez de alocar.
 */
export function knockOffset(base: Vec3, knock: Knock, out?: Vec3): Vec3 {
  const k = knock.closer === 0 && knock.bob === 0 ? 1 : 1 - ESCORT_LEAN_DEPTH * knock.closer - (KNOCK_BOB * knock.bob) / length(base)
  if (!out) return k === 1 ? base : scale(base, k)
  out[0] = base[0] * k
  out[1] = base[1] * k
  out[2] = base[2] * k
  return out
}

/**
 * Mantém `pos` fora de uma esfera de raio `minDist` em volta de `center` (a câmera): nada corta no plano próximo.
 * Com `out`, escreve nele (pode ser o próprio `pos`) em vez de alocar.
 */
export function keepAway(pos: Vec3, center: Vec3, minDist: number, out?: Vec3): Vec3 {
  const dx = pos[0] - center[0]
  const dy = pos[1] - center[1]
  const dz = pos[2] - center[2]
  const d = Math.hypot(dx, dy, dz)
  const target = out ?? [0, 0, 0]
  if (d >= minDist) {
    if (!out) return pos
    target[0] = pos[0]
    target[1] = pos[1]
    target[2] = pos[2]
    return target
  }
  // No centro exato, empurra para a frente da câmera padrão (+z), como antes.
  const k = d < 1e-9 ? 0 : minDist / d
  target[0] = center[0] + dx * k
  target[1] = center[1] + dy * k
  target[2] = center[2] + (d < 1e-9 ? minDist : dz * k)
  return target
}

/** Câmera de perseguição: atrás e acima da nave, olhando um pouco à frente dela. */
export function chasePose(position: Vec3, tangent: Vec3): Pose {
  return {
    position: add(add(position, scale(tangent, -6)), [0, 2.2, 0]),
    target: add(position, scale(tangent, 2)),
  }
}

export const MAX_BANK = 0.6

/** Inclinação lateral proporcional à velocidade de curva (rad), limitada a ±MAX_BANK. */
export function bankAngle(prev: Vec3, next: Vec3, dt: number): number {
  if (dt <= 0) return 0
  const turn = Math.atan2(prev[2] * next[0] - prev[0] * next[2], prev[0] * next[0] + prev[2] * next[2])
  if (turn === 0) return 0
  return Math.max(-MAX_BANK, Math.min(MAX_BANK, -0.25 * (turn / dt)))
}

/** Rigidez (rad/s) da mola que puxa a câmera atrás da nave em viagem. */
export const CHASE_SPRING = 4
/** Rigidez da mola que leva a câmera da perseguição (ou de onde estiver) até a pose final. */
export const FOCUS_SPRING = 2.5

export interface Spring3 {
  position: Vec3
  velocity: Vec3
}

/**
 * Um passo de mola criticamente amortecida rumo a `goal` (solução exata para alvo parado):
 * não depende do tamanho do passo, sai do repouso devagar e, partindo do repouso, nunca passa do alvo.
 */
export function springStep(s: Spring3, goal: Vec3, omega: number, dt: number): Spring3 {
  if (dt <= 0) return s
  const decay = Math.exp(-omega * dt)
  const position: Vec3 = [0, 0, 0]
  const velocity: Vec3 = [0, 0, 0]
  for (let k = 0; k < 3; k++) {
    const e0 = s.position[k] - goal[k]
    const v0 = s.velocity[k]
    const c = v0 + omega * e0
    position[k] = goal[k] + (e0 + c * dt) * decay
    velocity[k] = (v0 - omega * c * dt) * decay
  }
  return { position, velocity }
}

/** Maior antecipação da perseguição (unidades): uma distância de perseguição e pouco. */
export const MAX_CHASE_LEAD = 8

/**
 * Antecipação para a mola seguir um alvo em movimento: mira à frente na velocidade do alvo,
 * o que cancela o atraso de regime (2v/ω) da mola criticamente amortecida. Sobra só o atraso da aceleração.
 * `maxLead` limita o comprimento da antecipação (velocidades grandes não arremessam a câmera).
 */
export function springLead(goal: Vec3, goalVelocity: Vec3, omega: number, maxLead = Infinity): Vec3 {
  const lead = scale(goalVelocity, 2 / omega)
  const l = length(lead)
  return add(goal, l > maxLead ? scale(lead, maxLead / l) : lead)
}
