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
 * Com `ready` (os pixels vindo do worker da cena), o primeiro upload espera por ele: até lá o material já compila e
 * desenha com a textura vazia do three (atrás do Loader), sem pintar nada na thread principal.
 */
export function lazyDataTexture(width: number, height: number, build: () => Uint8Array, ready?: PromiseLike<unknown> | null): THREE.DataTexture {
  const pixels = new LazyPixels(width, height, build)
  const texture = new THREE.DataTexture(null, width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.image = pixels
  texture.flipY = false
  texture.premultiplyAlpha = false
  texture.unpackAlignment = 4
  texture.onUpdate = () => pixels.release()
  if (ready) ready.then(() => void (texture.needsUpdate = true))
  else texture.needsUpdate = true
  return texture
}
