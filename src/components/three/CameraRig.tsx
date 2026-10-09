import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { Vector3, type PerspectiveCamera } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import { MOBILE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { maxCameraDistance, selectionPose, tutorialPose, type PanelLayout, type Pose, type Viewport } from '@/lib/cameraPoses'
import {
  blendPose,
  CHASE_SPRING,
  chasePose,
  chaseRoll,
  createArrivalFrame,
  driveUp,
  FOCUS_SPRING,
  MAX_CHASE_LEAD,
  springLead,
  springStep,
  stepArrivalFrame,
  type Spring3,
} from '@/lib/ship/escort'
import { FOCUS_MAX_DISTANCE, FOCUS_MIN_DISTANCE, focusPose } from '@/lib/ship/focus'
import { length, sub } from '@/lib/ship/vec'
import type { Repo } from '@/lib/types'
import { predictStopTime } from '@/lib/universe/clock'
import type { OrbitSystem, Vec3 } from '@/lib/universe/orbits'
import { bindCameraLock } from '@/store/cameraLock'
import { crashCamera } from '@/store/crash'
import { usePresentation } from '@/store/presentation'
import { flightClock } from '@/store/frameClock'
import { shipPose } from '@/store/shipPose'
import { simClock } from '@/store/simClock'
import { useTutorial } from '@/store/tutorial'
import { useUniverse } from '@/store/universe'

/** Perto disso da pose final, a mola entrega a câmera ao CameraControls exatamente nela (sem transição: sem salto). */
const HANDOFF_DISTANCE = 0.02
/** Arrasto "de verdade": a pose pedida pelo usuário andou mais que essa fração da distância da câmera ao alvo. */
const REAL_DRAG = 0.02
/** Taxa (1/s) com que a inclinação da câmera segue a da nave (e volta a zero fora da perseguição). */
const ROLL_RATE = 3

interface Drive {
  position: Spring3
  target: Spring3
}

export function CameraRig({ system, repos }: { system: OrbitSystem; repos: Repo[] }) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null)
  const [driving, setDriving] = useState(false)
  const selection = useUniverse((s) => s.selection)
  /** Modo de foco na nave: a câmera voa até ela e orbita em volta (zoom com limites, sem arrastar o alvo). */
  const shipFocus = selection.kind === 'ship'
  const step = useTutorial((s) => s.step)
  const guided = step !== null && step !== 'free'
  const layout: PanelLayout = useMediaQuery(MOBILE_QUERY) ? 'bottom' : 'side'
  const reduced = useReducedMotion() ?? false
  // girando o sol: a câmera não gira junto (só leitura; o Sun liga e desliga a trava)
  const aspect = useThree((s) => s.size.width / s.size.height)
  const fov = useThree((s) => (s.camera as PerspectiveCamera).fov)
  const viewport = useMemo<Viewport>(() => ({ aspect, fov }), [aspect, fov])
  // Com um planeta em foco, redimensionar não deve tirar a câmera de lá;
  // durante o tutorial guiado, a câmera sempre re-enquadra a pose do passo.
  const framing = guided || selection.kind === 'none' || selection.kind === 'profile'
  const latest = useRef({ selection, viewport, layout })
  useEffect(() => {
    latest.current = { selection, viewport, layout }
  })
  const viewportKey = framing ? viewport : null
  /** A câmera é puxada (pela nave ou pela mola até a pose final) enquanto isto existir; o arrasto fica desligado. */
  const drive = useRef<Drive | null>(null)
  /** Enquadrar a seleção atual assim que a nave não estiver em viagem do usuário. */
  const focusRequest = useRef(false)
  const scratch = useMemo(() => new Vector3(), [])
  const camera = useThree((s) => s.camera)
  /** Inclinação atual da câmera (rad); o "para cima" do quadro (com e sem a inclinação, ver `chaseUp`). */
  const roll = useRef(0)
  const up = useRef<Vec3>([0, 1, 0])
  const upBase = useRef<Vec3>([0, 1, 0])
  /** Enquadramento final da chegada (peso, pose e destino), misturado depois da mola: pousa nele com a nave parada. */
  const arrival = useRef(createArrivalFrame())
  /** Pose entregue no último quadro de perseguição e se ele estava misturado com o enquadramento final. */
  const lastOut = useRef<Pose>({ position: [0, 0, 0], target: [0, 0, 0] })
  const wasBlended = useRef(false)
  const view = useRef<Vec3>([0, 0, -1])

  /**
   * Larga a condução por qualquer caminho (pousou, tutorial guiado, movimento reduzido, troca de seleção): sem mola,
   * sem inclinação e com o "para cima" do mundo de volta no CameraControls (senão o tutorial sairia torto).
   */
  const releaseDrive = useCallback(() => {
    drive.current = null
    roll.current = 0
    arrival.current.weight = 0
    arrival.current.key = null
    wasBlended.current = false
    driveUp(false, view.current, upBase.current, 0, up.current, upBase.current)
    if (camera.up.x !== 0 || camera.up.y !== 1 || camera.up.z !== 0) {
      camera.up.set(0, 1, 0)
      controls.current?.updateCameraUp()
    }
  }, [camera])
  // Início do gesto do usuário na câmera (posição e alvo pedidos), para separar um arrasto de um clique.
  const gesture = useRef({ from: new Vector3(), fromTarget: new Vector3(), now: new Vector3(), active: false })
  /** Enquadrar a nave assim que ela estacionar (o ShipRig escreve onde em `shipPose.focus`). */
  const shipFocusRequest = useRef(false)

  // Modo de foco: sem arrastar o alvo (botão direito, dois e três dedos só aproximam); o arrasto na própria nave a gira
  // (useShipPlay) e não chega aqui. Fora dele, os botões de sempre.
  useEffect(() => {
    const c = controls.current
    if (!c || !shipFocus) return
    const { ACTION } = CameraControlsImpl
    // só os botões do modo: o giro de um ponteiro é da trava (bindCameraLock), que pode estar pega agora
    const saved = { right: c.mouseButtons.right, two: c.touches.two, three: c.touches.three }
    c.mouseButtons.right = ACTION.NONE
    c.touches.two = ACTION.TOUCH_DOLLY
    c.touches.three = ACTION.NONE
    return () => {
      c.mouseButtons.right = saved.right
      c.touches.two = saved.two
      c.touches.three = saved.three
    }
  }, [shipFocus])

  // Trava da câmera com dono (girar a nave ou o sol arrastando): aplicada na hora, direto na instância, a cada troca de
  // dono; sem `enabled`, que limparia o `touch-action` do canvas.
  useEffect(() => {
    const c = controls.current
    if (!c) return
    return bindCameraLock(c, CameraControlsImpl.ACTION.NONE)
  }, [])

  useEffect(() => {
    const { selection: sel, viewport: vp } = latest.current
    if (sel.kind === 'ship') {
      // quem leva a câmera até a nave é o useFrame, quando ela tiver estacionado
      releaseDrive()
      focusRequest.current = false
      shipFocusRequest.current = true
      return
    }
    shipFocusRequest.current = false
    // O tempo desacelera até parar ao focar: mira onde o planeta vai estar quando parar.
    const stop = predictStopTime(simClock)
    if (guided && step) {
      releaseDrive()
      focusRequest.current = false
      const pose = tutorialPose(step, system, repos, stop, layout, vp)
      void controls.current?.setLookAt(...pose.position, ...pose.target, !reduced)
      return
    }
    // Movimento normal: quem conduz é a nave (useFrame) — persegue a viagem e depois assenta na pose.
    if (!reduced) {
      focusRequest.current = true
      return
    }
    releaseDrive()
    focusRequest.current = false
    const pose = selectionPose(sel, system, stop, layout, vp)
    void controls.current?.setLookAt(...pose.position, ...pose.target, false)
  }, [selection, step, guided, repos, system, layout, reduced, viewportKey, releaseDrive])

  // Roda depois dos efeitos do commit: a nave já decidiu (no efeito dela) se viaja ou não.
  useFrame(({ clock }, rawDt) => {
    const c = controls.current
    if (!c) return
    if (shipFocus) {
      // Modo de foco: um voo só até o três-quartos da nave estacionada (transição do CameraControls, instantânea com
      // movimento reduzido); depois, o usuário orbita em volta dela.
      if (drive.current) releaseDrive()
      if (driving) setDriving(false)
      const spot = shipPose.focus
      if (shipFocusRequest.current && shipPose.mode === 'focus' && spot) {
        shipFocusRequest.current = false
        const pose = focusPose(spot.center, spot.front, latest.current.viewport)
        void c.setLookAt(...pose.position, ...pose.target, !reduced)
      }
      return
    }
    if (reduced || guided) {
      if (drive.current) releaseDrive()
      if (driving) setDriving(false)
      return
    }
    // o mesmo passo suavizado da nave (ver store/frameClock): câmera e nave andam juntas, sem tremido
    const dt = flightClock.step(clock.elapsedTime, rawDt)
    const chase = shipPose.mode === 'traveling' && shipPose.userTravel
    let goal: Pose | null = null
    if (chase) {
      // A câmera mira à frente na velocidade da nave (analítica, do caminho — sem diferença entre frames,
      // que estourava ao trocar de destino ou num frame lento), com limite: alcança nas curvas e atrasa na partida.
      const raw = chasePose(shipPose.position, shipPose.tangent)
      goal = {
        position: springLead(raw.position, shipPose.velocity, CHASE_SPRING, MAX_CHASE_LEAD),
        target: springLead(raw.target, shipPose.velocity, CHASE_SPRING, MAX_CHASE_LEAD),
      }
      // Ao chegar, a câmera já está no enquadramento da seleção (misturado depois da mola, abaixo).
      focusRequest.current = true
    } else if (crashCamera.hold) {
      // Trombada: enquanto a nave vem para a lente, a câmera freia até parar onde está (o alvo de cada mola é onde
      // ela pararia deslizando), sem ir para a visão geral; o pedido de foco fica para depois do impacto.
      const d = drive.current
      if (!d) return
      const coast = (s: Spring3): Vec3 => [0, 1, 2].map((k) => s.position[k] + s.velocity[k] / FOCUS_SPRING) as Vec3
      goal = { position: coast(d.position), target: coast(d.target) }
    } else if (focusRequest.current || drive.current) {
      const { selection: sel, viewport: vp, layout: lay } = latest.current
      goal = selectionPose(sel, system, predictStopTime(simClock), lay, vp)
      focusRequest.current = false
      // Saindo da perseguição misturada (chegou): a mola parte da pose entregue, parada — sem acerto depois.
      if (wasBlended.current && drive.current) {
        drive.current.position = { position: [...lastOut.current.position], velocity: [0, 0, 0] }
        drive.current.target = { position: [...lastOut.current.target], velocity: [0, 0, 0] }
      }
      wasBlended.current = false
      arrival.current.weight = 0
      arrival.current.key = null
    }
    if (!goal) return

    // A câmera parte de onde está, parada: a nave puxa e ela vem um instante depois, sem salto.
    const d = (drive.current ??= {
      position: { position: c.getPosition(scratch, false).toArray() as Vec3, velocity: [0, 0, 0] },
      target: { position: c.getTarget(scratch, false).toArray() as Vec3, velocity: [0, 0, 0] },
    })
    const omega = chase ? CHASE_SPRING : FOCUS_SPRING
    d.position = springStep(d.position, goal.position, omega, dt)
    d.target = springStep(d.target, goal.target, omega, dt)

    // Chegando: o enquadramento final é misturado DEPOIS da mola (peso 1 com a nave parada = exatamente a pose
    // final); numa troca de destino no meio, solta de volta pela pose antiga (ver `stepArrivalFrame`).
    let out: Pose = { position: d.position.position, target: d.target.position }
    const a = arrival.current
    if (chase && (shipPose.arrival > 0 || a.weight > 0)) {
      const { selection: sel, viewport: vp, layout: lay } = latest.current
      const t = shipPose.target
      const key = t ? (t.kind === 'sun' ? 'sun' : t.name) : ''
      stepArrivalFrame(a, shipPose.arrival, selectionPose(sel, system, predictStopTime(simClock), lay, vp), key, dt)
      if (a.weight > 0) out = blendPose(out, a.pose, a.weight)
    }
    if (chase) {
      for (let k = 0; k < 3; k++) {
        lastOut.current.position[k] = out.position[k]
        lastOut.current.target[k] = out.target[k]
      }
      wasBlended.current = a.weight > 0
    }

    const settled =
      !chase &&
      length(sub(d.position.position, goal.position)) < HANDOFF_DISTANCE &&
      length(sub(d.target.position, goal.target)) < HANDOFF_DISTANCE
    // Inclina só um pouco com a nave (e volta a zero fora da perseguição); o "para cima" nunca vira.
    const rollGoal = chase ? chaseRoll(shipPose.bank) * (1 - a.weight) : 0
    roll.current += (rollGoal - roll.current) * (1 - Math.exp(-ROLL_RATE * dt))
    if (settled) {
      // entrega exatamente na pose final, sem transição (a mola já está nela)
      releaseDrive()
      void c.setLookAt(...goal.position, ...goal.target, false)
    } else {
      const v = view.current
      for (let k = 0; k < 3; k++) v[k] = out.target[k] - out.position[k]
      const l = Math.hypot(v[0], v[1], v[2]) || 1
      for (let k = 0; k < 3; k++) v[k] /= l
      const u = driveUp(true, v, upBase.current, Math.abs(roll.current) < 1e-4 ? 0 : roll.current, up.current, upBase.current)
      camera.up.set(u[0], u[1], u[2])
      c.updateCameraUp()
      void c.setLookAt(...out.position, ...out.target, false)
    }
    if (driving !== !settled) setDriving(!settled)
  })

  return (
    <CameraControls
      ref={controls}
      makeDefault
      enabled={!guided && !driving}
      minDistance={shipFocus ? FOCUS_MIN_DISTANCE : 2}
      maxDistance={shipFocus ? FOCUS_MAX_DISTANCE : maxCameraDistance(system, viewport)}
      smoothTime={0.6}
      dollyToCursor={false}
      onControlStart={() => {
        const c = controls.current
        const g = gesture.current
        if (!c) return
        c.getPosition(g.from)
        c.getTarget(g.fromTarget)
        g.active = true
      }}
      onControl={() => {
        // Arrastar (ou rolar) a câmera de verdade encerra a apresentação: a intenção do usuário vence.
        const c = controls.current
        const g = gesture.current
        if (!c || !g.active || !usePresentation.getState().state) return
        const reach = g.from.distanceTo(g.fromTarget) * REAL_DRAG
        const moved = c.getPosition(g.now).distanceTo(g.from) + c.getTarget(g.now).distanceTo(g.fromTarget)
        if (moved > reach) {
          g.active = false
          usePresentation.getState().interrupt()
        }
      }}
      onControlEnd={() => {
        gesture.current.active = false
      }}
    />
  )
}
