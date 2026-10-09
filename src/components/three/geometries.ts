import * as THREE from 'three'

/** Esferas unitárias compartilhadas; cada mesh usa `scale` para o raio. */
export const PLANET_GEOMETRY_HI = new THREE.SphereGeometry(1, 64, 32)
export const PLANET_GEOMETRY_LO = new THREE.SphereGeometry(1, 32, 16)
export const MOON_GEOMETRY = new THREE.SphereGeometry(1, 24, 12)

/** Atmosfera: casca um pouco maior, vista por dentro, aditiva — contorno ciano que separa o planeta do fundo. */
export const ATMOSPHERE_SCALE = 1.08
export const ATMOSPHERE_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#7dd3fc',
  transparent: true,
  opacity: 0.24,
  side: THREE.BackSide,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

/** Eixo de rotação: haste fina e low-poly (cilindro unitário em y), escalada por planeta. */
export const AXIS_GEOMETRY = new THREE.CylinderGeometry(1, 1, 1, 6, 1)
/** Comprimento do eixo em diâmetros do planeta. */
export const AXIS_LENGTH = 1.5
export const AXIS_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#e6fbff',
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
  toneMapped: false,
})
