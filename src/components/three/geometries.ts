import * as THREE from 'three'

/** Esferas unitárias compartilhadas; cada mesh usa `scale` para o raio. */
export const PLANET_GEOMETRY_HI = new THREE.SphereGeometry(1, 64, 32)
export const PLANET_GEOMETRY_LO = new THREE.SphereGeometry(1, 32, 16)
export const MOON_GEOMETRY = new THREE.SphereGeometry(1, 24, 12)
