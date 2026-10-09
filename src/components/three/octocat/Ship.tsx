import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import { EmissivePulseEffect, GlowHalo } from 'three-low-poly'
import { COLORS, CONTRIBUTION_COLORS, DASHBOARD } from '@/lib/ship/geometry'
import { thrusterScale } from '@/lib/ship/motion'
import { applyImpulse } from '@/lib/ship/verlet'
import { useBloom } from '@/store/bloom'
import { flightClock } from '@/store/frameClock'
import { FlexRod, type InertiaFrame, useInertiaProbe } from './flexRod'
import { mergeParts, partMatrix } from './mergeParts'
import {
  ANTENNA_GEOMETRY,
  ANTENNA_NODES,
  ANTENNA_SPINE_TS,
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
import {
  createThrusterMaterial,
  createThrusterParams,
  thrusterHaloOpacity,
  thrusterHaloSize,
  thrusterParams,
  updateThrusterMaterial,
} from './thrusterMaterial'

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

const RING_PULSE = { speed: 2.2, min: 0.45, max: 1.2 } as const
/** Antena em mola: mais solta na ponta e pouco amortecida, para balançar e quicar antes de assentar (1/s², 1/s). */
const ANTENNA_PHYSICS = { stiffness: 110, tipStiffness: 45, damping: 2.6 } as const
/** Inércia no referencial da nave (unidades da nave/s², rad/s²): ganho para a flutuação, teto para a viagem. */
const ANTENNA_INERTIA = { gain: 15, maxLinear: 9, angularGain: 3, maxAngular: 5 } as const
/** Tranco do botão "Sacudir" (unidades da nave/s). */
const ANTENNA_SHAKE = [1.4, 0.9, -0.8] as const
/** Faróis olham um pouco para baixo. */
const HEADLIGHT_TILT = 0.1

// ─── Peças paradas, juntas por material ───
// Cada material vira um draw call só (antes, um por peça): as peças não se mexem em relação à nave. Ficam de fora a
// antena (dobra no Verlet) e a bolinha dela, a chama, os quadradinhos e as luzinhas do painel (um material cada) e a
// cúpula (transparente, desenhada por último).
const headlightFrames = HEADLIGHT_PLACEMENTS.map(({ position, yaw }) => partMatrix({ position, rotation: [HEADLIGHT_TILT, yaw, 0, 'YXZ'] }))
const dashboardFrame = partMatrix({ position: DASHBOARD_POSITION, rotation: [DASHBOARD_TILT, 0, 0] })
const wheelFrame = partMatrix({ position: WHEEL_MOUNT }, dashboardFrame)
const HULL_GEOMETRY = mergeParts([
  { geometry: TUB_GEOMETRY },
  { geometry: TUB_DECK_GEOMETRY },
  { geometry: TUB_BOTTOM_GEOMETRY },
  ...SEAT_PARTS.shell.map(({ geometry, position, tilt }) => ({ geometry, matrix: partMatrix({ position, rotation: [tilt, 0, 0] }) })),
  ...WINGS.map(({ blade }) => ({ geometry: blade })),
])
const CREAM_GEOMETRY = mergeParts([
  { geometry: RIM_GEOMETRY },
  ...headlightFrames.map((frame) => ({ geometry: HEADLIGHT_BEZEL_GEOMETRY, matrix: partMatrix({ position: [0, 0, 0.02] }, frame) })),
  ...SEAT_PARTS.cushion.map(({ geometry, position, tilt }) => ({ geometry, matrix: partMatrix({ position, rotation: [tilt, 0, 0] }) })),
  { geometry: WHEEL_GEOMETRY, matrix: wheelFrame },
  { geometry: WHEEL_SPOKES_GEOMETRY, matrix: wheelFrame },
  { geometry: WHEEL_HUB_GEOMETRY, matrix: wheelFrame },
  { geometry: FUSELAGE_TOP_GEOMETRY },
  { geometry: NOZZLE_LIP_GEOMETRY },
])
const ENGINE_GEOMETRY = mergeParts([
  { geometry: DASHBOARD_GEOMETRY, matrix: dashboardFrame },
  { geometry: YOKE_COLUMN_GEOMETRY },
  { geometry: YOKE_FRAME_GEOMETRY },
  { geometry: PILLAR_GEOMETRY },
  { geometry: FUSELAGE_BOTTOM_GEOMETRY },
])
const STRIPE_GEOMETRY = mergeParts(WINGS.map(({ stripe }) => ({ geometry: stripe })))
const WING_LIGHTS_GEOMETRY = mergeParts(
  WINGS.flatMap(({ lights }) => lights.map(({ position, quaternion }) => ({ geometry: WING_LIGHT_GEOMETRY, matrix: partMatrix({ position, quaternion }) }))),
)
const GRIPS_GEOMETRY = mergeParts(YOKE_GRIP_GEOMETRIES.map((geometry) => ({ geometry })))
const HEADLIGHTS_GEOMETRY = mergeParts(headlightFrames.map((matrix) => ({ geometry: HEADLIGHT_GEOMETRY, matrix })))
const ENGINE_BANDS_GEOMETRY = mergeParts(ENGINE_BAND_GEOMETRIES.map((geometry) => ({ geometry })))

export function Ship({
  thrusterLevel: levelProp,
  thrusterRef,
  shake = 0,
  inertiaFrame = 'auto',
}: {
  thrusterLevel: number
  /** Quando existe, o nível vem dele a cada quadro (sem re-render); senão, da prop. */
  thrusterRef?: { readonly current: number }
  shake?: number
  inertiaFrame?: InertiaFrame
}) {
  const reducedMotion = useReducedMotion() ?? false
  const root = useRef<THREE.Group>(null)

  // Antena: cópia da malha de descanso, dobrada por uma cadeia de Verlet presa na base; a bolinha vai na ponta.
  const antenna = useMemo(() => {
    const geometry = ANTENNA_GEOMETRY.clone()
    return { geometry, rod: new FlexRod(ANTENNA_NODES, ANTENNA_SPINE_TS, [geometry], ANTENNA_PHYSICS) }
  }, [])
  useEffect(() => () => antenna.rod.dispose(), [antenna])
  const antennaTip = useRef<THREE.Mesh>(null)
  const probe = useInertiaProbe(ANTENNA_INERTIA, inertiaFrame)
  useEffect(() => {
    if (!reducedMotion) return
    probe.reset()
    antenna.rod.pose()
    antennaTip.current?.position.set(...ANTENNA_TIP_POSITION)
  }, [reducedMotion, probe, antenna])
  // só reage a um clique novo (remontar com o mesmo contador não sacode)
  const lastShake = useRef(shake)
  useEffect(() => {
    if (shake === lastShake.current) return
    lastShake.current = shake
    if (!reducedMotion) applyImpulse(antenna.rod.chain, ...ANTENNA_SHAKE)
  }, [shake, reducedMotion, antenna])

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
  const flame = useRef<THREE.Mesh>(null)
  // chama em shader: um material por nave (uniforms de nível e relógio próprios), descartado no unmount
  const flameMaterial = useMemo(() => createThrusterMaterial(), [])
  useEffect(() => () => flameMaterial.dispose(), [flameMaterial])
  const flameParams = useMemo(() => createThrusterParams(), [])
  const thrusterHalo = useMemo(() => new GlowHalo({ color: COLORS.thruster, size: 1.1, opacity: 0 }), [])
  useFrame(({ clock }, delta) => {
    if (!reducedMotion && root.current) {
      // o mesmo passo suavizado com que a nave anda (store/frameClock); a amostra lê a matrixWorld do último render,
      // então o deslocamento que ela mede veio do passo anterior — com o delta cru, o tremido viraria tranco falso
      const dt = flightClock.step(clock.elapsedTime, delta)
      antenna.rod.step(dt, probe.sample(root.current, flightClock.previousStep || dt))
      if (antennaTip.current) antenna.rod.tip(antennaTip.current.position)
    }
    if (!reducedMotion) ringPulse.update(delta)
    // chama tremulando (steady com movimento reduzido): comprimento em z pelo nível, ruído e cor no shader.
    // Movimento reduzido: delta 0 congela o relógio do ruído (chama parada).
    const thrusterLevel = thrusterRef ? thrusterRef.current : levelProp
    const s = reducedMotion ? thrusterLevel : thrusterScale(clock.elapsedTime, thrusterLevel)
    const params = thrusterParams(thrusterLevel, s, flameParams)
    updateThrusterMaterial(flameMaterial, params, reducedMotion ? 0 : delta)
    if (flame.current) {
      // um pouco mais larga na chama-piloto (a forma, o gradiente e o fresnel ficam: o shader usa a posição antes da escala)
      flame.current.scale.set(params.width, params.width, Math.max(params.length, 0.001))
      flame.current.visible = params.visible
    }
    // halo mais fraco com bloom; lido no quadro (getState), sem assinar o store nem alocar
    thrusterHalo.setOpacity(thrusterHaloOpacity(s, useBloom.getState().active, thrusterLevel))
    // e maior na chama-piloto da planagem (vista de trás ela é quase só um disco: o halo é o que a faz ler)
    const haloSize = thrusterHaloSize(thrusterLevel)
    thrusterHalo.scale.set(haloSize, haloSize, 1)
  })

  // Brilhos (sprites aditivos): um por farol e um na boca do bocal.
  const headlightHalos = useMemo(
    () => HEADLIGHT_PLACEMENTS.map(() => new GlowHalo({ color: COLORS.headlight, size: 0.45, opacity: 0.6 })),
    [],
  )
  useEffect(
    () => () => {
      for (const halo of headlightHalos) halo.dispose()
      thrusterHalo.dispose()
    },
    [headlightHalos, thrusterHalo],
  )
  return (
    <group ref={root}>
      {/* peças paradas, uma malha por material: casco, assento, asas (lilás); aro, almofadas, volante, motor de cima e
          lábio do bocal (creme); painel, manche, coluna e motor de baixo (cinza); faixas, luzinhas, empunhaduras, faróis */}
      <mesh geometry={HULL_GEOMETRY} material={HULL_MATERIAL} />
      <mesh geometry={CREAM_GEOMETRY} material={CREAM_MATERIAL} />
      <mesh geometry={ENGINE_GEOMETRY} material={ENGINE_MATERIAL} />
      <mesh geometry={STRIPE_GEOMETRY} material={STRIPE_MATERIAL} />
      <mesh geometry={WING_LIGHTS_GEOMETRY} material={WING_LIGHT_MATERIAL} />
      <mesh geometry={GRIPS_GEOMETRY} material={GRIP_MATERIAL} />
      <mesh geometry={HEADLIGHTS_GEOMETRY} material={HEADLIGHT_MATERIAL} />
      <mesh geometry={ENGINE_BANDS_GEOMETRY} material={ringPulse.material} />
      <mesh geometry={NOZZLE_GEOMETRY} material={NOZZLE_MATERIAL} />

      {/* quadradinhos de contribuição na frente do aro (um material por cor) */}
      {SQUARE_PLACEMENTS.map(({ position, yaw }, i) => (
        <mesh
          key={i}
          geometry={SQUARE_GEOMETRY}
          material={SQUARE_MATERIALS[i]}
          position={position}
          rotation={[0, yaw, 0]}
        />
      ))}

      {/* brilho de cada farol */}
      {HEADLIGHT_PLACEMENTS.map(({ position, yaw }, i) => (
        <group key={i} position={position} rotation={[HEADLIGHT_TILT, yaw, 0, 'YXZ']}>
          <primitive object={headlightHalos[i]} position={[0, 0, 0.09]} />
        </group>
      ))}

      {/* luzinhas do painel (uma cor cada) */}
      {DASHBOARD.lights.map(({ x }, i) => (
        <mesh
          key={i}
          geometry={DASHBOARD_LIGHT_GEOMETRY}
          material={DASHBOARD_LIGHT_MATERIALS[i]}
          position={[x, DASHBOARD_LIGHT_Y, DASHBOARD.z]}
        />
      ))}

      {/* antena em mola saindo do topo da coluna */}
      <mesh geometry={antenna.geometry} material={CREAM_MATERIAL} />
      <mesh ref={antennaTip} geometry={ANTENNA_TIP_GEOMETRY} material={CREAM_MATERIAL} position={ANTENNA_TIP_POSITION} />

      {/* propulsor na boca do bocal */}
      <mesh ref={flame} geometry={FLAME_GEOMETRY} material={flameMaterial} position={THRUSTER_ORIGIN} />
      <primitive object={thrusterHalo} position={THRUSTER_ORIGIN} />

      {/* cúpula de vidro por último: transparente, sem escrever profundidade; nada cruza a frente dela */}
      <mesh geometry={CANOPY_GEOMETRY} material={GLASS_MATERIAL} />
    </group>
  )
}
