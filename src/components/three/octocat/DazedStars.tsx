import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { StarGeometry } from 'three-low-poly'
import { dazedStars } from '@/lib/crash/timeline'
import { COLORS } from '@/lib/ship/geometry'
import { crashClock } from '@/store/crash'

/** Estrelinhas (coordenadas do piloto): quantas, altura da roda (entre as orelhas e o Clawd), raio e tamanho. */
const COUNT = 4
const RING_Y = 2.05
const RING_RADIUS = 0.85
const STAR_SIZE = 0.15
/** A roda inclina um pouco para a frente (vê-se o círculo, não uma linha). */
const RING_TILT = 0.35

/** Estrela de 5 pontas extrudada, fina: low-poly (22 faces), centrada na espessura. */
const STAR_GEOMETRY = new StarGeometry({ outerRadius: 1, innerRadius: 0.45, depth: 0.3 }).translate(0, 0, -0.15)

/** Amarelo-claro dos faróis, brilhando; a opacidade some no fim (uma nave só: um material compartilhado). */
const STAR_MATERIAL = new THREE.MeshStandardMaterial({
  color: COLORS.headlight,
  emissive: COLORS.headlight,
  emissiveIntensity: 0.9,
  flatShading: true,
  transparent: true,
  toneMapped: false,
})

/**
 * Octocat tonto depois da trombada: estrelinhas amarelas girando em volta da cabeça (no referencial do piloto). Giram
 * DAZED_SPIN s e somem, no relógio da trombada (`crashClock`).
 */
export function DazedStars() {
  const ring = useRef<THREE.Group>(null)
  const stars = useRef<(THREE.Mesh | null)[]>([])

  useFrame(() => {
    const { opacity, angle } = dazedStars(crashClock.since)
    STAR_MATERIAL.opacity = opacity
    if (ring.current) {
      ring.current.visible = opacity > 0
      ring.current.rotation.y = angle
    }
    // de frente para quem vê (desfaz o giro da roda), girando em torno de si, e pulsando de leve
    stars.current.forEach((star, i) => {
      if (!star) return
      star.rotation.set(-RING_TILT, -angle, angle * 1.7 + i, 'YXZ')
      star.scale.setScalar(STAR_SIZE * (0.85 + 0.15 * Math.sin(angle * 2 + i * 1.3)))
    })
  })

  return (
    <group position={[0, RING_Y, 0]} rotation={[RING_TILT, 0, 0]}>
      <group ref={ring}>
        {Array.from({ length: COUNT }, (_, i) => {
          const a = (i / COUNT) * Math.PI * 2
          return (
            <mesh
              key={i}
              ref={(m) => {
                stars.current[i] = m
              }}
              geometry={STAR_GEOMETRY}
              material={STAR_MATERIAL}
              position={[Math.cos(a) * RING_RADIUS, 0.08 * Math.sin(a * 2), Math.sin(a) * RING_RADIUS]}
              scale={STAR_SIZE}
            />
          )
        })}
      </group>
    </group>
  )
}
