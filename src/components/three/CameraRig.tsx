import { useEffect, useRef, type ComponentRef } from 'react'
import { CameraControls } from '@react-three/drei'
import { MOBILE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { maxCameraDistance, selectionPose } from '@/lib/cameraPoses'
import { predictStopTime } from '@/lib/universe/clock'
import type { OrbitSystem } from '@/lib/universe/orbits'
import { simClock } from '@/store/simClock'
import { useUniverse } from '@/store/universe'

export function CameraRig({ system }: { system: OrbitSystem }) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null)
  const selection = useUniverse((s) => s.selection)
  const layout = useMediaQuery(MOBILE_QUERY) ? 'bottom' : 'side'

  useEffect(() => {
    // O tempo desacelera até parar ao focar: mira onde o planeta vai estar quando parar.
    const pose = selectionPose(selection, system, predictStopTime(simClock), layout)
    void controls.current?.setLookAt(...pose.position, ...pose.target, true)
  }, [selection, system, layout])

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={2}
      maxDistance={maxCameraDistance(system)}
      smoothTime={0.6}
      dollyToCursor={false}
    />
  )
}
