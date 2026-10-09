import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { drawActivityGrid, drawGlowGrid, packGlowIntoAlpha, TEX_H, TEX_W } from './grid'
import { lazyDataTexture, paintPixels } from './lazyTexture'
import { createPlanetMaterial } from './planetGlow'

/** Pixels do planeta: a grade de cor no rgb e o brilho no alfa, pintados em canvas temporários (ver `packGlowIntoAlpha`). */
function planetPixels(weeks: number[][]): Uint8Array {
  const color = paintPixels(TEX_W, TEX_H, (ctx) => drawActivityGrid(ctx, weeks))
  const glow = paintPixels(TEX_W, TEX_H, (ctx) => drawGlowGrid(ctx, weeks))
  return packGlowIntoAlpha(color, glow, TEX_W, TEX_H)
}

/**
 * Uma textura só por planeta (cor + brilho no alfa), sem canvas guardado: os pixels são gerados dos `weeks` na hora
 * do upload e soltos logo depois (ver `lazyDataTexture`).
 */
function planetTexture(weeks: number[][]): THREE.DataTexture {
  const tex = lazyDataTexture(TEX_W, TEX_H, () => planetPixels(weeks))
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
