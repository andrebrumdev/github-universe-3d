import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { faceKey } from '@/lib/sun/face'
import { SUN_EXPRESSIONS } from '@/lib/sun/sunMachine'
import { drawSunFace, SUN_FACE_REGION, SUN_TEX_H, SUN_TEX_W } from './sunFace'
import { composeSunFace, FACE_ROW, paintSunFaceRegions, SUN_FACE_VARIANTS } from './sunFacePixels'
import { SunFaceTexture, type FaceCopier } from './sunFaceTexture'
import type { MakeCanvas } from './texturePixels'

const { x: RX, y: RY, w: RW, h: RH } = SUN_FACE_REGION
/** Igualdade byte a byte (o toEqual de 2 MB é lento demais). */
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i])
const SCALE = SUN_TEX_W / 512

/** Caixa (unidades de desenho) que os traços ocupam: pontos dos caminhos mais raio e meia espessura do traço. */
function drawingBox(expression: (typeof SUN_EXPRESSIONS)[number], closed: boolean): [number, number, number, number] {
  let box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity]
  const add = (x: number, y: number, pad: number) => {
    box = [Math.min(box[0], x - pad), Math.min(box[1], y - pad), Math.max(box[2], x + pad), Math.max(box[3], y + pad)]
  }
  const state: Record<string, unknown> = { lineWidth: 1 }
  let path: [number, number, number][] = []
  const ctx = new Proxy(state, {
    get(t, k: string) {
      if (k in t) return t[k]
      if (k === 'beginPath') return () => (path = [])
      if (k === 'moveTo' || k === 'lineTo') return (x: number, y: number) => path.push([x, y, 0])
      if (k === 'quadraticCurveTo') return (cx: number, cy: number, x: number, y: number) => path.push([cx, cy, 0], [x, y, 0])
      if (k === 'arc') return (x: number, y: number, r: number) => path.push([x, y, r])
      if (k === 'ellipse') return (x: number, y: number, rx: number, ry: number) => path.push([x, y, Math.max(rx, ry)])
      if (k === 'fill') return () => path.forEach(([x, y, r]) => add(x, y, r))
      if (k === 'stroke') return () => path.forEach(([x, y, r]) => add(x, y, r + (t.lineWidth as number) / 2))
      return () => undefined
    },
    set(t, k: string, v) {
      t[k] = v
      return true
    },
  })
  drawSunFace(ctx as unknown as CanvasRenderingContext2D, expression, closed)
  return box
}

/** Canvas falso: grava o getImageData e devolve linhas numeradas (byte = linha da imagem, de cima para baixo). */
function fakeCanvas() {
  const reads: number[][] = []
  let draws = 0
  const make: MakeCanvas = (w, h) => {
    expect([w, h]).toEqual([SUN_TEX_W, SUN_TEX_H])
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(t, k: string) {
        if (k in t) return t[k]
        if (k === 'setTransform') return () => draws++
        if (k === 'getImageData')
          return (x: number, y: number, rw: number, rh: number) => {
            reads.push([x, y, rw, rh])
            const data = new Uint8ClampedArray(rw * rh * 4)
            for (let row = 0; row < rh; row++) data.fill(row, row * rw * 4, (row + 1) * rw * 4)
            return { data }
          }
        return () => undefined
      },
      set(t, k: string, v) {
        t[k] = v
        return true
      },
    })
    return { getContext: () => ctx } as unknown as HTMLCanvasElement
  }
  return { make, reads, draws: () => draws }
}

