import { Ship } from './Ship'

export interface OctocatShipParts {
  ship: boolean
  pilot: boolean
  hat: boolean
}

export const ALL_PARTS: OctocatShipParts = { ship: true, pilot: true, hat: true }

interface OctocatShipProps {
  thrusterLevel?: number
  parts?: OctocatShipParts
}

export function OctocatShip({ thrusterLevel = 0.3, parts = ALL_PARTS }: OctocatShipProps) {
  return <group>{parts.ship && <Ship thrusterLevel={thrusterLevel} />}</group>
}
