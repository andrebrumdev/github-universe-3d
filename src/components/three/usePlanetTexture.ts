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
    tex.anisotropy = 4
    return tex
  }, [weeks])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}
