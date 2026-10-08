import * as THREE from 'three'
import { EdgedBoxGeometry } from 'three-low-poly'
import { HAT_BLOCKS, HAT_EYE_BLOCKS, type Block } from '@/lib/ship/geometry'

/** Largura do chanfro (máxima): peças pequenas usam no máximo um quarto da menor dimensão. */
const BEVEL = 0.02

/** Peça do Clawd com as medidas reais e chanfro; EdgedBoxGeometry nasce apoiada em y = 0: o translate recentra em Y. */
function partGeometry([w, h, d]: Block['size']): THREE.BufferGeometry {
  return new EdgedBoxGeometry({
    width: w,
    height: h,
    depth: d,
    edge: 'chamfer',
    segments: 1,
    radius: Math.min(BEVEL, Math.min(w, h, d) * 0.25),
  }).translate(0, -h / 2, 0)
}

/** Olhos: quase planos e sem chanfro, colados na frente do corpo. */
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
  ...HAT_BLOCKS.map((block) => ({ block, geometry: partGeometry(block.size) })),
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
