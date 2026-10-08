import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useCursor } from '@react-three/drei'
import type * as THREE from 'three'
import type { MoonSpec } from '@/lib/universe/planets'
import { simClock } from '@/store/simClock'
import { useUniverse } from '@/store/universe'
import { MOON_GEOMETRY } from './geometries'
import { getMoonTexture } from './moonTexture'

export function Moon({ spec, planet }: { spec: MoonSpec; planet: string }) {
  const pivot = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  const map = useMemo(() => getMoonTexture(spec.language, spec.color), [spec.language, spec.color])
  const select = useUniverse((s) => s.select)

  useFrame(() => {
    if (pivot.current) pivot.current.rotation.y = spec.phase + spec.speed * simClock.time
  })

  return (
    <group rotation={[spec.inclination, 0, 0]}>
      <group ref={pivot}>
        <mesh
          geometry={MOON_GEOMETRY}
          scale={spec.radius}
          position={[spec.orbitRadius, 0, 0]}
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
      </group>
    </group>
  )
}
