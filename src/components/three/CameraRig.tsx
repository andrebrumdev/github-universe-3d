import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { Vector3, type PerspectiveCamera } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import { MOBILE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { maxCameraDistance, selectionPose, tutorialPose, type PanelLayout, type Pose, type Viewport } from '@/lib/cameraPoses'
import { CHASE_SPRING, chasePose, FOCUS_SPRING, springLead, springStep, type Spring3 } from '@/lib/ship/escort'
import { length, scale, sub } from '@/lib/ship/vec'
import type { Repo } from '@/lib/types'
import { predictStopTime } from '@/lib/universe/clock'
import type { OrbitSystem, Vec3 } from '@/lib/universe/orbits'
import { shipPose } from '@/store/shipPose'
import { simClock } from '@/store/simClock'
import { useTutorial } from '@/store/tutorial'
import { useUniverse } from '@/store/universe'

/** Perto disso da pose final, a mola entrega a câmera ao CameraControls (que termina o resto suave). */
const HANDOFF_DISTANCE = 0.3

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
  /** Pose de perseguição do frame anterior, para estimar a velocidade dela (antecipação da mola). */
  const lastChase = useRef<Pose | null>(null)
  const scratch = useMemo(() => new Vector3(), [])

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
    const dt = Math.min(rawDt, 0.1)
    const chase = shipPose.mode === 'traveling' && shipPose.userTravel
    let goal: Pose | null = null
    if (chase) {
      // A câmera mira à frente na velocidade da nave: alcança nas curvas e só atrasa quando a nave acelera.
      const raw = chasePose(shipPose.position, shipPose.tangent)
      const prev = lastChase.current
      const velocity = (now: Vec3, before: Vec3 | undefined): Vec3 => (before && dt > 0 ? scale(sub(now, before), 1 / dt) : [0, 0, 0])
      goal = {
        position: springLead(raw.position, velocity(raw.position, prev?.position), CHASE_SPRING),
        target: springLead(raw.target, velocity(raw.target, prev?.target), CHASE_SPRING),
      }
      lastChase.current = raw
      // Ao chegar, a mesma mola leva a câmera da perseguição até a pose da seleção.
      focusRequest.current = true
    } else if (focusRequest.current || drive.current) {
      lastChase.current = null
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
    if (settled) {
      drive.current = null
      void c.setLookAt(...goal.position, ...goal.target, true)
    } else {
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
    />
  )
}
