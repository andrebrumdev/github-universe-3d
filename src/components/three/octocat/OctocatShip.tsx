import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import type * as THREE from 'three'
import type { OctocatExpression } from '@/lib/octocat/expression'
import { COCKPIT } from '@/lib/ship/geometry'
import { hoverOffset, isBlinking } from '@/lib/ship/motion'
import { ClawdHat } from './ClawdHat'
import { DazedStars } from './DazedStars'
import type { InertiaFrame } from './flexRod'
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
  /** Nível do propulsor lido a cada quadro (o ShipRig no voo): sem re-render do React a cada degrau da chama. */
  thrusterRef?: { readonly current: number }
  floating?: boolean
  parts?: OctocatShipParts
  /** Muda a cada pedido de tranco (botão "Sacudir" do preview): tentáculos e antena balançam. */
  shake?: number
  /**
   * Referencial da inércia dos tentáculos e da antena. `auto` (o padrão, no ShipRig) mede contra a câmera
   * enquanto a nave está ancorada nela (entrada, escolta) e contra o mundo no resto; `world` sempre o mundo
   * (preview: a nave fica parada e só a câmera orbita).
   */
  inertiaFrame?: InertiaFrame
  /** Tonto depois da trombada na tela: estrelinhas girando em volta da cabeça. */
  dazed?: boolean
}

export function OctocatShip({
  expression = 'neutral',
  armMode = 'rest',
  thrusterLevel = 0.3,
  thrusterRef,
  floating = true,
  parts = ALL_PARTS,
  shake = 0,
  inertiaFrame = 'auto',
  dazed = false,
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
      {parts.ship && <Ship thrusterLevel={thrusterLevel} thrusterRef={thrusterRef} shake={shake} inertiaFrame={inertiaFrame} />}
      {/* piloto e gorro em coordenadas do SVG, levados para dentro da bolha pelo COCKPIT, de frente para +z */}
      <group position={COCKPIT.position} scale={COCKPIT.scale}>
        {parts.pilot && <Pilot expression={expression} blinking={blinking} armMode={armMode} shake={shake} inertiaFrame={inertiaFrame} />}
        {parts.hat && <ClawdHat />}
        {dazed && <DazedStars />}
      </group>
    </group>
  )
}
