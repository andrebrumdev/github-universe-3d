import * as THREE from 'three'
import { EdgedBoxGeometry } from 'three-low-poly'
import { HAT_BLOCKS, HAT_EYE_BLOCKS, type Block } from '@/lib/ship/geometry'

/** Largura do chanfro, igual em todos os blocos (o "pixel" fica consistente; nada deforma com escala). */
const BEVEL = 0.025

/**
 * Bloco do gorro com as medidas reais: chanfro só no contorno das faces da frente e de trás (axis 'z'),
 * onde o pixel aparece para a câmera; as quinas laterais continuam secas.
 * EdgedBoxGeometry nasce apoiada em y = 0: o translate recentra em Y.
 */
function hatBlockGeometry([w, h, d]: Block['size']): THREE.BufferGeometry {
  return new EdgedBoxGeometry({
    width: w,
    height: h,
    depth: d,
    edge: 'chamfer',
    axis: 'z',
    ends: 'both',
    segments: 1,
    radius: Math.min(BEVEL, Math.min(w, h) * 0.25),
  }).translate(0, -h / 2, 0)
}

/** Olhos: quase planos e sem chanfro, colados na frente da copa. */
function eyeGeometry([w, h, d]: Block['size']): THREE.BufferGeometry {
  return new EdgedBoxGeometry({ width: w, height: h, depth: d, edge: 'sharp' }).translate(0, -h / 2, 0)
}

/**
 * Um pouco de brilho próprio, na mesma cor: atrás do vidro da bolha e com o tone mapping, o laranja do
 * Clawd escurecia para um marrom-salmão; assim ele continua lendo como o #D97757 da arte.
 */
const HAT_GLOW = 0.2

const materials = new Map<string, THREE.MeshStandardMaterial>()
function materialFor(color: string): THREE.MeshStandardMaterial {
  let material = materials.get(color)
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: HAT_GLOW,
      roughness: 0.7,
      flatShading: true,
    })
    materials.set(color, material)
  }
  return material
}

// Construídas uma vez por módulo e nunca descartadas.
const PARTS = [
  ...HAT_BLOCKS.map((block) => ({ block, geometry: hatBlockGeometry(block.size) })),
  ...HAT_EYE_BLOCKS.map((block) => ({ block, geometry: eyeGeometry(block.size) })),
].map(({ block, geometry }) => ({ position: block.position, geometry, material: materialFor(block.color) }))

export function ClawdHat() {
  return (
    <group>
      {PARTS.map(({ position, geometry, material }, i) => (
        <mesh key={i} geometry={geometry} material={material} position={position} />
      ))}
    </group>
  )
}
