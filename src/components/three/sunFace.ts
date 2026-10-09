import { browArch, browBar, EYE, FACE_CENTER, FACE_H, FACE_W, hasLidCap, LID, MOUTH_Y, VIAJANDO } from '@/lib/sun/face'
import type { SunExpression } from '@/lib/sun/sunMachine'

/** Canvas 2× o desenho (512×256 em unidades de desenho): os traços ficam nítidos no close-up. */
export const SUN_TEX_W = 1024
export const SUN_TEX_H = 512
/** Amarelo-ouro do miolo do painel de LED; o âmbar da borda e da metade de baixo vem do shader. */
export const SUN_BODY = '#FFD21A'
/** Traços marrom quase preto, como no emoji do Sphere. */
export const SUN_FEATURE = '#1A1206'
const EYE_WHITE = '#ffffff'
/** Espessuras em unidades de desenho: sobrancelha em barra grossa, boca e pálpebra finas. */
export const BROW_WIDTH = 4
export const MOUTH_WIDTH = 1.8
const LID_WIDTH = 2.4
/** Bochechas do admirando: âmbar claro de LED (não rosa), translúcido sobre o amarelo. */
export const BLUSH = 'rgba(255, 166, 40, 0.5)'

/**
 * Rosto no estilo do Sphere de Las Vegas (referências em `.superpowers/…/sun-reference-sphere*.png`): corpo liso,
 * traços pequenos um pouco abaixo do equador.
 * - viajando (o padrão): olhos em traço grosso, boquinha oval, sem sobrancelha, rosto um pouco à direita; o "Z z z"
 *   é do shader (sobe sem repintar). Piscar não muda nada.
 * - olhos abertos: brancos redondos; sobrancelha por humor (`browBar`: barra nivelada no sério, levantada no
 *   feliz/surpreso, inclinada no triste, macia e curva no admirando, com bochechas âmbar); de olho, em vez da
 *   sobrancelha, uma pálpebra pesada preenchida cobrindo o topo do branco (`LID`). Nunca as duas juntas.
 * As pupilas NÃO vão no canvas: o shader as desenha por cima do branco, onde o olhar manda (`pupilLook`). Piscando,
 * não há branco, então também não há pupila. O rosto fica em u = 0,25 (+z da esfera).
 */
export function drawSunFace(ctx: CanvasRenderingContext2D, expression: SunExpression, eyesClosed: boolean): void {
  const scale = SUN_TEX_W / FACE_W
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.fillStyle = SUN_BODY
  ctx.fillRect(0, 0, FACE_W, FACE_H)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = SUN_FEATURE
  ctx.fillStyle = SUN_FEATURE

  if (expression === 'viajando') {
    const cx = FACE_CENTER[0] + VIAJANDO.offsetX
    const cy = FACE_CENTER[1] + VIAJANDO.offsetY
    ctx.lineWidth = VIAJANDO.dashWidth
    for (const side of [-1, 1]) {
      const ex = cx + side * EYE.dx
      ctx.beginPath()
      ctx.moveTo(ex - VIAJANDO.dashHalf, cy + EYE.y)
      ctx.lineTo(ex + VIAJANDO.dashHalf, cy + EYE.y)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.ellipse(cx, cy + MOUTH_Y - 4, VIAJANDO.mouthRx, VIAJANDO.mouthRy, 0, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  const [cx, cy] = FACE_CENTER
  const ey = cy + EYE.y
  if (expression === 'admiring') {
    ctx.fillStyle = BLUSH
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(cx + side * (EYE.dx + 3), ey + EYE.ry + 3.5, 4.5, 2.2, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  for (const side of [-1, 1] as const) {
    const ex = cx + side * EYE.dx
    if (eyesClosed) {
      ctx.strokeStyle = SUN_FEATURE
      ctx.lineWidth = LID_WIDTH
      ctx.beginPath()
      ctx.moveTo(ex - EYE.rx, ey)
      ctx.quadraticCurveTo(ex, ey + 3, ex + EYE.rx, ey)
      ctx.stroke()
    } else {
      ctx.fillStyle = EYE_WHITE
      ctx.beginPath()
      ctx.ellipse(ex, ey, EYE.rx, EYE.ry, 0, 0, Math.PI * 2)
      ctx.fill()
      if (hasLidCap(expression)) {
        // pálpebra pesada: o topo do olho (um pouco maior que o branco) até uma borda de baixo quase reta
        const r = EYE.rx + LID.overhang
        const yl = ey - EYE.ry + LID.cover * 2 * EYE.ry
        const hx = Math.sqrt(r * r - (yl - ey) * (yl - ey))
        ctx.fillStyle = SUN_FEATURE
        ctx.beginPath()
        ctx.moveTo(ex - hx, yl)
        ctx.arc(ex, ey, r, Math.atan2(yl - ey, -hx), Math.atan2(yl - ey, hx))
        ctx.quadraticCurveTo(ex, yl + LID.sag, ex - hx, yl)
        ctx.closePath()
        ctx.fill()
      }
    }
    const brow = browBar(expression, side)
    if (brow) {
      const [x1, y1, x2, y2] = brow
      const arch = browArch(expression)
      ctx.strokeStyle = SUN_FEATURE
      ctx.lineWidth = BROW_WIDTH
      ctx.beginPath()
      ctx.moveTo(cx + x1, cy + y1)
      if (arch > 0) ctx.quadraticCurveTo(cx + (x1 + x2) / 2, cy + (y1 + y2) / 2 - 2 * arch, cx + x2, cy + y2)
      else ctx.lineTo(cx + x2, cy + y2)
      ctx.stroke()
    }
  }

  const my = cy + MOUTH_Y
  ctx.fillStyle = SUN_FEATURE
  ctx.strokeStyle = SUN_FEATURE
  ctx.lineWidth = MOUTH_WIDTH
  ctx.beginPath()
  switch (expression) {
    case 'serious':
      // meio sorriso torto: o canto direito sobe mais
      ctx.moveTo(cx - 4.5, my - 0.2)
      ctx.quadraticCurveTo(cx + 0.5, my + 2.4, cx + 4.5, my - 1.6)
      ctx.stroke()
      break
    case 'watching':
      // boca neutra, um tracinho levemente inclinado para o lado
      ctx.moveTo(cx - 1.5, my + 0.6)
      ctx.lineTo(cx + 4, my - 0.6)
      ctx.stroke()
      break
    case 'happy':
      ctx.arc(cx, my - 2.5, 4.5, 0.2 * Math.PI, 0.8 * Math.PI)
      ctx.stroke()
      break
    case 'surprised':
      ctx.ellipse(cx, my + 0.5, 1.8, 2.3, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'sad':
      ctx.arc(cx, my + 3.5, 4, 1.2 * Math.PI, 1.8 * Math.PI)
      ctx.stroke()
      break
    case 'admiring':
      ctx.arc(cx, my - 3, 5.5, 0.2 * Math.PI, 0.8 * Math.PI)
      ctx.stroke()
      break
  }
}
