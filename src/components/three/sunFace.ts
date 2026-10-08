import type { SunExpression } from '@/lib/sun/sunMachine'

export const SUN_TEX_W = 512
export const SUN_TEX_H = 256
const OCEAN = '#FFD23F'
const LAND = '#FFB000'
/** Continentes longe do rosto (centro em x = 128, y = 128). */
const CONTINENTS: [number, number, number, number][] = [
  [40, 40, 34, 16],
  [30, 210, 40, 18],
  [300, 90, 60, 30],
  [400, 190, 60, 24],
  [470, 60, 36, 24],
  [230, 214, 40, 14],
]

/** O rosto fica em u = 0,25, que é o +z da SphereGeometry do Three.js. */
export function drawSunFace(ctx: CanvasRenderingContext2D, expression: SunExpression, eyesClosed: boolean): void {
  ctx.fillStyle = OCEAN
  ctx.fillRect(0, 0, SUN_TEX_W, SUN_TEX_H)
  ctx.fillStyle = LAND
  for (const [x, y, rx, ry] of CONTINENTS) {
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  const cx = SUN_TEX_W * 0.25
  const cy = SUN_TEX_H * 0.5
  for (const dx of [-22, 22]) {
    if (eyesClosed) {
      ctx.strokeStyle = '#7A3E00'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(cx + dx - 10, cy - 12)
      ctx.lineTo(cx + dx + 10, cy - 12)
      ctx.stroke()
      continue
    }
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(cx + dx, cy - 12, 10, expression === 'surprised' ? 16 : 13, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.arc(cx + dx, expression === 'sad' ? cy - 6 : cy - 12, expression === 'surprised' ? 4 : 5.5, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = '#7A3E00'
  ctx.strokeStyle = '#7A3E00'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  switch (expression) {
    case 'happy':
      ctx.arc(cx, cy + 12, 12, 0.15 * Math.PI, 0.85 * Math.PI)
      ctx.stroke()
      break
    case 'veryHappy':
      ctx.arc(cx, cy + 10, 16, 0, Math.PI)
      ctx.closePath()
      ctx.fill()
      break
    case 'surprised':
      ctx.ellipse(cx, cy + 18, 7, 9, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'sad':
      ctx.arc(cx, cy + 28, 12, 1.15 * Math.PI, 1.85 * Math.PI)
      ctx.stroke()
      break
  }
}
