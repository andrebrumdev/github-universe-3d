import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { Vector3, type PerspectiveCamera } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import { MOBILE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { maxCameraDistance, selectionPose, tutorialPose, type PanelLayout, type Pose, type Viewport } from '@/lib/cameraPoses'
import {
  blendPose,
  CHASE_SPRING,
  chasePose,
  chaseRoll,
  chaseUp,
  easeArrivalBlend,
  FOCUS_SPRING,
  MAX_CHASE_LEAD,
  springLead,
  springStep,
  type Spring3,
} from '@/lib/ship/escort'
import { MAX_FRAME_DT } from '@/lib/ship/motion'
import { length, normalize, sub } from '@/lib/ship/vec'
import type { Repo } from '@/lib/types'
import { predictStopTime } from '@/lib/universe/clock'
import type { OrbitSystem, Vec3 } from '@/lib/universe/orbits'
import { usePresentation } from '@/store/presentation'
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
  const step = useTutorial((s) => s.step)
  const guided = step !== null && step !== 'free'
  const layout: PanelLayout = useMediaQuery(MOBILE_QUERY) ? 'bottom' : 'side'
  const reduced = useReducedMotion() ?? false
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
  /** Inclinação atual da câmera (rad) e o "para cima" do quadro anterior (estável, ver `chaseUp`). */
  const roll = useRef(0)
  /** Peso do enquadramento final durante a chegada (0 = perseguição), com a soltura suave numa troca de destino. */
  const arrivalWeight = useRef(0)
  const up = useMemo<Vec3>(() => [0, 1, 0], [])
  // Início do gesto do usuário na câmera (posição e alvo pedidos), para separar um arrasto de um clique.
  const gesture = useRef({ from: new Vector3(), fromTarget: new Vector3(), now: new Vector3(), active: false })

  useEffect(() => {
    const { selection: sel, viewport: vp } = latest.current
    // O tempo desacelera até parar ao focar: mira onde o planeta vai estar quando parar.
    const stop = predictStopTime(simClock)
    if (guided && step) {
      drive.current = null
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
    drive.current = null
    focusRequest.current = false
    const pose = selectionPose(sel, system, stop, layout, vp)
    void controls.current?.setLookAt(...pose.position, ...pose.target, false)
  }, [selection, step, guided, repos, system, layout, reduced, viewportKey])

  // Roda depois dos efeitos do commit: a nave já decidiu (no efeito dela) se viaja ou não.
  useFrame((_, rawDt) => {
    const c = controls.current
    if (!c) return
    if (reduced || guided) {
      drive.current = null
      if (driving) setDriving(false)
      return
    }
    const dt = Math.min(rawDt, MAX_FRAME_DT)
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
      // Chegando: a câmera já vai para o enquadramento final (o mesmo da seleção), pousando nele quando a nave para.
      arrivalWeight.current = easeArrivalBlend(arrivalWeight.current, shipPose.arrival, dt)
      if (arrivalWeight.current > 0) {
        const { selection: sel, viewport: vp, layout: lay } = latest.current
        goal = blendPose(goal, selectionPose(sel, system, predictStopTime(simClock), lay, vp), arrivalWeight.current)
      }
      // Ao chegar, a mesma mola leva a câmera da perseguição até a pose da seleção.
      focusRequest.current = true
    } else if (focusRequest.current || drive.current) {
      arrivalWeight.current = 0
      const { selection: sel, viewport: vp, layout: lay } = latest.current
      goal = selectionPose(sel, system, predictStopTime(simClock), lay, vp)
      focusRequest.current = false
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

    const settled =
      !chase &&
      length(sub(d.position.position, goal.position)) < HANDOFF_DISTANCE &&
      length(sub(d.target.position, goal.target)) < HANDOFF_DISTANCE
    // Inclina só um pouco com a nave (e volta a zero fora da perseguição); o "para cima" nunca vira.
    const rollGoal = chase ? chaseRoll(shipPose.bank) * (1 - arrivalWeight.current) : 0
    roll.current += (rollGoal - roll.current) * (1 - Math.exp(-ROLL_RATE * dt))
    if (settled) {
      drive.current = null
      roll.current = 0
      camera.up.set(0, 1, 0)
      c.updateCameraUp()
      void c.setLookAt(...goal.position, ...goal.target, false)
    } else {
      chaseUp(normalize(sub(d.target.position, d.position.position), [0, 0, -1]), up, Math.abs(roll.current) < 1e-4 ? 0 : roll.current, up)
      camera.up.set(up[0], up[1], up[2])
      c.updateCameraUp()
      void c.setLookAt(...d.position.position, ...d.target.position, false)
    }
    if (driving !== !settled) setDriving(!settled)
  })

  return (
    <CameraControls
      ref={controls}
      makeDefault
      enabled={!guided && !driving}
      minDistance={2}
      maxDistance={maxCameraDistance(system, viewport)}
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
