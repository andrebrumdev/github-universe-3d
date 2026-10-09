import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { planetReady, takePlanetPixels } from '@/workers/sceneAssets'
import { planetPixels, TEX_H, TEX_W } from './grid'
import { lazyDataTexture } from './lazyTexture'
import { createPlanetMaterial } from './planetGlow'

/**
 * Uma textura só por planeta (cor + brilho no alfa), sem canvas guardado: o primeiro upload espera os pixels do worker
 * da cena (ver `prepareScene`; o material compila enquanto isso, atrás do Loader); sem eles (sem worker, ou num upload
 * novo depois de um dispose) são pintados aqui dos `weeks`, na hora do upload, e soltos logo depois (`lazyDataTexture`).
 */
function planetTexture(weeks: number[][]): THREE.DataTexture {
  const tex = lazyDataTexture(TEX_W, TEX_H, () => takePlanetPixels(weeks) ?? planetPixels(weeks), planetReady(weeks))
  tex.colorSpace = THREE.SRGBColorSpace
  // Sem linha na emenda u = 0/1: a amostragem dá a volta (a coluna 51 encosta na 0 com a folga normal).
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = 8
  return tex
}

/** Material do planeta: cor da grade no rgb do `map`, brilho só dos quadrados verdes no alfa (ver planetGlow). */
export function usePlanetMaterial(weeks: number[][]): THREE.MeshStandardMaterial {
  const material = useMemo(() => createPlanetMaterial(planetTexture(weeks)), [weeks])
  useEffect(
    () => () => {
      material.map?.dispose()
      material.dispose()
    },
    [material],
  )
  return material
}
