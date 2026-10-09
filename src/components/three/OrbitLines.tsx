import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { apsidalAngle, orbitNormal, orbitPath, type Ring } from '@/lib/universe/orbits'
import { bloomLook, useBloom } from '@/store/bloom'
import { simClock } from '@/store/simClock'

/**
 * Uma elipse por anel, desenhada uma vez (ω em t = 0). A precessão do periélio gira a elipse no próprio plano:
 * por frame, só o grupo gira em torno da normal do plano orbital, sem refazer a geometria.
 */
export function OrbitLines({ rings }: { rings: Ring[] }) {
  const paths = useMemo(() => rings.map((ring) => orbitPath(ring, 0)), [rings])
  const axes = useMemo(() => rings.map((ring) => new THREE.Vector3(...orbitNormal(ring))), [rings])
  const groups = useRef<(THREE.Group | null)[]>([])
  const opacity = bloomLook(useBloom((s) => s.active)).orbit

  useFrame(() => {
    const t = simClock.time
    for (let i = 0; i < rings.length; i++) groups.current[i]?.quaternion.setFromAxisAngle(axes[i], apsidalAngle(rings[i], t))
  })

  return (
    <>
      {paths.map((points, i) => (
        <group
          key={i}
          ref={(g) => {
            groups.current[i] = g
          }}
        >
          <Line points={points} color="#22d3ee" transparent opacity={opacity} lineWidth={1} />
        </group>
      ))}
    </>
  )
}
