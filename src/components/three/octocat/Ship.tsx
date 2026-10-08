import { useRef } from 'react'
import * as THREE from 'three'
import { COLORS, CONTRIBUTION_COLORS, DOME, HEADLIGHT, HULL, LOWER_FIN, SQUARES_X, UPPER_FIN } from '@/lib/ship/geometry'

const HULL_GEOMETRY = new THREE.SphereGeometry(1, 48, 24)
const DOME_GEOMETRY = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2)
const FLAME_LENGTH = 0.9
const FLAME_GEOMETRY = new THREE.ConeGeometry(0.22, FLAME_LENGTH, 16).translate(0, FLAME_LENGTH / 2, 0)

function finGeometry(points: [number, number][], mirror: boolean): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(mirror ? -x : x, y)))
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false })
  geometry.translate(0, 0, -0.04)
  return geometry
}

const FIN_GEOMETRIES = [UPPER_FIN, LOWER_FIN].flatMap((fin) => [finGeometry(fin, false), finGeometry(fin, true)])

/** Ponto da superfície frontal do casco na altura y, para encostar peças nele. */
function hullFrontZ(x: number, y: number): number {
  const k = 1 - (x / HULL.rx) ** 2 - (y / HULL.ry) ** 2
  return HULL.rz * Math.sqrt(Math.max(0, k))
}

export function Ship({ thrusterLevel }: { thrusterLevel: number }) {
  const flame = useRef<THREE.Mesh>(null)

  return (
    <group>
      <mesh geometry={HULL_GEOMETRY} scale={[HULL.rx, HULL.ry, HULL.rz]}>
        <meshStandardMaterial color={COLORS.ship} roughness={0.45} metalness={0.15} />
      </mesh>

      {/* faixa clara em volta do casco */}
      <mesh position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[HULL.rx, HULL.rz, 1]}>
        <torusGeometry args={[1, 0.035, 8, 64]} />
        <meshStandardMaterial color={COLORS.stripe} roughness={0.5} />
      </mesh>

      {/* quadradinhos de contribuição na frente da faixa */}
      {SQUARES_X.map((x, i) => {
        const z = hullFrontZ(x, 0.03) + 0.03
        const yaw = Math.atan2(x / HULL.rx ** 2, z / HULL.rz ** 2)
        return (
          <mesh key={i} position={[x, 0.03, z]} rotation={[0, yaw, 0]}>
            <boxGeometry args={[0.1, 0.1, 0.04]} />
            <meshStandardMaterial color={CONTRIBUTION_COLORS[i]} emissive={CONTRIBUTION_COLORS[i]} emissiveIntensity={0.35} />
          </mesh>
        )
      })}

      {/* farol */}
      <mesh position={[HEADLIGHT[0], HEADLIGHT[1], hullFrontZ(HEADLIGHT[0], HEADLIGHT[1]) + 0.02]}>
        <sphereGeometry args={[0.08, 16, 8]} />
        <meshStandardMaterial color={COLORS.headlight} emissive={COLORS.headlight} emissiveIntensity={1.2} />
      </mesh>

      {FIN_GEOMETRIES.map((geometry, i) => (
        <mesh key={i} geometry={geometry}>
          <meshStandardMaterial color={COLORS.ship} roughness={0.5} metalness={0.1} />
        </mesh>
      ))}

      {/* propulsor atrás do casco */}
      <mesh
        ref={flame}
        geometry={FLAME_GEOMETRY}
        position={[0, 0, -HULL.rz + 0.05]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1, Math.max(thrusterLevel, 0.001), 1]}
        visible={thrusterLevel > 0.01}
      >
        <meshBasicMaterial color={COLORS.thruster} transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* cúpula de vidro */}
      <mesh geometry={DOME_GEOMETRY} position={[0, DOME.base[1], 0]} scale={[DOME.rx, DOME.ry, DOME.rz]}>
        <meshStandardMaterial
          color={COLORS.dome}
          transparent
          opacity={0.16}
          roughness={0.1}
          metalness={0.1}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
