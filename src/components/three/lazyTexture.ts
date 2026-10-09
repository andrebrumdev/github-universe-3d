import * as THREE from 'three'

/**
 * Imagem de um DataTexture cujos pixels só existem na hora do upload: `data` os gera ao ser lido (o three lê ao subir
 * a textura) e `release` os solta. Se o three precisar subir de novo — depois de um `dispose` (o StrictMode do dev
 * descarta e reaproveita o material), num contexto restaurado —, eles são gerados outra vez a partir dos dados.
 */
export class LazyPixels {
  readonly width: number
  readonly height: number
  private readonly build: () => Uint8Array
  private pixels: Uint8Array | null = null

  constructor(width: number, height: number, build: () => Uint8Array) {
    this.width = width
    this.height = height
    this.build = build
  }

  get data(): Uint8Array {
    this.pixels ??= this.build()
    return this.pixels
  }

  release(): void {
    this.pixels = null
  }
}

/**
 * Textura RGBA de 8 bits gerada por `build` (de baixo para cima, sem flipY) e solta da memória da CPU logo depois de
 * cada upload: a cópia que importa fica na GPU. Filtros, mipmaps, wrap e espaço de cor ficam com quem chama.
 */
export function lazyDataTexture(width: number, height: number, build: () => Uint8Array): THREE.DataTexture {
  const pixels = new LazyPixels(width, height, build)
  const texture = new THREE.DataTexture(null, width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.image = pixels
  texture.flipY = false
  texture.premultiplyAlpha = false
  texture.unpackAlignment = 4
  texture.onUpdate = () => pixels.release()
  texture.needsUpdate = true
  return texture
}

/** Pinta um canvas 2D temporário e devolve os pixels (RGBA, de cima para baixo); o canvas vai embora com o GC. */
export function paintPixels(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): Uint8ClampedArray {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return new Uint8ClampedArray(width * height * 4)
  paint(ctx)
  return ctx.getImageData(0, 0, width, height).data
}

/** Linhas de cima para baixo (getImageData) → de baixo para cima (DataTexture sem flipY). */
export function flipRows(pixels: ArrayLike<number>, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4)
  const row = width * 4
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < row; i++) out[(height - 1 - y) * row + i] = pixels[y * row + i]
  }
  return out
}
