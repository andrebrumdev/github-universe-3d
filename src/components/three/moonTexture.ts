import * as THREE from 'three'
import { languageBadge } from './languageIcons'

const WIDTH = 512
const HEIGHT = 256
const REPEATS = 3
const ICON_FRACTION = 0.4

// Cache por linguagem no módulo: luas vivem a sessão inteira e há poucas linguagens,
// então as texturas nunca são descartadas (dispose) de propósito.
const cache = new Map<string, THREE.CanvasTexture>()

function luminance(hex: string): number {
  const c = new THREE.Color(hex)
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
}

export function getMoonTexture(language: string, color: string): THREE.CanvasTexture {
  const key = `${language}|${color}`
  const hit = cache.get(key)
  if (hit) return hit

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (ctx) draw(ctx, language, color)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  cache.set(key, tex)
  return tex
}

function draw(ctx: CanvasRenderingContext2D, language: string, color: string) {
  const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  const base = new THREE.Color(color)
  grad.addColorStop(0, `#${base.clone().multiplyScalar(0.85).getHexString()}`)
  grad.addColorStop(0.5, color)
  grad.addColorStop(1, `#${base.clone().multiplyScalar(0.85).getHexString()}`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  const ink = luminance(color) > 0.6 ? '#1a1f2b' : '#ffffff'
  ctx.fillStyle = ink
  const size = HEIGHT * ICON_FRACTION
  const badge = languageBadge(language)
  const path = badge.kind === 'icon' ? new Path2D(badge.path) : null

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${Math.round(size * (badge.kind === 'text' && badge.text.length > 1 ? 0.8 : 1))}px system-ui, sans-serif`

  for (let i = 0; i < REPEATS; i++) {
    const cx = ((i + 0.5) * WIDTH) / REPEATS
    const cy = HEIGHT / 2
    if (path) {
      ctx.save()
      ctx.translate(cx - size / 2, cy - size / 2)
      ctx.scale(size / 24, size / 24)
      ctx.fill(path)
      ctx.restore()
    } else if (badge.kind === 'text') {
      ctx.fillText(badge.text, cx, cy)
    }
  }
}
