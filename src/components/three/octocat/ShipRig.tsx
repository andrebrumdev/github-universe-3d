import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Trail, useCursor } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import { MOBILE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { useIdle } from '@/hooks/useIdle'
import { showcasePlanet } from '@/lib/cameraPoses'
import { selectedPlanet } from '@/lib/interaction'
import type { OctocatExpression } from '@/lib/octocat/expression'
import {
  bankAngle,
  escortFraming,
  escortPlacement,
  keepAway,
  type Knock,
  KNOCK_DURATION,
  knockOffset,
  knockPose,
  MIN_SHIP_DISTANCE,
  placementOffset,
  SHIP_SCALE,
  SHIP_WORLD_HEIGHT,
  SHIP_WORLD_WIDTH,
  targetAnchor,
  THREE_QUARTER_YAW,
  visitPosition,
  type ShipTarget,
} from '@/lib/ship/escort'
import { ENTER_DURATION, INITIAL_SHIP, RETURN_DURATION, shipReducer, type ShipMode, type ShipState } from '@/lib/ship/shipMachine'
import { clockTimeAfter, planTransferTo, travelBodies } from '@/lib/ship/transfer'
import { travelPoint, travelTangent, travelVelocity } from '@/lib/ship/travel'
import type { Repo } from '@/lib/types'
import { reservedRects } from '@/lib/uiLayout'
import { barycenterOffset } from '@/lib/universe/barycenter'
import { predictStopTime } from '@/lib/universe/clock'
import type { OrbitSystem, Vec3 } from '@/lib/universe/orbits'
import { resetShipPose, shipPose } from '@/store/shipPose'
import { usePresentation } from '@/store/presentation'
import { simClock } from '@/store/simClock'
import { useTutorial } from '@/store/tutorial'
import { useUniverse } from '@/store/universe'
import { OctocatShip, type ArmMode } from './OctocatShip'
import { THRUSTER_ORIGIN } from './shipParts'

/** Taxa (1/s) com que o referencial da escolta acompanha o giro da câmera: a nave fica um instante para trás. */
const ESCORT_FOLLOW = 5
/** Taxa (1/s) com que a nave assenta no canto da escolta (vindo da volta ou de um resize). */
const ESCORT_SETTLE = 8
/** Inclinação (rad) para a frente, em direção à lente, no auge da batida no vidro. */
const KNOCK_LEAN = 0.35
/** Apoio do balão: logo acima da nave e puxado para o centro da tela, em unidades do mundo (perto da nave a qualquer distância). */
const BUBBLE_UP = SHIP_WORLD_HEIGHT * 0.6
const BUBBLE_IN = SHIP_WORLD_WIDTH * 0.3

/** Quanto a entrada começa acima do canto: uma altura de tela inteira (desce de fora da imagem). */
const enterRise = (local: Vec3, fov: number) => -local[2] * Math.tan((fov * Math.PI) / 360) * 2
/**
 * Lado em que a nave paira, na visão da câmera: no desktop, à direita do alvo (entre ele e o painel lateral,
 * já que a pose de foco põe o alvo à esquerda); no celular, perto do alvo para não sair da tela estreita.
 */
const VISIT_SIDE = { side: 1, bottom: 0.35 } as const
/** Largura do rastro (o Trail do drei usa 0,1 × width em unidades do mundo): ~ o diâmetro do bocal. */
const TRAIL_WIDTH = 1.6

// `profileName` segue na assinatura (o Scene passa); o balão visível agora é DOM, no OctocatSpeech.
export function ShipRig({ system, repos }: { system: OrbitSystem; repos: Repo[]; profileName: string }) {
  const group = useRef<THREE.Group>(null)
  // Cópia própria: na escolta e na visita o tick só avança `elapsed` no lugar (ver o useFrame).
  const machine = useRef<ShipState>({ ...INITIAL_SHIP })
  const trailHead = useRef<THREE.Mesh>(null)
  const lastTangent = useRef<Vec3>([0, 0, 1])
  const [mode, setMode] = useState<ShipMode>('entering')
  // O modo também muda fora do tick (viagem/chegada no efeito): compara com o que foi renderizado.
  const renderedMode = useRef<ShipMode>('entering')
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const fov = (camera as THREE.PerspectiveCamera).fov
  const reduced = useReducedMotion() ?? false
  const visitSide = VISIT_SIDE[useMediaQuery(MOBILE_QUERY) ? 'bottom' : 'side']
  const selection = useUniverse((s) => s.selection)
  const bubble = useUniverse((s) => s.bubble)
  const step = useTutorial((s) => s.step)
  const startTutorial = useTutorial((s) => s.start)
  const tutorialOpen = step !== null
  const presentationOpen = usePresentation((s) => s.state !== null)

  // Posição da escolta: calculada só quando a tela, o fov ou um cartão (tutorial, apresentação) mudam (não por frame).
  // Em pixels, longe dos botões e dos cartões (medidas compartilhadas em uiLayout).
  const escort = useMemo(() => {
    const { width, height } = size
    const framing = escortFraming(width, height)
    const placement = escortPlacement({ width, height, reserved: reservedRects(width, height, { tutorial: tutorialOpen, presentation: presentationOpen }) }, framing)
    return { side: framing.side, base: placementOffset(placement, width, height, fov) }
  }, [size, fov, tutorialOpen, presentationOpen])
  const latestEscort = useRef(escort)
  useEffect(() => {
    latestEscort.current = escort
  })

  const up = useMemo(() => new THREE.Vector3(), [])
  const right = useMemo(() => new THREE.Vector3(), [])
  const look = useMemo(() => new THREE.Vector3(), [])
  const targetQuat = useMemo(() => new THREE.Quaternion(), [])
  const helper = useMemo(() => new THREE.Object3D(), [])
  /** Orientação da câmera com atraso: a escolta vive nesse referencial (gira junto, sem ficar para trás no mundo). */
  const lagQuat = useMemo(() => new THREE.Quaternion(), [])
  const invQuat = useMemo(() => new THREE.Quaternion(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const speech = useMemo(() => new THREE.Vector3(), [])
  // Rascunhos reaproveitados a cada frame: o caminho da escolta não aloca.
  const knock = useMemo<Knock>(() => ({ closer: 0, bob: 0, waving: false }), [])
  const goalArr = useMemo<Vec3>(() => [0, 0, 0], [])
  const goal = useMemo(() => new THREE.Vector3(), [])
  const posArr = useMemo<Vec3>(() => [0, 0, 0], [])
  const camArr = useMemo<Vec3>(() => [0, 0, 0], [])
  /** Posição atual da nave no referencial atrasado da câmera, válida enquanto `hasLocal` (escolta/entrada). */
  const escortLocal = useMemo(() => new THREE.Vector3(), [])
  const hasLocal = useRef(false)

  // Quarta parede: de vez em quando (inatividade), a nave chega perto da lente e bate no vidro.
  const knockRequest = useRef(false)
  const knockStart = useRef<number | null>(null)
  const [knocking, setKnocking] = useState(false)
  const knockingRef = useRef(false)
  const onIdle = useCallback(() => {
    knockRequest.current = true
  }, [])
  useIdle(onIdle)

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

  // Ponto de partida real antes de qualquer viagem (este efeito roda antes do de baixo): onde a entrada
  // começa, acima do canto da escolta. Sem isso, um passo do tutorial que chega antes do 1º frame partiria do sol.
  // Só na montagem (e se a câmera mudar): um resize não pode reposicionar a nave no meio do voo.
  useEffect(() => {
    lagQuat.copy(camera.quaternion)
    const local = latestEscort.current.base
    const spawn = scratch
      .set(local[0], local[1] + enterRise(local, (camera as THREE.PerspectiveCamera).fov), local[2])
      .applyQuaternion(lagQuat)
      .add(camera.position)
      .toArray() as Vec3
    group.current?.position.set(...spawn)
    resetShipPose(spawn)
    // Remontagem (HMR) não deixa a câmera perseguindo uma nave parada.
    return () => resetShipPose()
  }, [camera, lagQuat, scratch])

  // Destino mudou: planeja a transferência de Hohmann (ver lib/ship/transfer) até onde o alvo vai estar na chegada.
  // O modo vai para o shipPose já aqui: a câmera decide no próximo frame se persegue a nave.
  // A volta para a escolta não é uma transferência: o canto da escolta é preso à câmera (que também se move) e fica
  // perto da lente, onde uma órbita em volta do sol não faz sentido; ela segue assentando como antes (modo returning).
  useEffect(() => {
    if (!target) {
      machine.current = shipReducer(machine.current, { type: 'release' })
      shipPose.mode = machine.current.mode
      shipPose.target = machine.current.target
      shipPose.userTravel = false
      shipPose.velocity = [0, 0, 0]
      return
    }
    // Mesmo alvo (ex.: clicar numa lua do planeta já visitado): a nave fica onde está.
    const current = machine.current.target
    const sameTarget =
      current !== null &&
      current.kind === target.kind &&
      (current.kind === 'sun' || (target.kind === 'planet' && current.name === target.name))
    if (sameTarget && (machine.current.mode === 'traveling' || machine.current.mode === 'visiting')) return
    const stop = predictStopTime(simClock)
    const anchor = targetAnchor(target, system, stop)
    if (!anchor) return
    const cameraPos = camera.position.toArray() as Vec3
    shipPose.userTravel = step === null || step === 'free'
    if (reduced) {
      machine.current = shipReducer(machine.current, { type: 'arrive', target })
      group.current?.position.set(...visitPosition(anchor.position, anchor.radius, cameraPos, visitSide))
      shipPose.velocity = [0, 0, 0]
    } else {
      // O alvo ainda anda enquanto o relógio desacelera: o destino é onde ele vai estar no instante da chegada.
      const destinationAt = (seconds: number) => {
        const at = targetAnchor(target, system, clockTimeAfter(simClock, seconds)) ?? anchor
        return visitPosition(at.position, at.radius, cameraPos, visitSide)
      }
      const path = planTransferTo(shipPose.position, destinationAt, {
        sun: barycenterOffset(system, stop),
        // Troca de destino em voo: parte com a velocidade atual (sem quina). Parada (escolta, visita): queima de partida.
        velocity: machine.current.mode === 'traveling' ? shipPose.velocity : null,
        bodies: travelBodies(system, stop),
      })
      machine.current = shipReducer(machine.current, { type: 'travel', target, path })
      shipPose.velocity = travelVelocity(path, 0)
    }
    shipPose.mode = machine.current.mode
    shipPose.target = machine.current.target
  }, [target, system, camera, reduced, step, visitSide])

  useFrame(({ clock }, rawDt) => {
    const g = group.current
    if (!g) return
    const dt = Math.min(rawDt, 0.1)
    // Escolta e visita não mudam de modo com o tempo: avança no lugar, sem alocar um estado novo por frame.
    let s = machine.current
    if (s.mode === 'escort' || s.mode === 'visiting') s.elapsed += dt
    else s = shipReducer(s, { type: 'tick', dt })
    if (s.mode !== renderedMode.current) {
      renderedMode.current = s.mode
      setMode(s.mode)
    }
    machine.current = s

    lagQuat.slerp(camera.quaternion, reduced ? 1 : 1 - Math.exp(-ESCORT_FOLLOW * dt))

    // Batida no vidro: só parada na escolta e com movimento normal; dura KNOCK_DURATION e acaba sozinha.
    if (knockRequest.current) {
      knockRequest.current = false
      if (!reduced && s.mode === 'escort' && knockStart.current === null) knockStart.current = clock.elapsedTime
    }
    if (s.mode !== 'escort' || reduced) knockStart.current = null
    const kt = knockStart.current === null ? -1 : clock.elapsedTime - knockStart.current
    if (kt >= KNOCK_DURATION) knockStart.current = null
    knockPose(kt, knock)
    if (knock.waving !== knockingRef.current) {
      knockingRef.current = knock.waving
      setKnocking(knock.waving)
    }
    goal.fromArray(knockOffset(escort.base, knock, goalArr))
    let tangent: Vec3 | null = null

    if (s.mode === 'traveling' && s.path) {
      hasLocal.current = false
      g.position.fromArray(travelPoint(s.path, s.elapsed, posArr))
      tangent = travelTangent(s.path, s.elapsed)
    } else if (s.mode === 'entering' && !reduced) {
      // Desce de fora da imagem até o canto, no referencial da câmera.
      const k = Math.min(1, s.elapsed / ENTER_DURATION)
      escortLocal.copy(goal).setY(goal.y + (1 - k) ** 2 * enterRise(goalArr, fov))
      hasLocal.current = true
      g.position.copy(escortLocal).applyQuaternion(lagQuat).add(camera.position)
    } else if (s.mode === 'escort' || s.mode === 'entering') {
      // Perto da lente, preso ao referencial atrasado da câmera: girar a câmera não deixa a nave para trás no mundo
      // (nem a joga contra a lente). Vindo da volta, parte de onde está e assenta no canto.
      if (!hasLocal.current) {
        escortLocal.copy(g.position).sub(camera.position).applyQuaternion(invQuat.copy(lagQuat).invert())
        hasLocal.current = true
      }
      escortLocal.lerp(goal, reduced || knockStart.current !== null ? 1 : 1 - Math.exp(-ESCORT_SETTLE * dt))
      g.position.copy(escortLocal).applyQuaternion(lagQuat).add(camera.position)
    } else {
      hasLocal.current = false
      look.copy(goal).applyQuaternion(lagQuat).add(camera.position)
      if (s.mode === 'visiting' && s.target) {
        const anchor = targetAnchor(s.target, system, simClock.time)
        if (anchor) look.fromArray(visitPosition(anchor.position, anchor.radius, camera.position.toArray(camArr), visitSide))
      }
      const rate = s.mode === 'returning' ? 3 / RETURN_DURATION : 4
      g.position.lerp(look, reduced ? 1 : 1 - Math.exp(-rate * dt))
    }
    // Nada da nave encosta no plano próximo, nem com a câmera chegando perto dela.
    if (!tangent) {
      keepAway(g.position.toArray(posArr), camera.position.toArray(camArr), MIN_SHIP_DISTANCE, posArr)
      g.position.fromArray(posArr)
    }

    // Orientação: na viagem, a frente (+z) segue a tangente e inclina nas curvas. Parada, olha para quem vê:
    // na escolta em três-quartos (nariz para o centro da tela) e, na batida, inclinada para a lente.
    // Parada, o "para cima" é o da câmera: perto da lente, no canto, o para-cima do mundo a deixaria tombada
    // na tela (perspectiva com a câmera olhando para baixo).
    up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    helper.position.copy(g.position)
    if (tangent) {
      helper.up.set(0, 1, 0)
      helper.lookAt(look.set(...tangent).add(g.position))
      helper.rotateZ(bankAngle(lastTangent.current, tangent, dt))
      lastTangent.current = tangent
    } else {
      helper.up.copy(up)
      helper.lookAt(camera.position)
      if (s.mode !== 'visiting') {
        helper.rotateY(-escort.side * THREE_QUARTER_YAW)
        helper.rotateX(KNOCK_LEAN * knock.closer)
      }
    }
    targetQuat.copy(helper.quaternion)
    g.quaternion.slerp(targetQuat, reduced ? 1 : 1 - Math.exp(-6 * dt))

    // Apoio do balão (DOM, no OctocatSpeech): acima da nave, puxado para o centro da tela, projetado em pixels.
    right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    speech.copy(g.position).addScaledVector(up, BUBBLE_UP).addScaledVector(right, -escort.side * BUBBLE_IN).project(camera)
    shipPose.speechX = ((speech.x + 1) / 2) * size.width
    shipPose.speechY = ((1 - speech.y) / 2) * size.height
    shipPose.speechOnScreen = speech.z < 1 && Math.abs(speech.x) < 1.2 && Math.abs(speech.y) < 1.2

    trailHead.current?.position.set(...THRUSTER_ORIGIN)
    if (trailHead.current) g.localToWorld(trailHead.current.position)
    g.position.toArray(shipPose.position)
    shipPose.tangent = tangent ?? shipPose.tangent
    if (s.mode === 'traveling' && s.path) travelVelocity(s.path, s.elapsed, shipPose.velocity)
    else shipPose.velocity.fill(0)
    shipPose.mode = s.mode
    shipPose.target = s.target
  })

  const expression: OctocatExpression = hovered
    ? 'wink'
    : (bubble?.line.expression ?? (mode === 'traveling' || knocking ? 'happy' : 'neutral'))
  const armMode: ArmMode = hovered || knocking || mode === 'entering' ? 'wave' : mode === 'visiting' ? 'point' : 'rest'
  const thrusterLevel = mode === 'traveling' ? 1 : mode === 'entering' ? 0.8 : 0.25

  return (
    <>
      {/* rastro em coordenadas do mundo, só em voo (perto da lente ele viraria uma faixa grossa; o Trail
          semeia os pontos na posição de montagem, que é a da nave) */}
      {!reduced && (mode === 'traveling' || mode === 'returning') && (
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
      </group>
    </>
  )
}
