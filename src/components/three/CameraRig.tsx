import { useEffect, useMemo, useRef, type ComponentRef } from 'react'
import type { PerspectiveCamera } from 'three'
import { useThree } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import { MOBILE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { maxCameraDistance, selectionPose, tutorialPose, type Viewport } from '@/lib/cameraPoses'
import type { Repo } from '@/lib/types'
import { predictStopTime } from '@/lib/universe/clock'
import type { OrbitSystem } from '@/lib/universe/orbits'
import { simClock } from '@/store/simClock'
import { useTutorial } from '@/store/tutorial'
import { useUniverse } from '@/store/universe'

export function CameraRig({ system, repos }: { system: OrbitSystem; repos: Repo[] }) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null)
  const selection = useUniverse((s) => s.selection)
  const step = useTutorial((s) => s.step)
  const guided = step !== null && step !== 'free'
  const layout = useMediaQuery(MOBILE_QUERY) ? 'bottom' : 'side'
  const reduced = useReducedMotion() ?? false
  const aspect = useThree((s) => s.size.width / s.size.height)
  const fov = useThree((s) => (s.camera as PerspectiveCamera).fov)
  const viewport = useMemo<Viewport>(() => ({ aspect, fov }), [aspect, fov])
  // Com um planeta em foco, redimensionar não deve tirar a câmera de lá;
  // durante o tutorial guiado, a câmera sempre re-enquadra a pose do passo.
  const framing = guided || selection.kind === 'none' || selection.kind === 'profile'
  const latest = useRef({ selection, viewport })
  useEffect(() => {
    latest.current = { selection, viewport }
  })
  const viewportKey = framing ? viewport : null

  useEffect(() => {
    const { selection: sel, viewport: vp } = latest.current
    // O tempo desacelera até parar ao focar: mira onde o planeta vai estar quando parar.
    const stop = predictStopTime(simClock)
    const pose = guided && step ? tutorialPose(step, system, repos, stop, layout, vp) : selectionPose(sel, system, stop, layout, vp)
    void controls.current?.setLookAt(...pose.position, ...pose.target, !reduced)
  }, [selection, step, guided, repos, system, layout, reduced, viewportKey])

  return (
    <CameraControls
      ref={controls}
      makeDefault
      enabled={!guided}
      minDistance={2}
      maxDistance={maxCameraDistance(system, viewport)}
      smoothTime={0.6}
      dollyToCursor={false}
    />
  )
}
