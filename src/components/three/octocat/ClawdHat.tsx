import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EdgedBoxGeometry } from 'three-low-poly'
import { CLAWD, HAT_BLOCKS, HAT_EYE_BLOCKS, type Block } from '@/lib/ship/geometry'
import { CLAWD_HOP_SECONDS, clawdHop } from '@/lib/ship/play'
import { PartProxy } from './PartProxy'

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

/** Pés do Clawd (o fundo das perninhas, na cabeça): o pulinho amassa e estica a partir daqui. */
const FEET_Y = Math.min(...HAT_BLOCKS.map(({ position, size }) => position[1] - size[1] / 2))
const BODY_CENTER: [number, number, number] = [0, CLAWD.body.bottom + CLAWD.body.height / 2, 0]

interface ClawdHatProps {
  /** Muda a cada toque no Clawd (modo de foco): ele agacha, pula e amassa ao pousar nas 4 perninhas. */
  hop?: number
  /** Área de toque do Clawd (modo de foco). */
  proxy?: boolean
}

export function ClawdHat({ hop = 0, proxy = false }: ClawdHatProps) {
  const pivot = useRef<THREE.Group>(null)
  const lastHop = useRef(hop)
  const hopStart = useRef<number | null>(null)
  useFrame(({ clock }) => {
    if (hop !== lastHop.current) {
      lastHop.current = hop
      hopStart.current = clock.elapsedTime
    }
    const g = pivot.current
    if (!g || hopStart.current === null) return
    const t = clock.elapsedTime - hopStart.current
    if (t >= CLAWD_HOP_SECONDS) hopStart.current = null
    const { lift, squash } = clawdHop(t)
    g.position.y = FEET_Y + lift
    // o volume quase não muda: amassado, fica mais largo
    const side = 1 / Math.sqrt(squash)
    g.scale.set(side, squash, side)
  })
  return (
    <group ref={pivot} position={[0, FEET_Y, 0]} userData={{ part: 'clawd' }}>
      <group position={[0, -FEET_Y, 0]}>
        {PARTS.map(({ position, geometry, material }, i) => (
          <mesh key={i} geometry={geometry} material={material} position={position} />
        ))}
        {proxy && <PartProxy part="clawd" radius={CLAWD.body.width / 2} position={BODY_CENTER} />}
      </group>
    </group>
  )
}
