import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import { EmissivePulseEffect, GlowHalo } from 'three-low-poly'
import {
  bowlRadiusAt,
  BUBBLE,
  COLORS,
  CONTRIBUTION_COLORS,
  facetDistance,
  HEADLIGHTS,
  RIM,
  SQUARES,
  WING,
} from '@/lib/ship/geometry'
import {
  ANTENNA_GEOMETRY,
  ANTENNA_TIP_GEOMETRY,
  ANTENNA_TIP_POSITION,
  BOWL_GEOMETRY,
  BUBBLE_FRAME_GEOMETRY,
  BUBBLE_GEOMETRY,
  ENGINE_BAND_GEOMETRIES,
  FLAME_GEOMETRY,
  FUSELAGE_BOTTOM_GEOMETRY,
  FUSELAGE_TOP_GEOMETRY,
  HEADLIGHT_BEZEL_GEOMETRY,
  HEADLIGHT_GEOMETRY,
  NOZZLE_GEOMETRY,
  NOZZLE_LIP_GEOMETRY,
  PILLAR_GEOMETRY,
  RIM_GEOMETRY,
  SQUARE_GEOMETRY,
  THRUSTER_ORIGIN,
  WING_LIGHT_GEOMETRY,
  WINGS,
} from './shipParts'

// Materiais opacos compartilhados: cor sólida + flatShading (as faces aparecem).
const solid = (color: string, roughness = 0.6, metalness = 0.05) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true })
const HULL_MATERIAL = solid(COLORS.ship, 0.5, 0.1)
const CREAM_MATERIAL = solid(COLORS.cream, 0.55)
const ENGINE_MATERIAL = solid(COLORS.engine, 0.75, 0)
const STRIPE_MATERIAL = solid(COLORS.wingStripe, 0.55)
const NOZZLE_MATERIAL = solid(COLORS.nozzle, 0.7, 0.3)
const HEADLIGHT_MATERIAL = new THREE.MeshStandardMaterial({
  color: COLORS.headlight,
  emissive: COLORS.headlight,
  emissiveIntensity: 1.3,
  flatShading: true,
})
const WING_LIGHT_MATERIAL = new THREE.MeshStandardMaterial({
  color: COLORS.thruster,
  emissive: COLORS.thruster,
  emissiveIntensity: 1.4,
  flatShading: true,
})
const SQUARE_MATERIALS = CONTRIBUTION_COLORS.map(
  (color) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, flatShading: true }),
)
const GLASS_MATERIAL = new THREE.MeshStandardMaterial({
  color: COLORS.dome,
  transparent: true,
  opacity: 0.18,
  roughness: 0.1,
  metalness: 0.1,
  flatShading: true,
  depthWrite: false,
})
const FLAME_MATERIAL = new THREE.MeshBasicMaterial({
  color: COLORS.thruster,
  transparent: true,
  opacity: 0.85,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

const RING_PULSE = { speed: 2.2, min: 0.45, max: 1.2 } as const
const SQUARE_Z = facetDistance(RIM.outer) + SQUARES.depth / 2 - 0.005
const HEADLIGHT_WALL = bowlRadiusAt(HEADLIGHTS.y)
const HEADLIGHT_Z = facetDistance(HEADLIGHT_WALL.radius) + 0.01

export function Ship({ thrusterLevel }: { thrusterLevel: number }) {
  const reducedMotion = useReducedMotion()

  // Anéis do motor: um material emissivo só, pulsado pelo EmissivePulseEffect.
  // Com movimento reduzido o pulso não anda e os anéis ficam acesos no máximo (o valor inicial).
  const ringPulse = useMemo(
    () =>
      new EmissivePulseEffect({
        // base escura + emissivo ciano: a faixa brilha ciano em vez de estourar para branco
        material: new THREE.MeshStandardMaterial({
          color: COLORS.engine,
          emissive: COLORS.thruster,
          emissiveIntensity: RING_PULSE.max,
          flatShading: true,
        }),
        speed: RING_PULSE.speed,
        minIntensity: RING_PULSE.min,
        maxIntensity: RING_PULSE.max,
      }),
    [],
  )
  useEffect(() => () => ringPulse.material.dispose(), [ringPulse])
  useFrame((_, delta) => {
    if (!reducedMotion) ringPulse.update(delta)
  })

  // Brilhos (sprites aditivos): um por farol e um na boca do bocal.
  const headlightHalos = useMemo(
    () => HEADLIGHTS.angles.map(() => new GlowHalo({ color: COLORS.headlight, size: 0.55, opacity: 0.6 })),
    [],
  )
  const thrusterHalo = useMemo(() => new GlowHalo({ color: COLORS.thruster, size: 1.1, opacity: 0 }), [])
  useEffect(
    () => () => {
      for (const halo of headlightHalos) halo.dispose()
      thrusterHalo.dispose()
    },
    [headlightHalos, thrusterHalo],
  )
  useEffect(() => {
    thrusterHalo.setOpacity(0.8 * thrusterLevel)
  }, [thrusterHalo, thrusterLevel])

  const thrusterOn = thrusterLevel > 0.01

  return (
    <group>
      {/* cabine: tigela, aro e quadradinhos de contribuição na frente do aro */}
      <mesh geometry={BOWL_GEOMETRY} material={HULL_MATERIAL} />
      <mesh geometry={RIM_GEOMETRY} material={CREAM_MATERIAL} />
      {SQUARES.angles.map((angle, i) => (
        <group key={i} rotation={[0, angle, 0]}>
          <mesh geometry={SQUARE_GEOMETRY} material={SQUARE_MATERIALS[i]} position={[0, SQUARES.y, SQUARE_Z]} />
        </group>
      ))}

      {/* faróis: disco emissivo com aro creme, colado na parede da tigela */}
      {HEADLIGHTS.angles.map((angle, i) => (
        <group key={i} rotation={[0, angle, 0]}>
          <group position={[0, HEADLIGHTS.y, HEADLIGHT_Z]} rotation={[HEADLIGHT_WALL.tilt, 0, 0]}>
            <mesh geometry={HEADLIGHT_GEOMETRY} material={HEADLIGHT_MATERIAL} />
            <mesh geometry={HEADLIGHT_BEZEL_GEOMETRY} material={CREAM_MATERIAL} position={[0, 0, 0.02]} />
            <primitive object={headlightHalos[i]} position={[0, 0, 0.1]} />
          </group>
        </group>
      ))}

      {/* antena em arco com mola e bolinha na ponta, moldura da bolha e coluna em arco por dentro */}
      <mesh geometry={ANTENNA_GEOMETRY} material={CREAM_MATERIAL} />
      <mesh geometry={ANTENNA_TIP_GEOMETRY} material={CREAM_MATERIAL} position={ANTENNA_TIP_POSITION} />
      <mesh geometry={BUBBLE_FRAME_GEOMETRY} material={CREAM_MATERIAL} />
      <mesh geometry={PILLAR_GEOMETRY} material={ENGINE_MATERIAL} />

      {/* fuselagem traseira: creme em cima, cinza embaixo, anéis ciano */}
      <mesh geometry={FUSELAGE_TOP_GEOMETRY} material={CREAM_MATERIAL} />
      <mesh geometry={FUSELAGE_BOTTOM_GEOMETRY} material={ENGINE_MATERIAL} />
      {ENGINE_BAND_GEOMETRIES.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={ringPulse.material} />
      ))}

      {/* bocal com lábio creme e o propulsor */}
      <mesh geometry={NOZZLE_GEOMETRY} material={NOZZLE_MATERIAL} />
      <mesh geometry={NOZZLE_LIP_GEOMETRY} material={CREAM_MATERIAL} />
      <mesh
        geometry={FLAME_GEOMETRY}
        material={FLAME_MATERIAL}
        position={THRUSTER_ORIGIN}
        scale={[1, 1, Math.max(thrusterLevel, 0.001)]}
        visible={thrusterOn}
      />
      <primitive object={thrusterHalo} position={THRUSTER_ORIGIN} visible={thrusterOn} />

      {/* asas espelhadas: lâminas ao longo do casco, diedro e pitch para cima, faixas verde-água e 2 luzinhas */}
      {WINGS.map(({ side, geometry, stripes }) => (
        <group key={side} position={[side * WING.root.x, WING.root.y, 0]} rotation={[WING.pitch, 0, side * WING.dihedral]}>
          <mesh geometry={geometry} material={HULL_MATERIAL} />
          {stripes.map((stripe, i) => (
            <mesh key={i} geometry={stripe} material={STRIPE_MATERIAL} />
          ))}
          {WING.lights.map(([s, z], i) => (
            <mesh
              key={i}
              geometry={WING_LIGHT_GEOMETRY}
              material={WING_LIGHT_MATERIAL}
              position={[side * s, WING.thickness / 2, z]}
            />
          ))}
        </group>
      ))}

      {/* bolha de vidro por último: transparente, sem escrever profundidade */}
      <mesh geometry={BUBBLE_GEOMETRY} material={GLASS_MATERIAL} position={BUBBLE.center} />
    </group>
  )
}
