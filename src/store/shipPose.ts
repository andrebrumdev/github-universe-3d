import type { ShipMode } from '@/lib/ship/shipMachine'
import type { Vec3 } from '@/lib/universe/orbits'

/** Mutável de propósito: escrito pela nave a cada frame, lido pela câmera. */
export const shipPose: { position: Vec3; tangent: Vec3; mode: ShipMode; userTravel: boolean } = {
  position: [0, 0, 0],
  tangent: [0, 0, 1],
  mode: 'entering',
  userTravel: false,
}
