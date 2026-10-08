import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, Trail, useCursor } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import { MOBILE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { showcasePlanet } from '@/lib/cameraPoses'
import { selectedPlanet } from '@/lib/interaction'
import type { OctocatExpression } from '@/lib/octocat/expression'
import { formatLine } from '@/lib/octocat/lines'
import { bankAngle, escortPosition, targetAnchor, visitPosition, type ShipTarget } from '@/lib/ship/escort'
import { ENTER_DURATION, INITIAL_SHIP, RETURN_DURATION, shipReducer, type ShipMode, type ShipState } from '@/lib/ship/shipMachine'
import { bezierPoint, bezierTangent, planTravel, travelProgress } from '@/lib/ship/travel'
import type { Repo } from '@/lib/types'
import { predictStopTime } from '@/lib/universe/clock'
import type { OrbitSystem, Vec3 } from '@/lib/universe/orbits'
import { shipPose } from '@/store/shipPose'
import { simClock } from '@/store/simClock'
import { useTutorial } from '@/store/tutorial'
import { useUniverse } from '@/store/universe'
import { OctocatShip, type ArmMode } from './OctocatShip'
import { THRUSTER_ORIGIN } from './shipParts'

/**
 * Modelo: 5,6 de envergadura × 4,1 de comprimento × 2,8 de altura (frente em +z, bocal em −z).
 * Em 0,18: ~1,0 × 0,74 — menor que o diâmetro do menor planeta (1,2) e ~15% da largura da tela na escolta.
 */
const SHIP_SCALE = 0.18
/**
 * Lado em que a nave paira, na visão da câmera: no desktop, à direita do alvo (entre ele e o painel lateral,
 * já que a pose de foco põe o alvo à esquerda); no celular, perto do alvo para não sair da tela estreita.
 */
const VISIT_SIDE = { side: 1, bottom: 0.35 } as const
/** Largura do rastro (o Trail do drei usa 0,1 × width em unidades do mundo): ~ o diâmetro do bocal. */
const TRAIL_WIDTH = 1.6

export function ShipRig({ system, repos, profileName }: { system: OrbitSystem; repos: Repo[]; profileName: string }) {
  const group = useRef<THREE.Group>(null)
  const machine = useRef<ShipState>(INITIAL_SHIP)
  const trailHead = useRef<THREE.Mesh>(null)
  const lastTangent = useRef<Vec3>([0, 0, 1])
  const [mode, setMode] = useState<ShipMode>('entering')
  // O modo também muda fora do tick (viagem/chegada no efeito): compara com o que foi renderizado.
  const renderedMode = useRef<ShipMode>('entering')
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  const camera = useThree((s) => s.camera)
  const aspect = useThree((s) => s.size.width / s.size.height)
  const reduced = useReducedMotion() ?? false
  const visitSide = VISIT_SIDE[useMediaQuery(MOBILE_QUERY) ? 'bottom' : 'side']
  const selection = useUniverse((s) => s.selection)
  const bubble = useUniverse((s) => s.bubble)
  const step = useTutorial((s) => s.step)
  const startTutorial = useTutorial((s) => s.start)

  const forward = useMemo(() => new THREE.Vector3(), [])
  const up = useMemo(() => new THREE.Vector3(), [])
  const look = useMemo(() => new THREE.Vector3(), [])
  const targetQuat = useMemo(() => new THREE.Quaternion(), [])
  const helper = useMemo(() => new THREE.Object3D(), [])

  const target: ShipTarget | null = useMemo(() => {
    if (step === 'welcome') return { kind: 'sun' }
    if (step === 'tech') {
      const name = showcasePlanet(repos)
      return name ? { kind: 'planet', name } : null
    }
    if (step === 'repos') return null
    if (selection.kind === 'profile') return { kind: 'sun' }
    const name = selectedPlanet(selection)
    return name ? { kind: 'planet', name } : null
  }, [selection, step, repos])

  // Destino mudou: planeja a viagem até onde o alvo vai estar quando o tempo parar.
  // O modo vai para o shipPose já aqui: a câmera decide no próximo frame se persegue a nave.
  useEffect(() => {
    if (!target) {
      machine.current = shipReducer(machine.current, { type: 'release' })
      shipPose.mode = machine.current.mode
      shipPose.userTravel = false
      return
    }
    // Mesmo alvo (ex.: clicar numa lua do planeta já visitado): a nave fica onde está.
    const current = machine.current.target
    const sameTarget =
      current !== null &&
      current.kind === target.kind &&
      (current.kind === 'sun' || (target.kind === 'planet' && current.name === target.name))
    if (sameTarget && (machine.current.mode === 'traveling' || machine.current.mode === 'visiting')) return
    const anchor = targetAnchor(target, system, predictStopTime(simClock))
    if (!anchor) return
    const destination = visitPosition(anchor.position, anchor.radius, camera.position.toArray() as Vec3, visitSide)
    shipPose.userTravel = step === null || step === 'free'
    if (reduced) {
      machine.current = shipReducer(machine.current, { type: 'arrive', target })
      group.current?.position.set(...destination)
    } else {
      machine.current = shipReducer(machine.current, { type: 'travel', target, path: planTravel(shipPose.position, destination) })
    }
    shipPose.mode = machine.current.mode
  }, [target, system, camera, reduced, step, visitSide])

  useFrame((_, rawDt) => {
    const g = group.current
    if (!g) return
    const dt = Math.min(rawDt, 0.1)
    const s = shipReducer(machine.current, { type: 'tick', dt })
    if (s.mode !== renderedMode.current) {
      renderedMode.current = s.mode
      setMode(s.mode)
    }
    machine.current = s

    camera.getWorldDirection(forward)
    up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    const viewport = { aspect, fov: (camera as THREE.PerspectiveCamera).fov }
    const escort = escortPosition(camera.position.toArray() as Vec3, forward.toArray() as Vec3, up.toArray() as Vec3, viewport)
    let tangent: Vec3 | null = null

    if (s.mode === 'traveling' && s.path) {
      const p = travelProgress(s.elapsed, s.path.duration)
      g.position.set(...bezierPoint(s.path.points, p))
      tangent = bezierTangent(s.path.points, p)
    } else if (s.mode === 'entering' && !reduced) {
      const k = Math.min(1, s.elapsed / ENTER_DURATION)
      const drop = (1 - k) ** 2 * 6
      g.position.set(escort[0], escort[1] + drop, escort[2])
    } else {
      let goal = escort
      if (s.mode === 'visiting' && s.target) {
        const anchor = targetAnchor(s.target, system, simClock.time)
        if (anchor) goal = visitPosition(anchor.position, anchor.radius, camera.position.toArray() as Vec3, visitSide)
      }
      const rate = s.mode === 'returning' ? 3 / RETURN_DURATION : 4
      look.set(...goal)
      g.position.lerp(look, reduced ? 1 : 1 - Math.exp(-rate * dt))
    }

    // Orientação: na viagem, a frente (+z) segue a tangente e inclina nas curvas; parada, vira para a câmera.
    helper.position.copy(g.position)
    if (tangent) {
      helper.lookAt(look.set(...tangent).add(g.position))
      helper.rotateZ(bankAngle(lastTangent.current, tangent, dt))
      lastTangent.current = tangent
    } else {
      helper.lookAt(camera.position)
    }
    targetQuat.copy(helper.quaternion)
    g.quaternion.slerp(targetQuat, reduced ? 1 : 1 - Math.exp(-6 * dt))

    trailHead.current?.position.set(...THRUSTER_ORIGIN)
    if (trailHead.current) g.localToWorld(trailHead.current.position)
    shipPose.position = g.position.toArray() as Vec3
    shipPose.tangent = tangent ?? shipPose.tangent
    shipPose.mode = s.mode
  })

  const expression: OctocatExpression = hovered ? 'wink' : (bubble?.line.expression ?? (mode === 'traveling' ? 'happy' : 'neutral'))
  const armMode: ArmMode = hovered || mode === 'entering' ? 'wave' : mode === 'visiting' ? 'point' : 'rest'
  const thrusterLevel = mode === 'traveling' ? 1 : mode === 'entering' ? 0.8 : 0.25

  return (
    <>
      {/* rastro em coordenadas do mundo, montado depois da entrada (o Trail semeia os pontos na posição inicial) */}
      {!reduced && mode !== 'entering' && (
        <Trail width={TRAIL_WIDTH} length={6} color="#C4B5FD" attenuation={(w) => w * w}>
          <mesh ref={trailHead} position={shipPose.position}>
            <sphereGeometry args={[0.01, 4, 2]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        </Trail>
      )}
      <group
        ref={group}
        scale={SHIP_SCALE}
        onClick={(e) => {
          e.stopPropagation()
          startTutorial()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
      >
        <OctocatShip expression={expression} armMode={armMode} thrusterLevel={thrusterLevel} floating={mode !== 'traveling'} />
        {bubble && (
          // Tamanho fixo em pixels (legível na escolta e de perto) e abaixo dos painéis (z-20).
          <Html position={[0, 3.4, 0]} center zIndexRange={[15, 0]}>
            {/* o texto chega aos leitores de tela pelo espelho aria-live do OctocatSpeech */}
            <p
              aria-hidden="true"
              className="pointer-events-none w-max max-w-[220px] rounded-2xl border border-neon/30 bg-space/90 px-4 py-2 text-sm text-slate-100 shadow-lg"
            >
              {formatLine(bubble.line.text, profileName)}
            </p>
          </Html>
        )}
      </group>
    </>
  )
}
