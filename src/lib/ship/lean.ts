/**
 * Soneca (roteiro da quarta parede, lib/octocat/script): na longa inatividade a nave desliza da escolta até a borda da
 * tela do lado do canto e se encosta nela, inclinada. O lugar sai da própria escolta (mesma altura e tamanho), só
 * empurrado para a borda, sem nunca cobrir um retângulo reservado nem tirar o rosto da tela. Puro, imports relativos.
 */
import { UI_GAP, type Rect } from '../uiLayout'
import { shipFaceBox, shipScreenBox, type EscortFraming, type EscortPlacement, type EscortScreen } from './escort'

/** Quanto da caixa da nave passa da borda ao encostar (fração da largura): a asa de lá "amassa" no vidro. */
export const LEAN_OVERHANG = 0.25
/** Inclinação (rad) com o topo para a borda, e a cabeça caindo um pouco para a frente. */
export const LEAN_ROLL = 0.24
export const LEAN_NOD = 0.12
/** Ritmos (1/s): vai devagar, cochilando; volta acordado, mais depressa. */
export const LEAN_IN_RATE = 1.2
export const LEAN_OUT_RATE = 3

const STEPS = 10

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w + UI_GAP && b.x < a.x + a.w + UI_GAP && a.y < b.y + b.h + UI_GAP && b.y < a.y + a.h + UI_GAP

/** Onde a nave cochila: a escolta `base` empurrada para a borda do canto, até onde dá. */
export function leanPlacement(screen: EscortScreen, framing: EscortFraming, base: EscortPlacement): EscortPlacement {
  const { width: W, height: H, reserved } = screen
  const box = shipScreenBox(base, H)
  const target = framing.side === 1 ? W + LEAN_OVERHANG * box.w - box.w / 2 : -LEAN_OVERHANG * box.w + box.w / 2
  for (let i = STEPS; i > 0; i--) {
    const p: EscortPlacement = { ...base, centerX: base.centerX + ((target - base.centerX) * i) / STEPS }
    const face = shipFaceBox(p, H)
    if (face.x < 0 || face.x + face.w > W) continue
    const b = shipScreenBox(p, H)
    if (reserved.some((r) => overlaps(b, r))) continue
    return p
  }
  return base
}

/** Peso da soneca (0 acordado … 1 encostado), suavizado: sobe com `asleep`, desce sem ele. */
export function leanWeight(current: number, asleep: boolean, dt: number): number {
  const goal = asleep ? 1 : 0
  const rate = asleep ? LEAN_IN_RATE : LEAN_OUT_RATE
  return goal + (current - goal) * Math.exp(-rate * dt)
}
