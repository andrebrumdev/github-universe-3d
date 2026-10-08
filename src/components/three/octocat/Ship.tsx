import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import { EmissivePulseEffect, GlowHalo } from 'three-low-poly'
import { COLORS, CONTRIBUTION_COLORS, DASHBOARD } from '@/lib/ship/geometry'
import {
  ANTENNA_GEOMETRY,
  ANTENNA_TIP_GEOMETRY,
  ANTENNA_TIP_POSITION,
  CANOPY_GEOMETRY,
  DASHBOARD_GEOMETRY,
  DASHBOARD_LIGHT_GEOMETRY,
  DASHBOARD_LIGHT_Y,
  DASHBOARD_POSITION,
  DASHBOARD_TILT,
  ENGINE_BAND_GEOMETRIES,
  FLAME_GEOMETRY,
  FUSELAGE_BOTTOM_GEOMETRY,
  FUSELAGE_TOP_GEOMETRY,
  HEADLIGHT_BEZEL_GEOMETRY,
  HEADLIGHT_GEOMETRY,
  HEADLIGHT_PLACEMENTS,
  NOZZLE_GEOMETRY,
  NOZZLE_LIP_GEOMETRY,
  PILLAR_GEOMETRY,
  RIM_GEOMETRY,
  SEAT_PARTS,
  SQUARE_GEOMETRY,
  SQUARE_PLACEMENTS,
  THRUSTER_ORIGIN,
  TUB_BOTTOM_GEOMETRY,
  TUB_DECK_GEOMETRY,
  TUB_GEOMETRY,
  WHEEL_GEOMETRY,
  WHEEL_HUB_GEOMETRY,
  WHEEL_MOUNT,
  WHEEL_SPOKES_GEOMETRY,
  YOKE_COLUMN_GEOMETRY,
  YOKE_FRAME_GEOMETRY,
  YOKE_GRIP_GEOMETRIES,
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
const GRIP_MATERIAL = solid(COLORS.hat, 0.55)
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
const DASHBOARD_LIGHT_MATERIALS = DASHBOARD.lights.map(
  ({ color }) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, flatShading: true }),
)
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
/** Faróis olham um pouco para baixo. */
const HEADLIGHT_TILT = 0.1

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
    () => HEADLIGHT_PLACEMENTS.map(() => new GlowHalo({ color: COLORS.headlight, size: 0.45, opacity: 0.6 })),
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
      {/* casco em banheira com piso e fundo, aro fino e quadradinhos de contribuição na frente do aro */}
      <mesh geometry={TUB_GEOMETRY} material={HULL_MATERIAL} />
      <mesh geometry={TUB_DECK_GEOMETRY} material={HULL_MATERIAL} />
      <mesh geometry={TUB_BOTTOM_GEOMETRY} material={HULL_MATERIAL} />
      <mesh geometry={RIM_GEOMETRY} material={CREAM_MATERIAL} />
      {SQUARE_PLACEMENTS.map(({ position, yaw }, i) => (
        <mesh
          key={i}
          geometry={SQUARE_GEOMETRY}
          material={SQUARE_MATERIALS[i]}
          position={position}
          rotation={[0, yaw, 0]}
        />
      ))}

      {/* faróis: disco emissivo com aro creme, na frente do casco */}
      {HEADLIGHT_PLACEMENTS.map(({ position, yaw }, i) => (
        <group key={i} position={position} rotation={[HEADLIGHT_TILT, yaw, 0, 'YXZ']}>
          <mesh geometry={HEADLIGHT_GEOMETRY} material={HEADLIGHT_MATERIAL} />
          <mesh geometry={HEADLIGHT_BEZEL_GEOMETRY} material={CREAM_MATERIAL} position={[0, 0, 0.02]} />
          <primitive object={headlightHalos[i]} position={[0, 0, 0.09]} />
        </group>
      ))}

      {/* interior: assento (concha lilás, almofadas creme) e painel com volante, manche em C e luzinhas */}
      {SEAT_PARTS.shell.map(({ geometry, position, tilt }, i) => (
        <mesh key={`shell${i}`} geometry={geometry} material={HULL_MATERIAL} position={position} rotation={[tilt, 0, 0]} />
      ))}
      {SEAT_PARTS.cushion.map(({ geometry, position, tilt }, i) => (
        <mesh key={`cushion${i}`} geometry={geometry} material={CREAM_MATERIAL} position={position} rotation={[tilt, 0, 0]} />
      ))}
      <mesh geometry={DASHBOARD_GEOMETRY} material={ENGINE_MATERIAL} position={DASHBOARD_POSITION} rotation={[DASHBOARD_TILT, 0, 0]} />
      {/* volante redondo na face da frente do painel (mesma pose do painel) */}
      <group position={DASHBOARD_POSITION} rotation={[DASHBOARD_TILT, 0, 0]}>
        <group position={WHEEL_MOUNT}>
          <mesh geometry={WHEEL_GEOMETRY} material={CREAM_MATERIAL} />
          <mesh geometry={WHEEL_SPOKES_GEOMETRY} material={CREAM_MATERIAL} />
          <mesh geometry={WHEEL_HUB_GEOMETRY} material={CREAM_MATERIAL} />
        </group>
      </group>
      {/* manche em C: coluna saindo do painel, arco cinza e empunhaduras laranja */}
      <mesh geometry={YOKE_COLUMN_GEOMETRY} material={ENGINE_MATERIAL} />
      <mesh geometry={YOKE_FRAME_GEOMETRY} material={ENGINE_MATERIAL} />
      {YOKE_GRIP_GEOMETRIES.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={GRIP_MATERIAL} />
      ))}
      {DASHBOARD.lights.map(({ x }, i) => (
        <mesh
          key={i}
          geometry={DASHBOARD_LIGHT_GEOMETRY}
          material={DASHBOARD_LIGHT_MATERIALS[i]}
          position={[x, DASHBOARD_LIGHT_Y, DASHBOARD.z]}
        />
      ))}

      {/* coluna grossa em arco por dentro da cúpula; a antena em mola sai do topo dela */}
      <mesh geometry={PILLAR_GEOMETRY} material={ENGINE_MATERIAL} />
      <mesh geometry={ANTENNA_GEOMETRY} material={CREAM_MATERIAL} />
      <mesh geometry={ANTENNA_TIP_GEOMETRY} material={CREAM_MATERIAL} position={ANTENNA_TIP_POSITION} />

      {/* motor baixo: creme em cima, cinza embaixo, faixas ciano */}
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

      {/* asas espelhadas abertas para os lados (diedro, enflechadas): lilás, faixa verde-água por baixo, 2 luzinhas */}
      {WINGS.map(({ side, blade, stripe, lights }) => (
        <group key={side}>
          <mesh geometry={blade} material={HULL_MATERIAL} />
          <mesh geometry={stripe} material={STRIPE_MATERIAL} />
          {lights.map(({ position, quaternion }, i) => (
            <mesh
              key={i}
              geometry={WING_LIGHT_GEOMETRY}
              material={WING_LIGHT_MATERIAL}
              position={position}
              quaternion={quaternion}
            />
          ))}
        </group>
      ))}

      {/* cúpula de vidro por último: transparente, sem escrever profundidade; nada cruza a frente dela */}
      <mesh geometry={CANOPY_GEOMETRY} material={GLASS_MATERIAL} />
    </group>
  )
}
