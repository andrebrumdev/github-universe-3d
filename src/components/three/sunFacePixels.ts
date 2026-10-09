import { faceKey, hasEyes } from '@/lib/sun/face'
import { SUN_EXPRESSIONS, type SunExpression } from '@/lib/sun/sunMachine'
import { drawSunFace, SUN_BODY, SUN_FACE_REGION, SUN_TEX_H, SUN_TEX_W } from './sunFace'
import { context2d, readRows, type MakeCanvas } from './texturePixels'

export interface SunFaceVariant {
  expression: SunExpression
  closed: boolean
  /** `faceKey`: muda só quando o desenho muda. */
  key: string
}

/** Todos os rostos que o canvas desenha: cada expressão aberta e, nas que têm olhos, piscando. */
export const SUN_FACE_VARIANTS: readonly SunFaceVariant[] = SUN_EXPRESSIONS.flatMap((expression) =>
  (hasEyes(expression) ? [false, true] : [false]).map((closed) => ({ expression, closed, key: faceKey(expression, closed) })),
)

/** Pedaço do rosto (SUN_FACE_REGION), RGBA de baixo para cima, por `faceKey`. */
export type SunFaceRegions = Record<string, Uint8Array>

/**
 * Pinta os rostos pedidos num canvas do tamanho da textura (o desenho é o mesmo de sempre, `drawSunFace`) e guarda só
 * o pedaço do rosto de cada um. Roda no worker (pré-pinta o conjunto todo uma vez) e na thread principal (sem worker,
 * um rosto por vez, quando for preciso).
 */
export function paintSunFaceRegions(makeCanvas: MakeCanvas, variants: readonly SunFaceVariant[] = SUN_FACE_VARIANTS): SunFaceRegions {
  const { x, y, w, h } = SUN_FACE_REGION
  const out: SunFaceRegions = {}
  for (const v of variants) {
    const ctx = context2d(makeCanvas(SUN_TEX_W, SUN_TEX_H))
    drawSunFace(ctx, v.expression, v.closed)
    out[v.key] = readRows(ctx, x, y, w, h)
  }
  return out
}

/** SUN_BODY em RGBA (opaco: o canvas guarda os bytes exatos). */
function bodyRgba(): [number, number, number, number] {
  const n = parseInt(SUN_BODY.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]
}

/** Linha de baixo para cima (v) onde começa o pedaço do rosto na textura. */
export const FACE_ROW = SUN_TEX_H - SUN_FACE_REGION.y - SUN_FACE_REGION.h

/** Textura inteira (de baixo para cima) com o rosto `region`: fora do pedaço é só o amarelo do corpo. */
export function composeSunFace(region: Uint8Array): Uint8Array {
  const out = new Uint8Array(SUN_TEX_W * SUN_TEX_H * 4)
  const [r, g, b, a] = bodyRgba()
  for (let i = 0; i < out.length; i += 4) {
    out[i] = r
    out[i + 1] = g
    out[i + 2] = b
    out[i + 3] = a
  }
  const { x, w, h } = SUN_FACE_REGION
  for (let row = 0; row < h; row++) {
    out.set(region.subarray(row * w * 4, (row + 1) * w * 4), ((FACE_ROW + row) * SUN_TEX_W + x) * 4)
  }
  return out
}
