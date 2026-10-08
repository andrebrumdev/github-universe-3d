import { useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useCursor } from '@react-three/drei'
import type * as THREE from 'three'
import type { Repo } from '@/lib/types'
import { cellDate } from '@/lib/universe/activity'
import { planetPosition, type PlanetOrbit, type Ring } from '@/lib/universe/orbits'
import { moonOrbits, planetSpin } from '@/lib/universe/planets'
import { simClock } from '@/store/simClock'
import { useUniverse } from '@/store/universe'
import { ATMOSPHERE_MATERIAL, ATMOSPHERE_SCALE, PLANET_GEOMETRY_HI, PLANET_GEOMETRY_LO } from './geometries'
import { cellFromUv } from './grid'
import { Moon } from './Moon'
import { usePlanetTexture } from './usePlanetTexture'

export function Planet({ repo, ring, orbit }: { repo: Repo; ring: Ring; orbit: PlanetOrbit }) {
  const root = useRef<THREE.Group>(null)
  const precession = useRef<THREE.Group>(null)
  const surface = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  const texture = usePlanetTexture(repo.activity.weeks)
  const spin = useMemo(() => planetSpin(repo.name), [repo.name])
  const moons = useMemo(() => moonOrbits(orbit.radius, repo.languages), [orbit.radius, repo.languages])
  const select = useUniverse((s) => s.select)
  const setHoveredCell = useUniverse((s) => s.setHoveredCell)
  const isReal = repo.activity.source === 'real'

  useFrame(() => {
    const t = simClock.time
    const [x, y, z] = planetPosition(ring, orbit, t)
    root.current?.position.set(x, y, z)
    // Euler: precessão (y do sistema) → obliquidade (z) → rotação própria (y local).
    if (precession.current) precession.current.rotation.y = spin.precessionSpeed * t
    if (surface.current) surface.current.rotation.y = spin.spinSpeed * t
  })

  function handleMove(e: ThreeEvent<PointerEvent>) {
    if (!isReal || !e.uv) return setHoveredCell(null)
    const cell = cellFromUv(e.uv.x, e.uv.y)
    if (!cell) return setHoveredCell(null)
    setHoveredCell({
      planet: repo.name,
      ...cell,
      count: repo.activity.weeks[cell.week][cell.day],
      date: cellDate(repo.activity.startDate, cell.week, cell.day),
      x: e.nativeEvent.clientX,
      y: e.nativeEvent.clientY,
    })
  }

  return (
    <group ref={root}>
      <group ref={precession}>
        <group rotation={[0, 0, spin.obliquity]}>
          <mesh
            ref={surface}
            geometry={isReal ? PLANET_GEOMETRY_HI : PLANET_GEOMETRY_LO}
            scale={orbit.radius}
            onClick={(e) => {
              e.stopPropagation()
              select({ kind: 'planet', name: repo.name })
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHovered(true)
            }}
            onPointerOut={() => {
              setHovered(false)
              setHoveredCell(null)
            }}
            onPointerMove={handleMove}
          >
            <meshStandardMaterial
              map={texture}
              emissiveMap={texture}
              emissive="#ffffff"
              emissiveIntensity={0.35}
              roughness={0.85}
              metalness={0.05}
            />
          </mesh>
          <mesh
            geometry={PLANET_GEOMETRY_LO}
            material={ATMOSPHERE_MATERIAL}
            scale={orbit.radius * ATMOSPHERE_SCALE}
            raycast={() => null}
          />
          {moons.map((moon) => (
            <Moon key={moon.language} spec={moon} planet={repo.name} />
          ))}
        </group>
      </group>
    </group>
  )
}
