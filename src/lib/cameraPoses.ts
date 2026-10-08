import { selectedPlanet, type UniverseSelection } from './interaction'
import { planetPosition, type OrbitSystem, type Vec3 } from './universe/orbits'

export type PanelLayout = 'side' | 'bottom'

export interface Pose {
  position: Vec3
  target: Vec3
}

export interface Viewport {
  aspect: number
  /** Campo de visão vertical, em graus (como na câmera do three). */
  fov: number
}

export const DEFAULT_VIEWPORT: Viewport = { aspect: 16 / 10, fov: 50 }

export function overviewPose(system: OrbitSystem, viewport: Viewport = DEFAULT_VIEWPORT): Pose {
  const outer = system.rings[system.rings.length - 1]
  const reach = outer ? outer.a * (1 + outer.e) + outer.maxRadius : 12
  const vertical = reach * 1.5 + 10
  // A câmera fica em x = 0: a extensão do anel em X vira a extensão horizontal da tela.
  const halfTan = Math.tan((viewport.fov * Math.PI) / 360) * viewport.aspect
  const fitH = (reach * 1.1) / halfTan
  const d = Math.max(vertical, fitH)
  return { position: [0, d * 0.6, d], target: [0, 0, 0] }
}

export function maxCameraDistance(system: OrbitSystem, viewport: Viewport = DEFAULT_VIEWPORT): number {
  const [x, y, z] = overviewPose(system, viewport).position
  return Math.hypot(x, y, z) * 1.4
}

export function sunPose(layout: PanelLayout): Pose {
  return layout === 'side' ? { position: [0, 3, 13], target: [2.5, 0, 0] } : { position: [0, 3, 13], target: [0, -2, 0] }
}

export function planetPose(position: Vec3, radius: number, layout: PanelLayout): Pose {
  const [x, y, z] = position
  const len = Math.hypot(x, z) || 1
  const ox = x / len
  const oz = z / len // para fora do sol
  // Tangente à órbita, puxada para o lado do sol: vê metade iluminada e metade na sombra.
  let dx = -oz - 0.5 * ox
  let dz = ox - 0.5 * oz
  const dl = Math.hypot(dx, dz)
  dx /= dl
  dz /= dl
  const dist = radius * 4 + 3
  const shift = radius * 1.3
  return {
    position: [x + dx * dist, y + radius * 1.2, z + dz * dist],
    // Direita da câmera = (dz, 0, −dx). Alvo à direita → planeta aparece à esquerda do painel.
    target: layout === 'side' ? [x + dz * shift, y, z - dx * shift] : [x, y - shift, z],
  }
}

export function planetFocusPose(system: OrbitSystem, name: string, time: number, layout: PanelLayout): Pose | null {
  const orbit = system.orbits.find((o) => o.name === name)
  if (!orbit) return null
  return planetPose(planetPosition(system.rings[orbit.ring], orbit, time), orbit.radius, layout)
}

export function selectionPose(
  sel: UniverseSelection,
  system: OrbitSystem,
  time: number,
  layout: PanelLayout,
  viewport: Viewport = DEFAULT_VIEWPORT,
): Pose {
  if (sel.kind === 'profile') return sunPose(layout)
  const name = selectedPlanet(sel)
  return (name && planetFocusPose(system, name, time, layout)) || overviewPose(system, viewport)
}
