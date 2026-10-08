import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { drawActivityGrid, TEX_H, TEX_W } from './grid'

export function usePlanetTexture(weeks: number[][]): THREE.CanvasTexture {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = TEX_W
    canvas.height = TEX_H
    const ctx = canvas.getContext('2d')
    if (ctx) drawActivityGrid(ctx, weeks)
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
  }, [weeks])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}
