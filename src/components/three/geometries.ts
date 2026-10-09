import * as THREE from 'three'
import { BLOOM_LOOK } from '@/store/bloom'

/** Esferas unitárias compartilhadas; cada mesh usa `scale` para o raio. */
export const PLANET_GEOMETRY_HI = new THREE.SphereGeometry(1, 64, 32)
export const PLANET_GEOMETRY_LO = new THREE.SphereGeometry(1, 32, 16)
export const MOON_GEOMETRY = new THREE.SphereGeometry(1, 24, 12)

/**
 * Atmosfera: casca um pouco maior, vista por dentro, aditiva — contorno ciano que separa o planeta do fundo.
 * É o molde: cada planeta usa uma cópia (`createAtmosphereMaterial`) que esquenta no periélio e lê daqui a cor e a
 * opacidade do visual atual (o `applyBloomLook` muda esta).
 */
export const ATMOSPHERE_SCALE = 1.08
export const ATMOSPHERE_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#7dd3fc',
  transparent: true,
  opacity: BLOOM_LOOK.plain.atmosphere,
  side: THREE.BackSide,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})
