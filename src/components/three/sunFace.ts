import { EYE, FACE_CENTER, FACE_H, FACE_W } from '@/lib/sun/face'
import type { SunExpression } from '@/lib/sun/sunMachine'

/** Canvas 2× o desenho (512×256 em unidades de desenho): os traços ficam nítidos no close-up. */
export const SUN_TEX_W = 1024
export const SUN_TEX_H = 512
/** Amarelo de painel de LED, liso e saturado (o detalhe — manchas claras, leve queda na borda — vem do shader). */
export const SUN_BODY = '#F8DA12'
/** Traços marrom quase preto, como no emoji do Sphere. */
export const SUN_FEATURE = '#1A1206'
const EYE_WHITE = '#ffffff'

/** Sobrancelha: altura acima do centro do olho, arco e inclinação (> 0 levanta a ponta de dentro: preocupado). */
const BROW: Record<SunExpression, { lift: number; arch: number; tilt: number }> = {
  happy: { lift: 26, arch: 5, tilt: 0 },
  veryHappy: { lift: 30, arch: 7, tilt: -1 },
  surprised: { lift: 34, arch: 9, tilt: 0 },
  sad: { lift: 25, arch: 2, tilt: 6 },
  // sobrancelhas altas e macias, a ponta de dentro um pouco erguida: encantado
  admiring: { lift: 32, arch: 8, tilt: 3 },
}
const BROW_HALF = 14
const BROW_WIDTH = 6.5
const MOUTH_WIDTH = 4
const LID_WIDTH = 5

/**
 * Rosto no estilo do Sphere de Las Vegas: corpo liso, olhos brancos grandes, sobrancelhas grossas e uma boquinha.
 * As pupilas NÃO vão no canvas: o shader do sol as desenha por cima do branco, onde a mola do rosto manda olhar
 * (ver `pupilLook`). Piscando, não há branco, então também não há pupila. O rosto fica em u = 0,25 (+z da esfera).
 */
export function drawSunFace(ctx: CanvasRenderingContext2D, expression: SunExpression, eyesClosed: boolean): void {
  const scale = SUN_TEX_W / FACE_W
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.fillStyle = SUN_BODY
  ctx.fillRect(0, 0, FACE_W, FACE_H)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const [cx, cy] = FACE_CENTER
  const ey = cy + EYE.y
  const brow = BROW[expression]
  for (const side of [-1, 1]) {
    const ex = cx + side * EYE.dx
    if (eyesClosed) {
      ctx.strokeStyle = SUN_FEATURE
      ctx.lineWidth = LID_WIDTH
      ctx.beginPath()
      ctx.moveTo(ex - 15, ey)
      ctx.quadraticCurveTo(ex, ey + 8, ex + 15, ey)
      ctx.stroke()
    } else {
      ctx.fillStyle = EYE_WHITE
      ctx.beginPath()
      ctx.ellipse(ex, ey, EYE.rx, EYE.ry, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    // a ponta de dentro (perto do nariz) é a do lado do centro do rosto
    const by = ey - brow.lift
    const inner = ex - side * BROW_HALF
    const outer = ex + side * BROW_HALF
    ctx.strokeStyle = SUN_FEATURE
    ctx.lineWidth = BROW_WIDTH
    ctx.beginPath()
    ctx.moveTo(outer, by + brow.tilt)
    ctx.quadraticCurveTo(ex, by - brow.arch * 2, inner, by - brow.tilt)
    ctx.stroke()
  }

  ctx.fillStyle = SUN_FEATURE
  ctx.strokeStyle = SUN_FEATURE
  ctx.lineWidth = MOUTH_WIDTH
  ctx.beginPath()
  switch (expression) {
    case 'happy':
      ctx.arc(cx, cy + 20, 7, 0.2 * Math.PI, 0.8 * Math.PI)
      ctx.stroke()
      break
    case 'veryHappy':
      ctx.arc(cx, cy + 22, 8, 0, Math.PI)
      ctx.closePath()
      ctx.fill()
      break
    case 'surprised':
      ctx.ellipse(cx, cy + 27, 4, 5, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'sad':
      ctx.arc(cx, cy + 34, 7, 1.2 * Math.PI, 1.8 * Math.PI)
      ctx.stroke()
      break
    case 'admiring':
      ctx.arc(cx, cy + 18, 8, 0.15 * Math.PI, 0.85 * Math.PI)
      ctx.stroke()
      break
  }
}
