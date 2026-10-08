import type { OctocatExpression } from '@/lib/octocat/expression'
import { COLORS } from '@/lib/ship/geometry'

export const FACE_TEX_W = 512
export const FACE_TEX_H = 384
/** O canvas cobre a caixa da elipse do rosto no SVG (cx 200, cy 204, rx 46, ry 34). */
const BOX = { x: 154, y: 170, w: 92, h: 68 }

type Layer =
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; color: string; opacity?: number }
  | { kind: 'stroke'; d: string; width: number }
  | { kind: 'fill'; d: string }

/** Rosto do piloto (coordenadas do SVG principal). */
const NEUTRAL: Layer[] = [
  { kind: 'ellipse', cx: 186, cy: 200, rx: 6, ry: 9, color: COLORS.face },
  { kind: 'ellipse', cx: 214, cy: 200, rx: 6, ry: 9, color: COLORS.face },
  { kind: 'ellipse', cx: 200, cy: 215, rx: 3, ry: 3, color: COLORS.face },
  { kind: 'stroke', d: 'M190 222 Q200 231 210 222', width: 2.5 },
  { kind: 'ellipse', cx: 172, cy: 214, rx: 8, ry: 4, color: COLORS.blush, opacity: 0.6 },
  { kind: 'ellipse', cx: 228, cy: 214, rx: 8, ry: 4, color: COLORS.blush, opacity: 0.6 },
]

const NEUTRAL_BLINK: Layer[] = [
  { kind: 'stroke', d: 'M180 200 L192 200 M208 200 L220 200', width: 3 },
  ...NEUTRAL.slice(2),
]

/** Folha de expressões: desenhadas em coordenadas deslocadas por translate(80 44). */
const SHEET: Record<Exclude<OctocatExpression, 'neutral'>, Layer[]> = {
  happy: [
    { kind: 'stroke', d: 'M98 158 Q106 147 114 158 M126 158 Q134 147 142 158', width: 3.5 },
    { kind: 'fill', d: 'M106 174 Q120 192 134 174 Z' },
    { kind: 'ellipse', cx: 92, cy: 172, rx: 8, ry: 4, color: COLORS.blush, opacity: 0.7 },
    { kind: 'ellipse', cx: 148, cy: 172, rx: 8, ry: 4, color: COLORS.blush, opacity: 0.7 },
  ],
  wink: [
    { kind: 'ellipse', cx: 106, cy: 156, rx: 6, ry: 9, color: COLORS.face },
    { kind: 'stroke', d: 'M127 158 Q134 151 141 158', width: 3.5 },
    { kind: 'stroke', d: 'M109 177 Q120 188 131 177', width: 3 },
  ],
  surprised: [
    { kind: 'ellipse', cx: 105, cy: 154, rx: 8, ry: 12, color: COLORS.face },
    { kind: 'ellipse', cx: 135, cy: 154, rx: 8, ry: 12, color: COLORS.face },
    { kind: 'ellipse', cx: 102, cy: 149, rx: 2.5, ry: 2.5, color: '#FFFFFF' },
    { kind: 'ellipse', cx: 132, cy: 149, rx: 2.5, ry: 2.5, color: '#FFFFFF' },
    { kind: 'ellipse', cx: 120, cy: 182, rx: 6, ry: 8, color: COLORS.face },
  ],
  thinking: [
    { kind: 'ellipse', cx: 110, cy: 151, rx: 6, ry: 9, color: COLORS.face },
    { kind: 'ellipse', cx: 138, cy: 151, rx: 6, ry: 9, color: COLORS.face },
    { kind: 'stroke', d: 'M112 180 L130 177', width: 3 },
  ],
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer): void {
  ctx.globalAlpha = layer.kind === 'ellipse' ? (layer.opacity ?? 1) : 1
  if (layer.kind === 'ellipse') {
    ctx.fillStyle = layer.color
    ctx.beginPath()
    ctx.ellipse(layer.cx, layer.cy, layer.rx, layer.ry, 0, 0, Math.PI * 2)
    ctx.fill()
  } else if (layer.kind === 'stroke') {
    ctx.strokeStyle = COLORS.face
    ctx.lineWidth = layer.width
    ctx.lineCap = 'round'
    ctx.stroke(new Path2D(layer.d))
  } else {
    ctx.fillStyle = COLORS.face
    ctx.fill(new Path2D(layer.d))
  }
}

/**
 * Desenha o rosto na caixa BOX do SVG. A caixa inteira recebe a cor da pele: o disco do rosto (a elipse
 * inscrita) recorta o contorno, e a borda do disco nunca amostra pixel transparente.
 */
export function drawOctocatFace(ctx: CanvasRenderingContext2D, expression: OctocatExpression, blinking: boolean): void {
  const sx = FACE_TEX_W / BOX.w
  const sy = FACE_TEX_H / BOX.h
  ctx.setTransform(sx, 0, 0, sy, -BOX.x * sx, -BOX.y * sy)
  ctx.globalAlpha = 1
  ctx.fillStyle = COLORS.skin
  ctx.fillRect(BOX.x, BOX.y, BOX.w, BOX.h)

  if (expression === 'neutral') {
    for (const layer of blinking ? NEUTRAL_BLINK : NEUTRAL) drawLayer(ctx, layer)
  } else {
    ctx.translate(80, 44)
    for (const layer of SHEET[expression]) drawLayer(ctx, layer)
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
}
