import * as THREE from 'three'
import { BLOOM_LOOK } from '@/store/bloom'

const tailMaterial = (color: string, opacity: number) =>
  new THREE.MeshBasicMaterial({
    color,
    vertexColors: true,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })

/**
 * Caudas dos cometas, compartilhadas por todos: íons azulada, fina e reta; poeira esbranquiçada, larga e curva.
 * Aditivas: com o bloom, a opacidade cai (`applyBloomLook`), como as órbitas e as atmosferas.
 */
export const ION_MATERIAL = tailMaterial('#7cc8ff', BLOOM_LOOK.plain.ionTail)
export const DUST_MATERIAL = tailMaterial('#fff1dc', BLOOM_LOOK.plain.dustTail)
