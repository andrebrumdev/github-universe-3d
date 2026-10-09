import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useCursor } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import { MOBILE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { useIdle } from '@/hooks/useIdle'
import { selectionPose, showcasePlanet, tutorialPose, type PanelLayout } from '@/lib/cameraPoses'
import { selectedPlanet } from '@/lib/interaction'
import {
  crashBlend,
  crashBurnPhase,
  crashBurns,
  crashFaceWeight,
  crashHeading,
  crashPoint,
  crashTotal,
  crashWobble,
  planCrash,
  type CrashPlan,
} from '@/lib/crash/crashApproach'
import { recordReturn, shouldCrash } from '@/lib/crash/rarity'
import {
  crashCancel,
  crashDizzy,
  crashImpact,
  crashInterrupted,
  crashShakeAt,
  crashStarsAt,
  crashTick,
  type CrashSituation,
} from '@/lib/crash/timeline'
import type { OctocatExpression } from '@/lib/octocat/expression'
import {
  arrivalBlendWeight,
  bankAngle,
  ESCORT_FOLLOW,
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
  type ShipTarget,
} from '@/lib/ship/escort'
import { burnJolt, flameLevel, JOLT_SURGE, MAX_FRAME_DT, settleThrust, THRUST_STEP } from '@/lib/ship/motion'
import { ENTER_DURATION, INITIAL_SHIP, RETURN_DURATION, shipReducer, type ShipMode, type ShipState } from '@/lib/ship/shipMachine'
import { blendFramesPoint, frameFromPose, frameToLocal, frameToWorld, type CameraFrame } from '@/lib/ship/cameraFrame'
import { activePuff } from '@/lib/ship/burn'
import { planReturn, returnBlend, returnBurnPhase, returnBurns, returnFaceWeight, returnHeading, returnPoint, type ReturnPlan } from '@/lib/ship/returnFlight'
import { burnPhase, planTransferTo, travelBodies } from '@/lib/ship/transfer'
import { newVisitWatch, projectDisc, visitLocal, visitPlacement, visitStep, type Disc, type VisitWatch } from '@/lib/ship/visit'
import { travelPoint, travelTangent, travelVelocity, type TravelPath } from '@/lib/ship/travel'
import type { Repo } from '@/lib/types'
import { reservedRects } from '@/lib/uiLayout'
import { barycenterOffset } from '@/lib/universe/barycenter'
import { predictStopTime } from '@/lib/universe/clock'
import type { OrbitSystem, Vec3 } from '@/lib/universe/orbits'
import { CRASH_OVERRIDE, crashSession, crashTimeline, endCrash, useCrash } from '@/store/crash'
import { resetShipPose, shipPose } from '@/store/shipPose'
import { usePresentation } from '@/store/presentation'
import { simClock } from '@/store/simClock'
import { useTutorial } from '@/store/tutorial'
import { useUniverse } from '@/store/universe'
import { Contrails, type WingTips } from './Contrails'
import { FireTrail, TrailWarmup } from './FireTrail'
import { OctocatShip, type ArmMode } from './OctocatShip'
import { RetroPuffs, type Nozzles } from './RetroPuffs'
import { HEADLIGHT_PLACEMENTS, THRUSTER_ORIGIN, WINGS } from './shipParts'

/** Taxa (1/s) com que a nave assenta no canto da escolta (vindo da volta ou de um resize). */
const ESCORT_SETTLE = 8
/** Inclinação (rad) para a frente, em direção à lente, no auge da batida no vidro. */
const KNOCK_LEAN = 0.35
/** Apoio do balão: logo acima da nave e puxado para o centro da tela, em unidades do mundo (perto da nave a qualquer distância). */
const BUBBLE_UP = SHIP_WORLD_HEIGHT * 0.6
const BUBBLE_IN = SHIP_WORLD_WIDTH * 0.3

/** Quanto a entrada começa acima do canto: uma altura de tela inteira (desce de fora da imagem). */
const enterRise = (local: Vec3, fov: number) => -local[2] * Math.tan((fov * Math.PI) / 360) * 2
/** Ritmo (1/s) com que a nave desliza para um lugar novo na visita. */
const VISIT_REPLACE_RATE = 3
/** O estilingue só é anunciado (fala) quando a curva se vê (deflexão em rad). */
const SLINGSHOT_ANNOUNCE = (15 * Math.PI) / 180

/** Visita em primeiro plano (lib/ship/visit): ponto no referencial da câmera, preso primeiro à pose de foco e depois à câmera. */
interface VisitSpot {
  /** Referencial da pose de foco (para onde a câmera vai). */
  goal: CameraFrame
  /** Ponto atual (desliza para `targetLocal` quando muda de lugar). */
  local: Vec3
  targetLocal: Vec3
  /** Lado do giro de três-quartos (nariz para o alvo). */
  side: 1 | -1
  /** Disco do alvo que gerou o lugar atual (px), e a interface de então. */
  disc: Disc | null
  layoutKey: string
  /** Passagem para a câmera e câmera parada (ver `visitStep`). */
  watch: VisitWatch
}
/** No estilingue a curva é fechada e rápida: a nave inclina bem mais que numa curva comum. */
const ASSIST_BANK = 1.8
/** Aceno de "voltei" ao assentar no canto depois da volta (s). */
const GREET_SECONDS = 1.6
/** Pontas das asas (espaço do modelo): a luzinha de trás de cada asa, a mais perto da ponta. */
const WING_TIPS: WingTips = WINGS.map(({ lights }) => lights[lights.length - 1].position)
/** Bicos de ré (espaço do modelo): na frente do casco, um pouco para fora de cada farol. */
const RETRO_NOZZLES: Nozzles = HEADLIGHT_PLACEMENTS.map(({ position: [x, y, z] }) => [x + Math.sign(x) * 0.28, y - 0.02, z - 0.06] as const)
/** Arfagem (rad) no primeiro pico do tranco de uma queima: o nariz sobe um pouco com o empurrão. */
const JOLT_PITCH = 0.06
/** Escala dos puffs na volta para a escolta (perto da lente). */
const RETURN_PUFF_SCALE = 0.35
/** Tranco de um puff de força média (a força relativa ao puff médio multiplica isto). */
const PUFF_JOLT = 0.45
/** Tranco da trombada na tela: para trás, bem mais forte que um puff. */
const CRASH_JOLT = 1.6

const newFrame = (): CameraFrame => ({ position: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], back: [0, 0, 1] })
/** Escreve em `f` o referencial de uma câmera (posição + orientação), sem alocar. */
function writeFrame(f: CameraFrame, position: THREE.Vector3, q: THREE.Quaternion, v: THREE.Vector3): CameraFrame {
  position.toArray(f.position)
  v.set(1, 0, 0).applyQuaternion(q).toArray(f.right)
  v.set(0, 1, 0).applyQuaternion(q).toArray(f.up)
  v.set(0, 0, 1).applyQuaternion(q).toArray(f.back)
  return f
}
const dotArr = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export function ShipRig({ system, repos }: { system: OrbitSystem; repos: Repo[] }) {
  const group = useRef<THREE.Group>(null)
  // Cópia própria: na escolta e na visita o tick só avança `elapsed` no lugar (ver o useFrame).
  const machine = useRef<ShipState>({ ...INITIAL_SHIP })
  const lastTangent = useRef<Vec3>([0, 0, 1])
  /** Viagem cujo estilingue já foi anunciado (a fala sai uma vez, ao entrar no sobrevoo). */
  const announced = useRef<TravelPath | null>(null)
  /** Volta em curso (ver lib/ship/returnFlight) e o referencial da câmera na hora em que ela começou. */
  const returnPlan = useRef<ReturnPlan | null>(null)
  const returnFrame = useMemo(() => newFrame(), [])
  const frameNow = useMemo(() => newFrame(), [])
  const [thrust, setThrust] = useState(0.25)
  const thrustRef = useRef(0.25)
  /** Nível contínuo da chama (o React recebe em degraus de THRUST_STEP). */
  const thrustSmooth = useRef(0.25)
  const greetUntil = useRef(-1)
  /** Queima em curso (voo e fase), para notar quando uma nova acende: tranco na nave, sacudida no Verlet. */
  const lastBurn = useRef<{ flight: TravelPath | ReturnPlan | CrashPlan | null; puff: number }>({ flight: null, puff: -1 })
  const joltStart = useRef(-Infinity)
  /** Sinal e força do tranco em curso: +1 na partida (para a frente), negativo nos puffs de ré. */
  const joltScale = useRef(1)
  const jolt = useRef<THREE.Group>(null)
  const [burnShake, setBurnShake] = useState(0)
  // O vapor das asas lê a nave do quadro: monta depois do 1º quadro daqui, para o useFrame
  // dele se inscrever depois deste (filhos montados junto com o pai se inscrevem antes e ficariam um quadro atrás).
  const [afterShip, setAfterShip] = useState(false)
  const [greeting, setGreeting] = useState(false)
  const [mode, setMode] = useState<ShipMode>('entering')
  // O modo também muda fora do tick (viagem/chegada no efeito): compara com o que foi renderizado.
  const renderedMode = useRef<ShipMode>('entering')
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const fov = (camera as THREE.PerspectiveCamera).fov
  const reduced = useReducedMotion() ?? false
  const layout: PanelLayout = useMediaQuery(MOBILE_QUERY) ? 'bottom' : 'side'
  const selection = useUniverse((s) => s.selection)
  const bubble = useUniverse((s) => s.bubble)
  const step = useTutorial((s) => s.step)
  const startTutorial = useTutorial((s) => s.start)
  const tutorialOpen = step !== null
  const presentationOpen = usePresentation((s) => s.state !== null)
  // O painel do planeta/perfil abre com a seleção (fora da apresentação, que tem o cartão dela).
  const panelOpen = (selection.kind === 'planet' || selection.kind === 'moon' || selection.kind === 'profile') && !presentationOpen
  /** O que a nave na visita não pode cobrir, e uma chave para notar quando muda. */
  const visitUi = useMemo(() => {
    const reserved = reservedRects(size.width, size.height, { tutorial: tutorialOpen, presentation: presentationOpen, panel: panelOpen })
    return { reserved, key: `${size.width}x${size.height}:${tutorialOpen}:${presentationOpen}:${panelOpen}:${fov}` }
  }, [size, fov, tutorialOpen, presentationOpen, panelOpen])
  const latestVisitUi = useRef(visitUi)
  useEffect(() => {
    latestVisitUi.current = visitUi
  })
  const visit = useRef<VisitSpot | null>(null)
  /** Câmera do quadro anterior (para saber se ela assentou). */
  const lastCamPos = useMemo(() => new THREE.Vector3(), [])
  const lastCamQuat = useMemo(() => new THREE.Quaternion(), [])

  // Trombada na tela (easter egg, ver lib/crash): a volta com trombada em curso (no lugar da `returnPlan`) e a que já
  // bateu. A linha do tempo depois do impacto é `crashTimeline` (store/crash); daqui saem o rosto em espiral e as
  // estrelinhas (só mudam de estado quando ela muda).
  const crashPlan = useRef<CrashPlan | null>(null)
  const crashedPlan = useRef<CrashPlan | null>(null)
  const [dizzy, setDizzy] = useState(false)
  const dizzyRef = useRef(false)
  const [starry, setStarry] = useState(false)
  const starryRef = useRef(false)
  const shakeOut = useMemo(() => ({ x: 0, y: 0 }), [])
  const starsOut = useMemo(() => ({ opacity: 0, angle: 0 }), [])
  const wobble = useMemo(() => ({ roll: 0, pitch: 0 }), [])
  const situation = useRef<CrashSituation>({ mode: 'escort', selection: false, tutorial: false, presentation: false })
  // Canvas deslocado pelo tremor (null: parado). Desmontar no meio da trombada não o deixa deslocado nem deixa a
  // trinca congelada na tela.
  const shaken = useRef<HTMLCanvasElement | null>(null)
  useEffect(
    () => () => {
      if (shaken.current) shaken.current.style.transform = ''
      endCrash()
    },
    [],
  )

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
      const from = machine.current.mode
      let duration: number | undefined
      // Só uma saída de verdade (viagem ou visita) planeja a volta: um efeito que roda de novo no meio dela (resize,
      // passo do tutorial) não a interrompe.
      if (from === 'traveling' || from === 'visiting') {
        returnPlan.current = null
        crashPlan.current = null
      }
      if (!reduced && (from === 'traveling' || from === 'visiting')) {
        // Volta: no referencial da câmera (atrasada) desta hora; sai pela tangente da órbita em volta do sol.
        writeFrame(returnFrame, camera.position, lagQuat, scratch)
        const p = shipPose.position
        const sun = barycenterOffset(system, simClock.time)
        const rho = Math.hypot(p[0] - sun[0], p[2] - sun[2]) || 1
        const tangent: Vec3 = [(p[2] - sun[2]) / rho, 0, -(p[0] - sun[0]) / rho]
        const toLocal = (v: Vec3): Vec3 => [dotArr(v, returnFrame.right), dotArr(v, returnFrame.up), dotArr(v, returnFrame.back)]
        const { base, side } = latestEscort.current
        // de vez em quando (raro), a volta vem rápido demais e bate na tela
        const crash = shouldCrash(crashSession.rng, crashSession.history, {
          from: machine.current.target,
          tutorial: step !== null,
          presentation: usePresentation.getState().state !== null,
          reducedMotion: reduced,
          override: CRASH_OVERRIDE,
        })
        crashSession.history = recordReturn(crashSession.history, crash)
        const input = {
          start: frameToLocal(returnFrame, p),
          velocity: from === 'traveling' ? toLocal(shipPose.velocity) : ([0, 0, 0] as Vec3),
          departure: toLocal(tangent),
          escort: base,
          side,
        }
        if (crash) {
          crashPlan.current = planCrash(input)
          duration = crashTotal(crashPlan.current)
        } else {
          returnPlan.current = planReturn(input)
          duration = returnPlan.current.duration
        }
      }
      machine.current = shipReducer(machine.current, { type: 'release', duration })
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
    shipPose.userTravel = step === null || step === 'free'
    // Visita em primeiro plano: o lugar sai da pose para onde a câmera vai (a mesma conta do CameraRig) e da tela.
    const { width, height } = size
    const pfov = (camera as THREE.PerspectiveCamera).fov
    const viewport = { aspect: width / height, fov: pfov }
    const guided = step !== null && step !== 'free'
    const pose = guided
      ? tutorialPose(step, system, repos, stop, layout, viewport)
      : selectionPose(useUniverse.getState().selection, system, stop, layout, viewport)
    const ui = latestVisitUi.current
    const disc = projectDisc(pose, anchor.position, anchor.radius, width, height, pfov)
    const placement = disc ? visitPlacement({ width, height, reserved: ui.reserved, disc }) : null
    const local: Vec3 = placement ? visitLocal(placement, width, height, pfov) : [...latestEscort.current.base]
    const goalFrame = frameFromPose(pose)
    visit.current = { goal: goalFrame, local, targetLocal: [local[0], local[1], local[2]], side: placement?.side ?? 1, disc, layoutKey: ui.key, watch: { ...newVisitWatch(), hand: reduced ? 1 : 0 } }
    const destination = frameToWorld(goalFrame, local)
    if (reduced) {
      machine.current = shipReducer(machine.current, { type: 'arrive', target })
      group.current?.position.set(...destination)
      shipPose.velocity = [0, 0, 0]
    } else {
      // A viagem termina no lugar da visita, no referencial da pose de foco, que já é a do instante em que o tempo
      // para (o alvo não anda mais depois da chegada).
      const destinationAt = () => destination
      // Saindo da visita em primeiro plano (perto da lente): primeiro para longe da câmera, depois a transferência.
      const lens = machine.current.mode === 'visiting' ? writeFrame(newFrame(), camera.position, lagQuat, scratch) : null
      const path = planTransferTo(shipPose.position, destinationAt, {
        sun: barycenterOffset(system, stop),
        // Troca de destino em voo: parte com a velocidade atual (sem quina). Parada (escolta, visita): queima de partida.
        velocity: machine.current.mode === 'traveling' ? shipPose.velocity : null,
        lens,
        bodies: travelBodies(system, stop),
        exclude: target.kind === 'planet' ? target.name : null,
      })
      machine.current = shipReducer(machine.current, { type: 'travel', target, path })
      shipPose.velocity = travelVelocity(path, 0)
    }
    shipPose.mode = machine.current.mode
    shipPose.target = machine.current.target
  }, [target, system, camera, reduced, step, layout, size, repos, lagQuat, returnFrame, scratch])

  /** Disco do alvo na tela agora (px), ou null (sem alvo, ou atrás da câmera). */
  const targetDisc = (target: ShipTarget | null): Disc | null => {
    const anchor = target ? targetAnchor(target, system, simClock.time) : null
    if (!anchor) return null
    const { width, height } = size
    scratch.fromArray(anchor.position).applyMatrix4(camera.matrixWorldInverse)
    const depth = -scratch.z
    if (depth <= 0) return null
    scratch.fromArray(anchor.position).project(camera)
    const tanY = Math.tan((fov * Math.PI) / 360)
    return { x: ((scratch.x + 1) / 2) * width, y: ((1 - scratch.y) / 2) * height, r: (anchor.radius / depth / tanY) * (height / 2) }
  }

  useFrame(({ clock, gl }, rawDt) => {
    const g = group.current
    if (!g) return
    if (!afterShip) setAfterShip(true)
    const dt = Math.min(rawDt, MAX_FRAME_DT)
    // Escolta e visita não mudam de modo com o tempo: avança no lugar, sem alocar um estado novo por frame.
    let s = machine.current
    if (s.mode === 'escort' || s.mode === 'visiting') s.elapsed += dt
    else s = shipReducer(s, { type: 'tick', dt })
    if (s.mode !== renderedMode.current) {
      // Assentou no canto depois da volta: acena uma vez ("voltei").
      if (renderedMode.current === 'returning' && s.mode === 'escort' && !reduced) {
        greetUntil.current = clock.elapsedTime + GREET_SECONDS
        setGreeting(true)
      }
      renderedMode.current = s.mode
      setMode(s.mode)
    }
    if (greetUntil.current >= 0 && clock.elapsedTime > greetUntil.current) {
      greetUntil.current = -1
      setGreeting(false)
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
    let bank = 1
    let slingshot = false
    /** Na volta: frente da nave (mundo) e quanto ela já está de frente para quem vê (0..1). */
    let heading: Vec3 | null = null
    let facing = 0
    const plan = s.mode === 'returning' ? returnPlan.current : null
    const crashFlight = s.mode === 'returning' && !reduced ? crashPlan.current : null

    if (s.mode === 'traveling' && s.path) {
      hasLocal.current = false
      g.position.fromArray(travelPoint(s.path, s.elapsed, posArr))
      tangent = travelTangent(s.path, s.elapsed)
      // Estilingue: inclina forte no sobrevoo e o Octocat comemora (uma vez; nunca por cima da narração da apresentação).
      const assist = s.path.assist
      if (assist && s.elapsed >= assist.start && s.elapsed <= assist.end) {
        bank = ASSIST_BANK
        slingshot = true
        if (announced.current !== s.path) {
          announced.current = s.path
          // a fala só quando a curva se vê (passagens longe curvam pouco, por física)
          if (assist.deflection >= SLINGSHOT_ANNOUNCE && shipPose.userTravel && !usePresentation.getState().state) {
            useUniverse.getState().emitGuide('slingshot')
          }
        }
      }
    } else if (plan && !reduced) {
      // Volta: sai do mundo (referencial da hora da volta) e termina presa à câmera atrasada, no canto da escolta.
      hasLocal.current = false
      writeFrame(frameNow, camera.position, lagQuat, scratch)
      g.position.fromArray(returnPoint(plan, s.elapsed, returnFrame, frameNow, posArr))
      // a frente no mesmo referencial misturado da posição (no começo, o da hora da volta)
      const h = returnHeading(plan, s.elapsed)
      const w = returnBlend(plan, s.elapsed)
      heading = [0, 0, 0]
      for (let k = 0; k < 3; k++) {
        const then = h[0] * returnFrame.right[k] + h[1] * returnFrame.up[k] + h[2] * returnFrame.back[k]
        const now = h[0] * frameNow.right[k] + h[1] * frameNow.up[k] + h[2] * frameNow.back[k]
        heading[k] = then + (now - then) * w
      }
      facing = returnFaceWeight(plan, s.elapsed)
    } else if (crashFlight) {
      // Volta com trombada: o mesmo esquema de referenciais, pelo caminho do mergulho contra a lente
      hasLocal.current = false
      writeFrame(frameNow, camera.position, lagQuat, scratch)
      g.position.fromArray(crashPoint(crashFlight, s.elapsed, returnFrame, frameNow, posArr))
      const h = crashHeading(crashFlight, s.elapsed)
      const w = crashBlend(crashFlight, s.elapsed)
      heading = [0, 0, 0]
      for (let k = 0; k < 3; k++) {
        const then = h[0] * returnFrame.right[k] + h[1] * returnFrame.up[k] + h[2] * returnFrame.back[k]
        const now = h[0] * frameNow.right[k] + h[1] * frameNow.up[k] + h[2] * frameNow.back[k]
        heading[k] = then + (now - then) * w
      }
      facing = crashFaceWeight(crashFlight, s.elapsed)
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
    } else if (s.mode === 'visiting' && visit.current) {
      // Em primeiro plano: preso à pose de foco até a câmera chegar nela, depois à câmera atrasada (gira com ela).
      hasLocal.current = false
      const v = visit.current
      writeFrame(frameNow, camera.position, lagQuat, scratch)
      const far = camera.position.distanceTo(scratch.fromArray(v.goal.position))
      // câmera parada? (velocidade e giro deste quadro)
      const speed = dt > 0 ? camera.position.distanceTo(lastCamPos) / dt : 0
      const turn = dt > 0 ? camera.quaternion.angleTo(lastCamQuat) / dt : 0
      // o alvo na tela agora, comparado com o de quando o lugar foi escolhido
      const ui = latestVisitUi.current
      const disc = targetDisc(s.target)
      const step = visitStep(v.watch, {
        far,
        cameraSpeed: speed,
        cameraTurn: turn,
        dt,
        // sem lugar escolhido pela tela ainda (alvo fora dela na chegada): conta como "andou"
        discShift: disc ? (v.disc ? Math.hypot(disc.x - v.disc.x, disc.y - v.disc.y) / size.height : Infinity) : 0,
        radiusRatio: disc && v.disc ? disc.r / v.disc.r : 1,
        layoutChanged: ui.key !== v.layoutKey,
      })
      if (reduced) v.watch.hand = 1
      if (step.replace && disc) {
        // a interface mudou, ou a câmera assentou com o alvo em outro lugar: escolhe outro lugar e desliza até ele
        const p = visitPlacement({ width: size.width, height: size.height, reserved: ui.reserved, disc })
        v.targetLocal = visitLocal(p, size.width, size.height, fov)
        v.side = p.side
        v.disc = disc
        v.layoutKey = ui.key
      }
      const k = reduced ? 1 : 1 - Math.exp(-VISIT_REPLACE_RATE * dt)
      for (let i = 0; i < 3; i++) v.local[i] += (v.targetLocal[i] - v.local[i]) * k
      const hand = v.watch.hand
      g.position.fromArray(blendFramesPoint(v.goal, frameNow, hand * hand * (3 - 2 * hand), v.local, posArr))
    } else {
      hasLocal.current = false
      look.copy(goal).applyQuaternion(lagQuat).add(camera.position)
      const rate = s.mode === 'returning' ? 3 / RETURN_DURATION : 4
      g.position.lerp(look, reduced ? 1 : 1 - Math.exp(-rate * dt))
    }
    // Nada da nave encosta no plano próximo, nem com a câmera chegando perto dela, em nenhum modo (também na viagem
    // e na volta: a última garantia; a saída perto da lente já se planeja para longe dela).
    keepAway(g.position.toArray(posArr), camera.position.toArray(camArr), MIN_SHIP_DISTANCE, posArr)
    g.position.fromArray(posArr)

    // Trombada: chegou à distância mínima da lente (fim do mergulho) — vidro trinca no ponto da nave na tela, a tela
    // treme, a nave dá um tranco para trás (tentáculos e antena levam o empurrão) e o Octocat fica tonto.
    if (crashFlight && s.elapsed >= crashFlight.duration && crashedPlan.current !== crashFlight) {
      crashedPlan.current = crashFlight
      crashImpact(crashTimeline)
      scratch.copy(g.position).project(camera)
      useCrash.getState().hit(((scratch.x + 1) / 2) * size.width, ((1 - scratch.y) / 2) * size.height, Math.floor(Math.random() * 2 ** 31))
      joltStart.current = clock.elapsedTime
      joltScale.current = -CRASH_JOLT
      setBurnShake((n) => n + 1)
    } else {
      // Interrompida (outra viagem, seleção, tutorial, apresentação): rosto normal na hora, estrelas e trinca somem
      // depressa, sem fala.
      if (crashTimeline.since >= 0) {
        const now = situation.current
        now.mode = s.mode
        now.selection = useUniverse.getState().selection.kind !== 'none'
        now.tutorial = useTutorial.getState().step !== null
        now.presentation = usePresentation.getState().state !== null
        if (crashInterrupted(now)) crashCancel(crashTimeline)
      }
      // as estrelas sumiram: volta a si e pede desculpas (uma vez por trombada)
      if (crashTick(crashTimeline, dt)) useUniverse.getState().emitGuide('crash')
    }
    crashShakeAt(crashTimeline, shakeOut)
    const shift = shakeOut.x || shakeOut.y ? `translate(${shakeOut.x.toFixed(2)}px, ${shakeOut.y.toFixed(2)}px)` : ''
    if (shift || shaken.current) {
      gl.domElement.style.transform = shift
      shaken.current = shift ? gl.domElement : null
    }
    const dizzyNow = crashDizzy(crashTimeline)
    if (dizzyNow !== dizzyRef.current) {
      dizzyRef.current = dizzyNow
      setDizzy(dizzyNow)
    }
    const starryNow = crashStarsAt(crashTimeline, starsOut).opacity > 0
    if (starryNow !== starryRef.current) {
      starryRef.current = starryNow
      setStarry(starryNow)
    }
    lastCamPos.copy(camera.position)
    lastCamQuat.copy(camera.quaternion)

    const yawSide = s.mode === 'visiting' && visit.current ? visit.current.side : escort.side
    // Orientação: na viagem, a frente (+z) segue a tangente e inclina nas curvas. Parada, olha para quem vê:
    // na escolta em três-quartos (nariz para o centro da tela) e, na batida, inclinada para a lente.
    // Parada, o "para cima" é o da câmera: perto da lente, no canto, o para-cima do mundo a deixaria tombada
    // na tela (perspectiva com a câmera olhando para baixo).
    up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    helper.position.copy(g.position)
    if (tangent) {
      helper.up.set(0, 1, 0)
      helper.lookAt(look.set(...tangent).add(g.position))
      shipPose.bank = bankAngle(lastTangent.current, tangent, dt) * bank
      helper.rotateZ(shipPose.bank)
      lastTangent.current = tangent
    } else if (heading) {
      shipPose.bank = 0
      // Volta: segue a frente planejada, inclinando nas curvas; ao chegar, o "para cima" passa a ser o da câmera
      // (como na escolta) e a inclinação some: termina em três-quartos, de frente para quem vê.
      helper.up.set(0, 1, 0).lerp(up, facing).normalize()
      helper.lookAt(look.set(...heading).add(g.position))
      helper.rotateZ(bankAngle(lastTangent.current, heading, dt) * (1 - facing))
      lastTangent.current = heading
      // tonto depois da trombada: bambeia voltando ao canto
      if (crashFlight && s.elapsed > crashFlight.duration) {
        crashWobble(s.elapsed - crashFlight.duration, wobble)
        helper.rotateZ(wobble.roll)
        helper.rotateX(wobble.pitch)
      }
    } else {
      shipPose.bank = 0
      helper.up.copy(up)
      helper.lookAt(camera.position)
      // Na visita, em três-quartos com o nariz para o alvo (o Octocat aponta para ele); na escolta, para o centro.
      helper.rotateY(-yawSide * THREE_QUARTER_YAW)
      if (s.mode !== 'visiting') helper.rotateX(KNOCK_LEAN * knock.closer)
    }
    targetQuat.copy(helper.quaternion)
    g.quaternion.slerp(targetQuat, reduced ? 1 : 1 - Math.exp(-6 * dt))

    // Apoio do balão (DOM, no OctocatSpeech): acima da nave, puxado para o centro da tela, projetado em pixels.
    right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    speech.copy(g.position).addScaledVector(up, BUBBLE_UP).addScaledVector(right, -yawSide * BUBBLE_IN).project(camera)
    shipPose.speechX = ((speech.x + 1) / 2) * size.width
    shipPose.speechY = ((1 - speech.y) / 2) * size.height
    shipPose.speechOnScreen = speech.z < 1 && Math.abs(speech.x) < 1.2 && Math.abs(speech.y) < 1.2
    // o balão desvia do alvo na tela (no celular ele cobria a borda do sol): o OctocatSpeech usa este disco
    const avoid = s.target && (s.mode === 'traveling' || s.mode === 'visiting') ? targetDisc(s.target) : null
    shipPose.speechAvoid.on = avoid !== null
    if (avoid) {
      shipPose.speechAvoid.x = avoid.x
      shipPose.speechAvoid.y = avoid.y
      shipPose.speechAvoid.r = avoid.r
    }

    g.position.toArray(shipPose.position)
    shipPose.tangent = tangent ?? heading ?? shipPose.tangent
    if (s.mode === 'traveling' && s.path) travelVelocity(s.path, s.elapsed, shipPose.velocity)
    else shipPose.velocity.fill(0)
    shipPose.slingshot = slingshot
    // Todo voo (viagem, troca de destino, salto da apresentação, tutorial, volta) tem as mesmas fases de motor:
    // queima forte na partida, chama-piloto na planagem e, na chegada, a frenagem com os puffs de ré (lib/ship/burn).
    const traveling = s.mode === 'traveling' && s.path
    const flight = traveling ? s.path : plan && !reduced ? plan : crashFlight
    const burn = traveling
      ? burnPhase(s.path!, s.elapsed)
      : plan && !reduced
        ? returnBurnPhase(plan, s.elapsed)
        : crashFlight
          ? crashBurnPhase(crashFlight, s.elapsed)
          : null
    const puffs = traveling ? s.path!.burns.puffs : plan && !reduced ? returnBurns(plan).puffs : crashFlight ? crashBurns(crashFlight).puffs : null
    // chegando, a câmera de perseguição já vai para o enquadramento final (CameraRig)
    shipPose.arrival = traveling ? arrivalBlendWeight(s.elapsed, s.path!.duration, s.path!.burns.arrival) : 0
    const puffIndex = puffs ? activePuff(puffs, s.elapsed) : -1
    const last = lastBurn.current
    if (last.flight !== flight) last.puff = -1
    if (burn && burn.phase === 'departure' && last.flight !== flight) {
      // a queima de partida acendeu: a nave dá um tranco e a antena e os tentáculos levam o empurrão
      joltStart.current = clock.elapsedTime
      joltScale.current = 1
      setBurnShake((n) => n + 1)
    }
    if (puffs && puffIndex >= 0 && puffIndex !== last.puff) {
      // um puff de ré: tranco para trás (proporcional à força) e os tentáculos e a antena vão para a frente
      joltStart.current = clock.elapsedTime
      joltScale.current = -PUFF_JOLT * puffs[puffIndex].strength * puffs.length
      setBurnShake((n) => n + 1)
      shipPose.puff.seq++
      shipPose.puff.strength = puffs[puffIndex].strength * puffs.length
      shipPose.puff.duration = puffs[puffIndex].duration
      // na volta a nave freia perto da lente: puffs menores, para não encherem a tela
      shipPose.puff.scale = traveling ? 1 : RETURN_PUFF_SCALE
    }
    if (puffIndex >= 0) last.puff = puffIndex
    last.flight = flight
    shipPose.engine = burn ? burn.intensity : 1
    shipPose.coasting = burn?.phase === 'coast'
    // voando, o nível vem da fase do motor; parada, assenta aos poucos no nível dela (sem estalo depois da chegada)
    const rest = s.mode === 'entering' ? 0.8 : 0.25
    thrustSmooth.current = burn ? flameLevel(burn, s.elapsed) : settleThrust(thrustSmooth.current, rest, dt)
    const level = Math.round(thrustSmooth.current / THRUST_STEP) * THRUST_STEP
    if (level !== thrustRef.current) {
      thrustRef.current = level
      setThrust(level)
    }
    // tranco da queima, no grupo de dentro (a posição da nave no caminho não muda)
    const surge = reduced ? 0 : joltScale.current * burnJolt(clock.elapsedTime - joltStart.current)
    if (jolt.current) {
      jolt.current.position.z = surge
      jolt.current.rotation.x = (-JOLT_PITCH * surge) / JOLT_SURGE
    }
    shipPose.mode = s.mode
    shipPose.target = s.target
  })

  const expression: OctocatExpression = hovered
    ? 'wink'
    : dizzy
      ? 'dizzy'
      : (bubble?.line.expression ?? (mode === 'traveling' || knocking ? 'happy' : 'neutral'))
  const armMode: ArmMode = hovered || knocking || greeting || mode === 'entering' ? 'wave' : mode === 'visiting' ? 'point' : 'rest'
  // com movimento, o nível vem do quadro (fases do motor no voo, assentando parada), em degraus
  const thrusterLevel = !reduced ? thrust : mode === 'entering' ? 0.8 : 0.25

  return (
    <>
      {/* rastro de fogo em coordenadas do mundo, só em voo (perto da lente ele viraria uma faixa grossa) */}
      {!reduced && (mode === 'traveling' || mode === 'returning') && <FireTrail ship={group} nozzle={THRUSTER_ORIGIN} />}
      {/* o programa do rastro compila já na montagem, não no primeiro voo */}
      {!reduced && <TrailWarmup />}
      {/* vapor das pontas das asas na planagem (motor desligado) */}
      {!reduced && afterShip && <Contrails ship={group} tips={WING_TIPS} />}
      {/* puffs de ré da frenagem na chegada */}
      {!reduced && afterShip && <RetroPuffs ship={group} nozzles={RETRO_NOZZLES} />}
      <group
        ref={group}
        scale={SHIP_SCALE}
        onClick={(e) => {
          e.stopPropagation()
          // a nave sai de baixo do cursor parado: sem isso, o piscar e o aceno ficam até o mouse mexer
          setHovered(false)
          startTutorial()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
      >
        <group ref={jolt}>
          <OctocatShip expression={expression} armMode={armMode} thrusterLevel={thrusterLevel} floating={mode !== 'traveling'} shake={burnShake} dazed={starry} />
        </group>
      </group>
    </>
  )
}
