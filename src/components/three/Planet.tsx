import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useCursor } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import { leaveCell, newCellHover, pointCell, stepCellHover, tapCell } from '@/lib/cellHover'
import { selectedPlanet } from '@/lib/interaction'
import type { Repo } from '@/lib/types'
import { cellDate, GRID_DAYS, maxCount } from '@/lib/universe/activity'
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
import { HitProxy } from './HitProxy'
import { Moon } from './Moon'
import { PlanetHoverCard } from './PlanetHoverCard'
import { cellOnSphere, planetHoverUniforms, writeHoverUniforms } from './planetHover'
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

  // O dia sob o ponteiro (ou o dedo), aceso no próprio planeta (ver planetHover) e com o balão da data e dos commits.
  // Só com o planeta em foco e com atividade real; de longe vale o cartão geral do repo.
  const showDays = isSelected && isReal
  const hoverUniforms = planetHoverUniforms(material)
  const hover = useMemo(() => newCellHover(), [])
  const maxCommits = useMemo(() => maxCount(repo.activity.weeks), [repo.activity.weeks])
  const pointerRay = useMemo(() => new THREE.Raycaster(), [])
  /** Último ponto do ponteiro na tela (px): o balão fica nele quando o dia muda com o planeta girando. */
  const pointerAt = useRef({ x: 0, y: 0 })

  /** Mostra (ou tira) o balão do dia do hover, no ponto (x, y) da tela. */
  function publishDay(x: number, y: number) {
    const cell = hover.cell
    if (cell < 0) {
      if (useUniverse.getState().hoveredCell?.planet === repo.name) setHoveredCell(null)
      return
    }
    const week = Math.floor(cell / GRID_DAYS)
    const day = cell % GRID_DAYS
    setHoveredCell({
      planet: repo.name,
      week,
      day,
      count: repo.activity.weeks[week][day],
      date: cellDate(repo.activity.startDate, week, day),
      x,
      y,
    })
  }

  useFrame((state, dt) => {
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

    if (!isReal) return
    // O planeta gira sob o cursor parado: o dia sob ele muda sem evento. Uma vez por quadro, o raio do ponteiro só
    // contra esta esfera, sem alocar.
    if (showDays && canHover && surfaceHovered && surface.current) {
      surface.current.updateWorldMatrix(true, false)
      pointerRay.setFromCamera(state.pointer, state.camera)
      if (pointCell(hover, cellOnSphere(pointerRay.ray, surface.current))) publishDay(pointerAt.current.x, pointerAt.current.y)
    }
    // o prazo do toque venceu: o dia apaga e o balão sai
    if (stepCellHover(hover, dt, reduced)) publishDay(0, 0)
    if (hover.lit >= 0 || hoverUniforms.uHoverTime.value !== 0) writeHoverUniforms(hoverUniforms, hover, repo.activity.weeks, maxCommits)
  })

  // Saiu do foco com o cursor parado sobre o planeta: o detalhe do dia não pode ficar na tela.
  useEffect(() => {
    if (isSelected) return
    leaveCell(hover)
    if (useUniverse.getState().hoveredCell?.planet === repo.name) setHoveredCell(null)
  }, [isSelected, hover, repo.name, setHoveredCell])

  function handleMove(e: ThreeEvent<PointerEvent>) {
    // No toque não há hover: o detalhe sai no toque (handleTap), não ao arrastar.
    if (!canHover || !showDays || !surface.current) return
    pointerAt.current.x = e.nativeEvent.clientX
    pointerAt.current.y = e.nativeEvent.clientY
    // o mesmo cálculo do quadro (direto na esfera), para os dois nunca discordarem na borda de uma célula
    pointCell(hover, cellOnSphere(e.ray, surface.current))
    // o balão segue o ponteiro
    publishDay(e.nativeEvent.clientX, e.nativeEvent.clientY)
  }

  // Toque: o dia acende e fica na tela por ~2 s (stepCellHover), ou até o próximo toque em qualquer lugar. Tocar no
  // mesmo dia de novo fecha; noutro, troca.
  /** O dia que estava na tela quando o toque atual começou (o pointerdown limpa antes do clique chegar). */
  const pressedDay = useRef(-1)
  useEffect(() => {
    if (!isSelected || canHover) return
    const onDown = () => {
      const shown = useUniverse.getState().hoveredCell
      pressedDay.current = shown?.planet === repo.name ? shown.week * GRID_DAYS + shown.day : -1
      leaveCell(hover)
      if (shown) setHoveredCell(null)
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [isSelected, canHover, hover, repo.name, setHoveredCell])

  function handleTap(e: ThreeEvent<MouseEvent>) {
    const cell = showDays && surface.current ? cellOnSphere(e.ray, surface.current) : -1
    const same = cell >= 0 && cell === pressedDay.current
    pressedDay.current = -1
    if (same) return
    tapCell(hover, cell)
    publishDay(e.nativeEvent.clientX, e.nativeEvent.clientY)
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
              // Em foco, no toque: o toque mostra o dia (o planeta já está selecionado).
              if (isSelected && !canHover) handleTap(e)
              else select({ kind: 'planet', name: repo.name })
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              setSurfaceHovered(true)
            }}
            onPointerOut={() => {
              setSurfaceHovered(false)
              // no toque, o dia tocado fica (o próximo toque ou o prazo o fecha)
              if (!canHover) return
              leaveCell(hover)
              publishDay(0, 0)
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
