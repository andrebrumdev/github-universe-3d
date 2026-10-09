import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { drawActivityGrid, drawGlowGrid, TEX_H, TEX_W, type GridContext } from './grid'
import { createPlanetMaterial } from './planetGlow'

function gridTexture(weeks: number[][], draw: (ctx: GridContext, weeks: number[][]) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = TEX_W
  canvas.height = TEX_H
  const ctx = canvas.getContext('2d')
  if (ctx) draw(ctx, weeks)
  const tex = new THREE.CanvasTexture(canvas)
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

/** Material do planeta: cor da grade em `map`, brilho só dos quadrados verdes em `emissiveMap` (ver planetGlow). */
export function usePlanetMaterial(weeks: number[][]): THREE.MeshStandardMaterial {
  const material = useMemo(() => createPlanetMaterial(gridTexture(weeks, drawActivityGrid), gridTexture(weeks, drawGlowGrid)), [weeks])
  useEffect(
    () => () => {
      material.map?.dispose()
      material.emissiveMap?.dispose()
      material.dispose()
    },
    [material],
  )
  return material
}
