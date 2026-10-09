import * as THREE from 'three'
import { SUN_FACE_REGION, SUN_TEX_H, SUN_TEX_W } from './sunFace'
import { lazyDataTexture } from './lazyTexture'
import { composeSunFace, FACE_ROW, paintSunFaceRegions, SUN_FACE_VARIANTS } from './sunFacePixels'
import { domCanvas } from './texturePixels'

const painted = new Map<string, Uint8Array>()

/** Sem o worker (ou antes dele): pinta o rosto `key` aqui, uma vez por desenho, como o canvas fazia. */
export function paintedSunFace(key: string): Uint8Array {
  let region = painted.get(key)
  if (!region) {
    const variant = SUN_FACE_VARIANTS.find((v) => v.key === key)
    if (!variant) throw new Error(`rosto do sol desconhecido: ${key}`)
    region = paintSunFaceRegions(domCanvas, [variant])[key]
    painted.set(key, region)
  }
  return region
}

/** O pedaço do renderer que a troca usa (o teste passa um falso). */
export interface FaceCopier {
  copyTextureToTexture(src: THREE.Texture, dst: THREE.Texture, srcRegion: null, dstPosition: THREE.Vector2): void
}

/**
 * Textura do rosto do sol sem canvas guardado: troca de expressão = copiar o pedaço já pintado (worker) para dentro
 * da textura na GPU (`copyTextureToTexture`, ~90 KB) — sem repintar e sem subir os 2 MB. A textura inteira (primeiro
 * upload, ou de novo depois de um dispose) é montada do rosto atual e solta depois (lazyDataTexture).
 */
export class SunFaceTexture {
  readonly texture: THREE.DataTexture
  /** Rosto mostrado agora (`faceKey`); o getter dos pixels lê daqui. */
  private readonly shown: { key: string }
  private readonly sources = new Map<string, THREE.DataTexture>()
  private readonly at = new THREE.Vector2(SUN_FACE_REGION.x, FACE_ROW)
  private readonly region: (key: string) => Uint8Array

  /**
   * `ready`: os rostos vindo do worker; o primeiro upload espera por eles (ver lazyDataTexture). Sem ele, sobe já,
   * pintando o rosto `key` aqui se o worker ainda não o tiver.
   */
  constructor(region: (key: string) => Uint8Array, key: string, ready?: PromiseLike<unknown> | null) {
    this.region = region
    const shown = (this.shown = { key })
    const texture = lazyDataTexture(SUN_TEX_W, SUN_TEX_H, () => composeSunFace(region(shown.key)), ready)
    // os mesmos filtros do CanvasTexture de antes (o DataTexture nasce sem mipmaps e com filtro nearest)
    texture.generateMipmaps = true
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.colorSpace = THREE.SRGBColorSpace
    // o rosto fica de lado quando a câmera gira: sobrancelhas e boca continuam nítidas
    texture.anisotropy = 8
    this.texture = texture
  }

  /** Rosto mostrado agora (`faceKey`). */
  get key(): string {
    return this.shown.key
  }

  /** Mostra o rosto `key`: copia o pedaço dele para a textura (nada se já é ele). */
  show(key: string, renderer: FaceCopier): void {
    if (key === this.shown.key) return
    this.shown.key = key
    // ainda sem o primeiro upload: ele já sobe com o rosto atual (copiar agora escreveria na textura vazia do three)
    if (this.texture.version === 0) return
    let source = this.sources.get(key)
    if (!source) {
      const { w, h } = SUN_FACE_REGION
      source = new THREE.DataTexture(this.region(key), w, h, THREE.RGBAFormat, THREE.UnsignedByteType)
      this.sources.set(key, source)
    }
    renderer.copyTextureToTexture(source, this.texture, null, this.at)
  }

  dispose(): void {
    this.texture.dispose()
    this.sources.clear()
  }
}
