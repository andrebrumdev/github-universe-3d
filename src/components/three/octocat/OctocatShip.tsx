import type { OctocatExpression } from '@/lib/octocat/expression'
import { COCKPIT } from '@/lib/ship/geometry'
import { Pilot, type ArmMode } from './Pilot'
import { Ship } from './Ship'

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
  parts?: OctocatShipParts
}

export function OctocatShip({ expression = 'neutral', armMode = 'rest', thrusterLevel = 0.3, parts = ALL_PARTS }: OctocatShipProps) {
  return (
    <group>
      {parts.ship && <Ship thrusterLevel={thrusterLevel} />}
      {/* piloto em coordenadas do SVG, levado para dentro da bolha pelo COCKPIT, de frente para +z */}
      <group position={COCKPIT.position} scale={COCKPIT.scale}>
        {parts.pilot && <Pilot expression={expression} blinking={false} armMode={armMode} />}
      </group>
    </group>
  )
}
