import * as THREE from 'three'
import { moonReady, takeMoonPixels } from '@/workers/sceneAssets'
import { lazyDataTexture } from './lazyTexture'
import { MOON_TEX_H, MOON_TEX_W, moonPixels } from './moonPaint'

// Cache por linguagem no módulo: luas vivem a sessão inteira e há poucas linguagens,
// então as texturas nunca são descartadas (dispose) de propósito. Sem canvas guardado: no primeiro upload os pixels
// vêm prontos do worker da cena; sem eles são pintados na hora do upload, e soltos logo depois (ver
// `lazyDataTexture`); uma cena nova (outro renderer) os pinta de novo.
const cache = new Map<string, THREE.DataTexture>()

export function getMoonTexture(language: string, color: string): THREE.DataTexture {
  const key = `${language}|${color}`
  const hit = cache.get(key)
  if (hit) return hit

  const tex = lazyDataTexture(MOON_TEX_W, MOON_TEX_H, () => takeMoonPixels(language, color) ?? moonPixels(language, color), moonReady(language, color))
  // os mesmos filtros do CanvasTexture de antes (o DataTexture nasce sem mipmaps e com filtro nearest)
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  cache.set(key, tex)
  return tex
}
