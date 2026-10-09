import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useCursor } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import type * as THREE from 'three'
import { selectedPlanet } from '@/lib/interaction'
import type { Repo } from '@/lib/types'
import { cellDate } from '@/lib/universe/activity'
import { planetPosition, type PlanetOrbit, type Ring, type Vec3 } from '@/lib/universe/orbits'
import { axisAngles, focusSpinStep, moonOrbits, planetSpin } from '@/lib/universe/planets'
import { simClock } from '@/store/simClock'
import { useUniverse } from '@/store/universe'
import {
  ATMOSPHERE_MATERIAL,
  ATMOSPHERE_SCALE,
  PLANET_GEOMETRY_HI,
  PLANET_GEOMETRY_LO,
} from './geometries'
import { cellFromUv } from './grid'
import { HitProxy } from './HitProxy'
import { Moon } from './Moon'
import { PlanetHoverCard } from './PlanetHoverCard'
import { usePlanetMaterial } from './usePlanetMaterial'

export function Planet({ repo, ring, orbit }: { repo: Repo; ring: Ring; orbit: PlanetOrbit }) {
  const root = useRef<THREE.Group>(null)
  const precession = useRef<THREE.Group>(null)
  const tilt = useRef<THREE.Group>(null)
  const surface = useRef<THREE.Mesh>(null)
  // A superfície e a área de toque em volta (HitProxy) marcam o hover cada uma no seu: um sai enquanto o outro entra.
  const [surfaceHovered, setSurfaceHovered] = useState(false)
  const [proxyHovered, setProxyHovered] = useState(false)
  const hovered = surfaceHovered || proxyHovered
  useCursor(hovered)
  const material = usePlanetMaterial(repo.activity.weeks)
  const spin = useMemo(() => planetSpin(repo.name), [repo.name])
  const moons = useMemo(() => moonOrbits(orbit.radius, repo.languages, repo.name), [orbit.radius, repo.languages, repo.name])
  const select = useUniverse((s) => s.select)
  const setHoveredCell = useUniverse((s) => s.setHoveredCell)
  const isSelected = useUniverse((s) => selectedPlanet(s.selection) === repo.name)
  const canHover = useMemo(() => typeof window !== 'undefined' && !window.matchMedia('(hover: none)').matches, [])
  const isReal = repo.activity.source === 'real'

  const pos = useMemo<Vec3>(() => [0, 0, 0], [])
  const reduced = useReducedMotion() ?? false
  /** Giro extra enquanto o planeta está em foco (o relógio para, mas ele continua girando devagar no eixo). */
  const focusSpin = useRef(0)

  useFrame((_, dt) => {
    const t = simClock.time
    focusSpin.current = focusSpinStep(focusSpin.current, dt, isSelected, simClock.scale, reduced)
    // já com a precessão do periélio do anel; sem alocar por frame
    planetPosition(ring, orbit, t, pos)
    root.current?.position.set(pos[0], pos[1], pos[2])
    // Ângulos de Euler, do grupo de fora para o de dentro:
    // precessão ψ (y do sistema) → obliquidade θ com nutação (z) → rotação própria φ (y local, o eixo).
    const angles = axisAngles(spin, t)
    if (precession.current) precession.current.rotation.y = angles.precession
    if (tilt.current) tilt.current.rotation.z = angles.obliquity
    if (surface.current) surface.current.rotation.y = angles.spin + focusSpin.current
  })

  // Saiu do foco com o cursor parado sobre o planeta: o detalhe do dia não pode ficar na tela.
  useEffect(() => {
    if (!isSelected && useUniverse.getState().hoveredCell?.planet === repo.name) setHoveredCell(null)
  }, [isSelected, repo.name, setHoveredCell])

  function handleMove(e: ThreeEvent<PointerEvent>) {
    // O detalhe do dia (data e commits) só com o planeta em foco; de longe vale o cartão geral do repo.
    if (!isSelected || !isReal || !e.uv) return setHoveredCell(null)
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
      {hovered && !isSelected && canHover && <PlanetHoverCard repo={repo} radius={orbit.radius} />}
      {/* de longe o planeta tem ~10 px: a área de toque tem no mínimo ~44 px de diâmetro, sem mudar o que se vê */}
      <HitProxy
        radius={orbit.radius}
        onClick={(e) => {
          e.stopPropagation()
          select({ kind: 'planet', name: repo.name })
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setProxyHovered(true)
        }}
        onPointerOut={() => setProxyHovered(false)}
      />
      <group ref={precession}>
        <group ref={tilt} rotation={[0, 0, spin.obliquity]}>
          <mesh
            ref={surface}
            geometry={isReal ? PLANET_GEOMETRY_HI : PLANET_GEOMETRY_LO}
            material={material}
            scale={orbit.radius}
            onClick={(e) => {
              e.stopPropagation()
              select({ kind: 'planet', name: repo.name })
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              setSurfaceHovered(true)
            }}
            onPointerOut={() => {
              setSurfaceHovered(false)
              setHoveredCell(null)
            }}
            onPointerMove={handleMove}
          />
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
