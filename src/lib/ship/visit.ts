/**
 * Onde a nave fica ao apresentar um planeta (ou o sol): em primeiro plano, entre a lente e o alvo, como quem
 * apresenta na frente do slide. A posição sai da tela: o disco do alvo projetado pela pose da câmera (a pose de foco),
 * os retângulos reservados da interface (os mesmos de `uiLayout`, que a escolta usa) e uma caixa da nave do tamanho
 * pedido. Ela fica ao lado do disco, do lado livre da tela, sem cobrir o centro do alvo nem a interface; o rosto do
 * Octocat e o Clawd ficam na tela. Depois vira um ponto no referencial da câmera (`placementOffset`), que acompanha a
 * câmera atrasada como a escolta.
 */
import type { Pose } from '../cameraPoses'
import { isSheetLayout, UI_GAP, type Rect } from '../uiLayout'
import type { Vec3 } from '../universe/orbits'
import { frameFromPose, frameToLocal } from './cameraFrame'
import { placementOffset, SHIP_SCREEN_ASPECT, shipFaceBox, shipScreenBox, type EscortPlacement } from './escort'

export interface VisitFraming {
  /** Fração da altura da tela que a nave ocupa quando há espaço. */
  heightFraction: number
  /** Menor fração aceita ao encolher para caber. */
  minHeightFraction: number
}

/** Desktop: ~18% da altura (15–20%). Celular: ~12%. */
export const VISIT_DESKTOP: VisitFraming = { heightFraction: 0.18, minHeightFraction: 0.14 }
export const VISIT_PHONE: VisitFraming = { heightFraction: 0.12, minHeightFraction: 0.09 }

/** Pelo layout (`isSheetLayout`): sem a altura, conta como em pé. */
export function visitFraming(width: number, height = Infinity): VisitFraming {
  return isSheetLayout(width, height) ? VISIT_PHONE : VISIT_DESKTOP
}

/** Disco do alvo na tela (px): centro e raio. */
export interface Disc {
  x: number
  y: number
  r: number
}

/** Projeta uma esfera (centro, raio) pela pose (perspectiva com `fov` vertical). Atrás da câmera: null. */
export function projectDisc(pose: Pose, center: Vec3, radius: number, width: number, height: number, fov: number): Disc | null {
  const l = frameToLocal(frameFromPose(pose), center)
  const depth = -l[2]
  if (depth <= 1e-6) return null
  const tanY = Math.tan((fov * Math.PI) / 360)
  const aspect = width / height
  return {
    x: ((l[0] / depth / (tanY * aspect) + 1) / 2) * width,
    y: ((1 - l[1] / depth / tanY) / 2) * height,
    r: (radius / depth / tanY) * (height / 2),
  }
}

export interface VisitPlacement extends EscortPlacement {
  /** Lado do giro de três-quartos: 1 = nariz para a esquerda (o alvo está à esquerda da nave). */
  side: 1 | -1
}

export interface VisitScreen {
  width: number
  height: number
  /** O que a nave não cobre: botões, painel ou folha, cartões. */
  reserved: readonly Rect[]
  disc: Disc
}

const overlaps = (a: Rect, b: Rect, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap

/** Miolo do alvo que a nave nunca cobre (px). */
const core = (disc: Disc) => Math.max(0.35 * disc.r, 10)

function coversCore(box: Rect, disc: Disc): boolean {
  const cx = Math.min(Math.max(disc.x, box.x), box.x + box.w)
  const cy = Math.min(Math.max(disc.y, box.y), box.y + box.h)
  return Math.hypot(cx - disc.x, cy - disc.y) < core(disc)
}

/** Área livre da tela: tira as faixas inteiras (painel à direita, folha embaixo) que a interface ocupa. */
function freeCenter(width: number, height: number, reserved: readonly Rect[]): [number, number] {
  let x0 = 0
  let x1 = width
  let y1 = height
  for (const r of reserved) {
    if (r.h >= height * 0.5 && r.x + r.w >= width - 1) x1 = Math.min(x1, r.x)
    if (r.h >= height * 0.5 && r.x <= 1) x0 = Math.max(x0, r.x + r.w)
    if (r.w >= width * 0.5 && r.y + r.h >= height - 1) y1 = Math.min(y1, r.y)
  }
  return [(x0 + x1) / 2, y1 / 2]
}

const GRID = 48

/**
 * Posição da nave na tela durante a visita. Procura numa grade a caixa mais perto do "lugar de quem apresenta": ao
 * lado do disco, na direção do centro da área livre e um pouco abaixo; encolhe até o mínimo se nada couber.
 */
export function visitPlacement(screen: VisitScreen, framing: VisitFraming = visitFraming(screen.width, screen.height)): VisitPlacement {
  const { width: W, height: H, reserved, disc } = screen
  const [fx, fy] = freeCenter(W, H, reserved)
  let dx = fx - disc.x
  let dy = fy - disc.y + 0.25 * H
  const dl = Math.hypot(dx, dy)
  if (dl < 1e-6) {
    dx = 0.6
    dy = 0.8
  } else {
    dx /= dl
    dy /= dl
  }
  const make = (f: number, cx: number, cy: number): VisitPlacement => ({
    heightFraction: f,
    centerX: cx,
    centerY: cy,
    fits: true,
    side: disc.x < cx ? 1 : -1,
  })
  const valid = (p: VisitPlacement) => {
    const box = shipScreenBox(p, H)
    if (box.x < UI_GAP || box.y < UI_GAP || box.x + box.w > W - UI_GAP || box.y + box.h > H - UI_GAP) return false
    const face = shipFaceBox(p, H)
    if (face.x < 0 || face.x + face.w > W || face.y < 0) return false
    if (coversCore(box, disc)) return false
    return reserved.every((r) => !overlaps(box, r, UI_GAP))
  }
  for (let f = framing.heightFraction; f >= framing.minHeightFraction - 1e-9; f -= 0.005) {
    const h = f * H
    const w = h * SHIP_SCREEN_ASPECT
    // lugar de quem apresenta: encostado no disco, do lado livre
    const ax = disc.x + dx * (disc.r + 0.55 * w)
    const ay = disc.y + dy * (disc.r + 0.55 * h)
    let best: VisitPlacement | null = null
    let bestCost = Infinity
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        const p = make(f, w / 2 + ((W - w) * i) / GRID, h / 2 + ((H - h) * j) / GRID)
        if (!valid(p)) continue
        // perto do lugar ideal; cobrir o disco (fora do miolo) custa um pouco
        const d = Math.hypot(p.centerX - disc.x, p.centerY - disc.y)
        const cost = Math.hypot(p.centerX - ax, p.centerY - ay) + Math.max(0, disc.r + 0.3 * w - d)
        if (cost < bestCost) {
          bestCost = cost
          best = p
        }
      }
    }
    if (best) return best
  }
  const f = framing.minHeightFraction
  return { ...make(f, Math.min(Math.max(disc.x + dx * disc.r, 0), W), Math.min(Math.max(disc.y + dy * disc.r, 0), H)), fits: false }
}

