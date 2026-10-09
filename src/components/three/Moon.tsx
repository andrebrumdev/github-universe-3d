import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useCursor } from '@react-three/drei'
import type * as THREE from 'three'
import type { Vec3 } from '@/lib/universe/orbits'
import { moonPosition, type MoonSpec } from '@/lib/universe/planets'
import { simClock } from '@/store/simClock'
import { useUniverse } from '@/store/universe'
import { MOON_GEOMETRY } from './geometries'
import { getMoonTexture } from './moonTexture'

export function Moon({ spec, planet }: { spec: MoonSpec; planet: string }) {
  const mesh = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  const map = useMemo(() => getMoonTexture(spec.language, spec.color), [spec.language, spec.color])
  const select = useUniverse((s) => s.select)
  const pos = useMemo<Vec3>(() => [0, 0, 0], [])

  // Órbita de Kepler em volta do planeta (no plano do equador, inclinada): rápida no periapse, lenta na apoapse.
  useFrame(() => {
    moonPosition(spec, simClock.time, pos)
    mesh.current?.position.set(pos[0], pos[1], pos[2])
  })

  return (
    <mesh
      ref={mesh}
      geometry={MOON_GEOMETRY}
      scale={spec.radius}
      onClick={(e) => {
        e.stopPropagation()
        select({ kind: 'moon', planet, language: spec.language })
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      <meshStandardMaterial map={map} emissive="#ffffff" emissiveMap={map} emissiveIntensity={0.25} roughness={0.6} />
    </mesh>
  )
}