describe('rostos do sol pré-pintados', () => {
  it('um rosto por desenho diferente: 8 expressões, e piscando nas que têm olhos (15 ao todo)', () => {
    const keys = SUN_FACE_VARIANTS.map((v) => v.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toHaveLength(15)
    for (const e of SUN_EXPRESSIONS) expect(keys).toContain(faceKey(e, false))
    expect(keys).toContain(faceKey('tonto', true))
    expect(keys).not.toContain('viajando:closed')
  })

  it('todo traço de todo rosto fica dentro do pedaço trocado, com folga para o antisserrilhado', () => {
    const margin = 6
    for (const v of SUN_FACE_VARIANTS) {
      const [x0, y0, x1, y1] = drawingBox(v.expression, v.closed)
      expect(x0 * SCALE, v.key).toBeGreaterThanOrEqual(RX + margin * SCALE)
      expect(y0 * SCALE, v.key).toBeGreaterThanOrEqual(RY + margin * SCALE)
      expect(x1 * SCALE, v.key).toBeLessThanOrEqual(RX + RW - margin * SCALE)
      expect(y1 * SCALE, v.key).toBeLessThanOrEqual(RY + RH - margin * SCALE)
    }
  })

  it('paintSunFaceRegions lê só o pedaço do rosto de cada desenho, de baixo para cima', () => {
    const canvas = fakeCanvas()
    const regions = paintSunFaceRegions(canvas.make)
    expect(Object.keys(regions).sort()).toEqual(SUN_FACE_VARIANTS.map((v) => v.key).sort())
    expect(canvas.draws()).toBe(SUN_FACE_VARIANTS.length)
    for (const r of canvas.reads) expect(r).toEqual([RX, RY, RW, RH])
    const region = regions['happy:open']
    expect(region).toHaveLength(RW * RH * 4)
    // a primeira linha guardada é a última lida (de baixo para cima)
    expect(region[0]).toBe(RH - 1)
    expect(region[(RH - 1) * RW * 4]).toBe(0)
  })

  it('composeSunFace: corpo amarelo em volta e o pedaço do rosto no lugar (linha de baixo para cima)', () => {
    const region = new Uint8Array(RW * RH * 4)
    for (let row = 0; row < RH; row++) region.fill(row + 1, row * RW * 4, (row + 1) * RW * 4)
    const full = composeSunFace(region)
    expect(full).toHaveLength(SUN_TEX_W * SUN_TEX_H * 4)
    const px = (x: number, row: number) => Array.from(full.subarray((row * SUN_TEX_W + x) * 4, (row * SUN_TEX_W + x) * 4 + 4))
    expect(px(0, 0)).toEqual([0xff, 0xd2, 0x1a, 255])
    expect(px(RX - 1, FACE_ROW)).toEqual([0xff, 0xd2, 0x1a, 255])
    expect(px(RX, FACE_ROW)).toEqual([1, 1, 1, 1])
    expect(px(RX + RW - 1, FACE_ROW + RH - 1)).toEqual([RH, RH, RH, RH])
    expect(px(RX + RW, FACE_ROW + RH - 1)).toEqual([0xff, 0xd2, 0x1a, 255])
    expect(FACE_ROW).toBe(SUN_TEX_H - RY - RH)
  })
})

describe('SunFaceTexture', () => {
  const regionOf = (key: string) => new Uint8Array(RW * RH * 4).fill(key.length)
  function copier() {
    const copies: { src: THREE.Texture; at: [number, number] }[] = []
    const renderer: FaceCopier = { copyTextureToTexture: (src, _dst, _r, at) => void copies.push({ src, at: [at.x, at.y] }) }
    return { renderer, copies }
  }

  it('textura RGBA de baixo para cima com os filtros do CanvasTexture de antes', () => {
    const { texture } = new SunFaceTexture(regionOf, 'viajando:open')
    expect([texture.image.width, texture.image.height]).toEqual([SUN_TEX_W, SUN_TEX_H])
    expect(texture.flipY).toBe(false)
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(texture.generateMipmaps).toBe(true)
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter)
    expect(texture.magFilter).toBe(THREE.LinearFilter)
    expect(texture.anisotropy).toBe(8)
  })

  it('trocar de rosto copia só o pedaço, uma vez por troca, no lugar certo', () => {
    const face = new SunFaceTexture(regionOf, 'viajando:open')
    const { renderer, copies } = copier()
    face.show('viajando:open', renderer)
    expect(copies).toHaveLength(0)
    face.show('happy:open', renderer)
    face.show('happy:open', renderer)
    face.show('happy:closed', renderer)
    expect(copies.map((c) => c.at)).toEqual([
      [RX, FACE_ROW],
      [RX, FACE_ROW],
    ])
    const src = copies[0].src.image as { data: Uint8Array; width: number; height: number }
    expect(sameBytes(src.data, regionOf('happy:open'))).toBe(true)
    expect([src.width, src.height]).toEqual([RW, RH])
    expect(face.key).toBe('happy:closed')
  })

  it('subida inteira (primeira, ou depois de um dispose) monta o rosto mostrado agora, e solta os pixels depois', () => {
    const face = new SunFaceTexture(regionOf, 'viajando:open')
    const { renderer } = copier()
    face.show('surprised:open', renderer)
    const image = face.texture.image as unknown as { data: Uint8Array }
    expect(sameBytes(image.data, composeSunFace(regionOf('surprised:open')))).toBe(true)
    face.texture.onUpdate?.(face.texture)
    face.show('sad:closed', renderer)
    expect(sameBytes(image.data, composeSunFace(regionOf('sad:closed')))).toBe(true)
  })

  it('antes dos rostos do worker chegarem: nenhuma cópia (a textura vazia do three não é a nossa); o primeiro upload já sobe o rosto mais novo', async () => {
    let release!: () => void
    const ready = new Promise<void>((r) => (release = r))
    const face = new SunFaceTexture(regionOf, 'viajando:open', ready)
    const { renderer, copies } = copier()
    face.show('happy:open', renderer)
    face.show('sad:closed', renderer)
    expect(copies).toHaveLength(0)
    expect(face.texture.version).toBe(0)
    release()
    await ready
    await Promise.resolve()
    expect(face.texture.version).toBeGreaterThan(0)
    const image = face.texture.image as unknown as { data: Uint8Array }
    expect(sameBytes(image.data, composeSunFace(regionOf('sad:closed')))).toBe(true)
    face.show('happy:open', renderer)
    expect(copies).toHaveLength(1)
  })
})
