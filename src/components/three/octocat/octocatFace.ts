import type { OctocatExpression } from '@/lib/octocat/expression'
import { COLORS, FACE_PATCH } from '@/lib/ship/geometry'

/**
 * Rosto do Octocat clássico, desenhado em coordenadas do SVG do piloto (100 px = 1 unidade, y para baixo).
 * O canvas cobre a caixa do pedaço curvado da frente da cabeça (FACE_PATCH); fora da mancha pêssego e dos
 * bigodes ele fica transparente, e o material descarta esses pixels (alphaTest).
 */
const BOX = {
  x: 200 - FACE_PATCH.rx * 100,
  y: 312 - (FACE_PATCH.center[1] + FACE_PATCH.ry) * 100,
  w: FACE_PATCH.rx * 200,
  h: FACE_PATCH.ry * 200,
}
export const FACE_TEX_W = 1024
export const FACE_TEX_H = Math.round((FACE_TEX_W * BOX.h) / BOX.w)

/**
 * Mancha pêssego: larga nas bochechas, queixo arredondado e o alto ondulado (sobe sobre cada olho e desce
 * um pouco no meio), com a testa escura acima até a aba do gorro. Cabe na elipse FACE de geometry.ts
 * (cx 200, cy 210, rx 55, ry 36).
 */
const SKIN_PATH =
  'M156 181 C165 172 184 171 200 177 C216 171 235 172 244 181 C255 191 257 207 254 222 C250 238 228 246 200 246 C172 246 150 238 146 222 C143 207 145 191 156 181 Z'

const LEFT_EYE = { cx: 176, cy: 194, tilt: 0.18 }
const RIGHT_EYE = { cx: 224, cy: 194, tilt: -0.18 }
type Eye = typeof LEFT_EYE

/** Lado de fora do olho: −1 à esquerda da tela, +1 à direita. */
const outward = (eye: Eye) => Math.sign(eye.cx - 200)

interface OpenEye {
  rx: number
  ry: number
  /** Íris: deslocamento a partir do centro do olho e raios. */
  iris: { dx: number; dy: number; rx: number; ry: number }
}

const NORMAL_EYE: OpenEye = { rx: 12.5, ry: 16, iris: { dx: 0, dy: 5, rx: 7, ry: 10 } }

function withEye(ctx: CanvasRenderingContext2D, eye: Eye, draw: () => void): void {
  ctx.save()
  ctx.translate(eye.cx, eye.cy)
  ctx.rotate(eye.tilt)
  draw()
  ctx.restore()
}

function line(ctx: CanvasRenderingContext2D, d: string, width: number, color: string = COLORS.faceLine): void {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(new Path2D(d))
}

/** Olho aberto: branco esverdeado, íris marrom com brilho, traço de pálpebra por cima e cílio no canto de fora. */
function openEye(ctx: CanvasRenderingContext2D, eye: Eye, shape: OpenEye, irisDx = 0): void {
  const side = outward(eye)
  withEye(ctx, eye, () => {
    const { rx, ry, iris } = shape
    const sclera = new Path2D()
    sclera.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.sclera
    ctx.fill(sclera)

    ctx.save()
    ctx.clip(sclera)
    const [ix, iy] = [iris.dx + irisDx, iris.dy]
    ctx.fillStyle = COLORS.iris
    ctx.beginPath()
    ctx.ellipse(ix, iy, iris.rx, iris.ry, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.arc(ix + iris.rx * 0.35, iy - iris.ry * 0.45, Math.max(1.8, iris.rx * 0.36), 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // pálpebra: traço sobre a borda de cima, com o cílio no canto de fora
    ctx.strokeStyle = COLORS.faceLine
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, Math.PI * 1.08, Math.PI * 1.92)
    ctx.stroke()
    line(ctx, `M${side * rx * 0.75} ${-ry * 0.55} L${side * (rx + 4)} ${-ry * 0.8}`, 1.8)
    // traço de baixo, curto, saindo do canto de fora (como no desenho clássico)
    line(ctx, `M${side * rx * 0.55} ${ry * 0.82} Q${side * (rx + 2)} ${ry * 0.55} ${side * (rx + 5)} ${ry * 0.6}`, 1.4)
  })
}

/** Olho tonto (trombada): o branco do olho com uma espiral no lugar da íris, como nos desenhos animados. */
function dizzyEye(ctx: CanvasRenderingContext2D, eye: Eye, turn: 1 | -1): void {
  withEye(ctx, eye, () => {
    const [rx, ry] = [NORMAL_EYE.rx, NORMAL_EYE.ry]
    ctx.fillStyle = COLORS.sclera
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
    // espiral de Arquimedes, de dentro para fora, achatada na forma do olho; os dois olhos giram ao contrário
    ctx.strokeStyle = COLORS.iris
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.beginPath()
    const turns = 2.6
    for (let i = 0; i <= 80; i++) {
      const u = i / 80
      const a = turn * u * turns * Math.PI * 2
      const r = 0.85 * u
      ctx.lineTo(Math.cos(a) * r * rx, Math.sin(a) * r * ry)
    }
    ctx.stroke()
    ctx.strokeStyle = COLORS.faceLine
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, Math.PI * 1.08, Math.PI * 1.92)
    ctx.stroke()
  })
}