/** O ponto da visita no referencial da câmera (x à direita, y para cima, −z à frente), com o giro para o alvo. */
export function visitLocal(p: VisitPlacement, width: number, height: number, fov: number): Vec3 {
  return placementOffset(p, width, height, fov, p.side)
}

// ————— durante a visita: passagem para a câmera e reposicionamento —————

/** Distância (unidades) da câmera à pose de foco a partir da qual a visita começa a passar para o referencial dela. */
export const VISIT_HAND_RANGE = 12
/** Ritmo máximo (1/s) da passagem: começa do zero na chegada, sem salto. */
export const VISIT_HAND_RATE = 1.2
/** A câmera chegou a essa fração do caminho até a pose: conta como chegada (ela nunca bate a pose bit a bit: o
 * CameraControls a remonta em coordenadas esféricas). */
export const VISIT_HAND_SNAP = 0.98
/** O alvo andou na tela mais que essa fração da altura: a nave muda de lugar (quando a câmera assentar). */
export const VISIT_REPLACE_SHIFT = 0.12
/** O disco do alvo mudou de tamanho mais que isso (razão, em log): também muda de lugar. */
export const VISIT_REPLACE_ZOOM = 0.35
/** Câmera "parada": abaixo destas velocidades (unidades/s e rad/s) por SETTLE_SECONDS. */
export const SETTLE_SPEED = 0.05
export const SETTLE_TURN = 0.02
export const SETTLE_SECONDS = 0.25

export interface VisitWatch {
  /** 0 = preso à pose de foco (mundo), 1 = preso à câmera atrasada. */
  hand: number
  /** Há quanto tempo (s) a câmera está parada. */
  still: number
}

export const newVisitWatch = (): VisitWatch => ({ hand: 0, still: 0 })

export interface VisitStepInput {
  /** Distância da câmera à posição da pose de foco. */
  far: number
  /** Velocidade da câmera (unidades/s) e do giro dela (rad/s). */
  cameraSpeed: number
  cameraTurn: number
  dt: number
  /** Quanto o centro do alvo andou na tela desde o lugar atual, em fração da altura. */
  discShift: number
  /** Raio do disco agora / raio quando o lugar atual foi escolhido. */
  radiusRatio: number
  /** A interface reservada (painel, cartões, tamanho) mudou desde o lugar atual. */
  layoutChanged: boolean
}

/**
 * Um quadro da visita: avança a passagem (no ritmo limitado, rumo ao quanto a câmera já chegou na pose; com a câmera
 * parada, completa mesmo longe dela, ex.: o usuário arrastou no meio) e diz se é hora de escolher outro lugar:
 * na hora, se a interface mudou; com a câmera assentada, se o alvo andou ou mudou de tamanho na tela.
 * Quem chama desliza a nave até o lugar novo (sem salto) e zera `discShift`/`radiusRatio`.
 */
export function visitStep(w: VisitWatch, input: VisitStepInput): { hand: number; replace: boolean } {
  const { far, cameraSpeed, cameraTurn, dt } = input
  w.still = cameraSpeed < SETTLE_SPEED && cameraTurn < SETTLE_TURN ? w.still + dt : 0
  const settled = w.still >= SETTLE_SECONDS
  // quase na pose conta como na pose (a câmera nunca bate a pose bit a bit); a passagem segue no ritmo até 1 exato
  const near = Math.min(1, Math.max(0, 1 - far / VISIT_HAND_RANGE))
  const reach = settled || near >= VISIT_HAND_SNAP ? 1 : near
  w.hand = Math.max(w.hand, Math.min(reach, w.hand + VISIT_HAND_RATE * dt))
  if (w.hand < 1) return { hand: w.hand, replace: false }
  const moved = input.discShift > VISIT_REPLACE_SHIFT || Math.abs(Math.log(input.radiusRatio)) > VISIT_REPLACE_ZOOM
  return { hand: w.hand, replace: input.layoutChanged || (settled && moved) }
}
