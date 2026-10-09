import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import type * as THREE from 'three'
import type { OctocatExpression } from '@/lib/octocat/expression'
import { COCKPIT } from '@/lib/ship/geometry'
import { hoverOffset, isBlinking } from '@/lib/ship/motion'
import { ClawdHat } from './ClawdHat'
import { Pilot, type ArmMode } from './Pilot'
import { Ship } from './Ship'

export type { ArmMode }

export interface OctocatShipParts {
  ship: boolean
  pilot: boolean
  hat: boolean
}

export const ALL_PARTS: OctocatShipParts = { ship: true, pilot: true, hat: true }

interface OctocatShipProps {
  expression?: OctocatExpression
  armMode?: ArmMode
  thrusterLevel?: number
  floating?: boolean
  parts?: OctocatShipParts
  /** Muda a cada pedido de tranco (botão "Sacudir" do preview): tentáculos e antena balançam. */
  shake?: number
}

export function OctocatShip({
  expression = 'neutral',
  armMode = 'rest',
  thrusterLevel = 0.3,
  floating = true,
  parts = ALL_PARTS,
  shake = 0,
}: OctocatShipProps) {
  const root = useRef<THREE.Group>(null)
  const blinkRef = useRef(false)
  const [blinking, setBlinking] = useState(false)
  const reduced = useReducedMotion() ?? false

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const blink = !reduced && isBlinking(t)
    if (blink !== blinkRef.current) {
      blinkRef.current = blink
      setBlinking(blink)
    }
    if (root.current) {
      const hover = floating && !reduced ? hoverOffset(t) : { y: 0, roll: 0 }
      root.current.position.y = hover.y
      root.current.rotation.z = hover.roll
    }
  })

  return (
    <group ref={root}>
      {parts.ship && <Ship thrusterLevel={thrusterLevel} shake={shake} />}
      {/* piloto e gorro em coordenadas do SVG, levados para dentro da bolha pelo COCKPIT, de frente para +z */}
      <group position={COCKPIT.position} scale={COCKPIT.scale}>
        {parts.pilot && <Pilot expression={expression} blinking={blinking} armMode={armMode} shake={shake} />}
        {parts.hat && <ClawdHat />}
      </group>
    </group>
  )
}