/** Olho fechado: arco de riso (`up`, ∩) ou pálpebra baixada (∪), com cílio. */
function closedEye(ctx: CanvasRenderingContext2D, eye: Eye, up: boolean): void {
  const side = outward(eye)
  withEye(ctx, eye, () => {
    const [y0, yc] = up ? [6, -9] : [-1, 7]
    line(ctx, `M-11 ${y0} Q0 ${yc} 11 ${y0}`, 3.2)
    line(ctx, `M${side * 10} ${y0} L${side * 15} ${y0 - (up ? 3 : 4)}`, 2)
  })
}

function nose(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = COLORS.iris
  ctx.beginPath()
  ctx.ellipse(200, 211, 4.6, 2.7, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** Boca aberta: interior roxo-escuro com língua rosa no fundo e contorno fino. */
function openMouth(ctx: CanvasRenderingContext2D, d: string, tongue: { cx: number; cy: number; rx: number; ry: number } | null): void {
  const mouth = new Path2D(d)
  ctx.fillStyle = COLORS.mouth
  ctx.fill(mouth)
  if (tongue) {
    ctx.save()
    ctx.clip(mouth)
    ctx.fillStyle = COLORS.tongue
    ctx.beginPath()
    ctx.ellipse(tongue.cx, tongue.cy, tongue.rx, tongue.ry, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.strokeStyle = COLORS.faceLine
  ctx.lineWidth = 1.4
  ctx.lineJoin = 'round'
  ctx.stroke(mouth)
}

/** Covinhas nos cantos da boca. */
function dimples(ctx: CanvasRenderingContext2D, left: number, right: number, y: number): void {
  line(ctx, `M${left - 4} ${y - 3} Q${left - 1} ${y + 1} ${left + 1} ${y}`, 1.5)
  line(ctx, `M${right + 4} ${y - 3} Q${right + 1} ${y + 1} ${right - 1} ${y}`, 1.5)
}

function blush(ctx: CanvasRenderingContext2D, sides: (-1 | 1)[]): void {
  ctx.globalAlpha = 0.5
  ctx.fillStyle = COLORS.blush
  for (const side of sides) {
    ctx.beginPath()
    ctx.ellipse(200 + side * 38, 215, 9, 5, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/** Bigodes pintados: da borda da bochecha para fora (seguem nos bigodes 3D, que passam da silhueta). */
function whiskers(ctx: CanvasRenderingContext2D): void {
  for (const side of [-1, 1]) {
    const x = (dx: number) => 200 + side * dx
    line(ctx, `M${x(46)} 211 L${x(63)} 206`, 1.6, COLORS.whisker)
    line(ctx, `M${x(46)} 219 L${x(63)} 221`, 1.6, COLORS.whisker)
  }
}

const SMILE = 'M182 218 Q200 226 218 218 Q217 243 200 244 Q183 243 182 218 Z'
const SMILE_TONGUE = { cx: 200, cy: 241, rx: 10, ry: 6.5 }

function drawExpression(ctx: CanvasRenderingContext2D, expression: OctocatExpression, blinking: boolean): void {
  switch (expression) {
    case 'neutral':
      for (const eye of [LEFT_EYE, RIGHT_EYE]) {
        if (blinking) closedEye(ctx, eye, false)
        else openEye(ctx, eye, NORMAL_EYE)
      }
      nose(ctx)
      openMouth(ctx, SMILE, SMILE_TONGUE)
      dimples(ctx, 182, 218, 218)
      break
    case 'happy':
      closedEye(ctx, LEFT_EYE, true)
      closedEye(ctx, RIGHT_EYE, true)
      blush(ctx, [-1, 1])
      nose(ctx)
      openMouth(ctx, 'M176 215 Q200 225 224 215 Q222 243 200 243 Q178 243 176 215 Z', { cx: 200, cy: 240, rx: 12, ry: 7 })
      dimples(ctx, 176, 224, 215)
      break
    case 'wink':
      openEye(ctx, LEFT_EYE, NORMAL_EYE, 2)
      closedEye(ctx, RIGHT_EYE, true)
      blush(ctx, [1])
      nose(ctx)
      // sorriso de lado com a ponta da língua para fora
      openMouth(ctx, 'M184 220 Q202 229 220 216 Q216 236 202 237 Q188 236 184 220 Z', { cx: 206, cy: 236, rx: 8, ry: 6 })
      dimples(ctx, 184, 220, 218)
      break
    case 'surprised': {
      const wide: OpenEye = { rx: 14, ry: 19, iris: { dx: 0, dy: 3, rx: 4.5, ry: 6 } }
      openEye(ctx, LEFT_EYE, wide)
      openEye(ctx, RIGHT_EYE, wide)
      nose(ctx)
      openMouth(ctx, 'M200 222 C208 222 210 230 210 234 C210 241 205 244 200 244 C195 244 190 241 190 234 C190 230 192 222 200 222 Z', null)
      break
    }
    case 'dizzy':
      // tonto: olhos em espiral e boca ondulada, meio aberta
      dizzyEye(ctx, LEFT_EYE, 1)
      dizzyEye(ctx, RIGHT_EYE, -1)
      nose(ctx)
      openMouth(ctx, 'M183 226 Q188 220 194 226 Q200 232 206 226 Q212 220 217 226 Q214 237 200 237 Q186 237 183 226 Z', {
        cx: 200,
        cy: 236,
        rx: 8,
        ry: 4,
      })
      line(ctx, 'M183 226 Q188 220 194 226 Q200 232 206 226 Q212 220 217 226', 2)
      break
    case 'thinking': {
      // olhando para cima e para o lado das bolhas, boquinha fechada e puxada para o canto ("hmm")
      const lookingUp: OpenEye = { rx: 12.5, ry: 16, iris: { dx: 4.5, dy: -5, rx: 6.5, ry: 9 } }
      openEye(ctx, LEFT_EYE, lookingUp)
      openEye(ctx, RIGHT_EYE, lookingUp)
      nose(ctx)
      line(ctx, 'M196 229 Q204 226 213 225', 2.6)
      line(ctx, 'M213 225 Q216 224 217 221', 1.8)
      break
    }
  }
}

/**
 * Desenha o rosto: limpa (transparente), pinta a mancha pêssego e os traços da expressão por cima.
 * `blinking` só vale para o neutro (olhos fechados por um instante).
 */
export function drawOctocatFace(ctx: CanvasRenderingContext2D, expression: OctocatExpression, blinking: boolean): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, FACE_TEX_W, FACE_TEX_H)
  const s = FACE_TEX_W / BOX.w
  ctx.setTransform(s, 0, 0, s, -BOX.x * s, -BOX.y * s)
  ctx.globalAlpha = 1

  ctx.fillStyle = COLORS.skin
  ctx.fill(new Path2D(SKIN_PATH))
  whiskers(ctx)
  drawExpression(ctx, expression, blinking)

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
}
