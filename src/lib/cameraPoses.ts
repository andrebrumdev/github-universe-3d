import { selectedPlanet, type UniverseSelection } from './interaction'
import type { TutorialStep } from './tutorial'
import type { RepoBase } from './types'
import { barycenterOffset } from './universe/barycenter'
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

/** Elevação da câmera da visão geral: posição (0, OVERVIEW_RISE·d, d), olhando para o sol. */
const OVERVIEW_RISE = 0.6

export function overviewPose(system: OrbitSystem, viewport: Viewport = DEFAULT_VIEWPORT): Pose {
  const outer = system.rings[system.rings.length - 1]
  const reach = outer ? outer.a * (1 + outer.e) + outer.maxRadius : 12
  // Com a precessão do periélio, o afélio passa pelo lado da câmera: o ponto mais baixo na tela é (0, −h, reach),
  // com h a maior altura de um anel inclinado (mais o alcance do corpo). Ele cabe se o ângulo abaixo do horizonte
  // não passar de elevação + meio fov: (RISE·d + h) / (d − reach) ≤ tan(elevação + fov/2).
  const height = system.rings.reduce((h, r) => Math.max(h, r.a * (1 + r.e) * Math.abs(Math.sin(r.inclination)) + r.maxRadius), 0)
  const T = Math.tan(Math.atan(OVERVIEW_RISE) + (viewport.fov * Math.PI) / 360)
  const nearFit = (T * reach + height) / (T - OVERVIEW_RISE) + 2
  const vertical = Math.max(reach * 1.5 + 10, nearFit)
  // A câmera fica em x = 0: a extensão do anel em X vira a extensão horizontal da tela.
  const halfTan = Math.tan((viewport.fov * Math.PI) / 360) * viewport.aspect
  const fitH = (reach * 1.1) / halfTan
  const d = Math.max(vertical, fitH)
  return { position: [0, d * OVERVIEW_RISE, d], target: [0, 0, 0] }
}

export function maxCameraDistance(system: OrbitSystem, viewport: Viewport = DEFAULT_VIEWPORT): number {
  const [x, y, z] = overviewPose(system, viewport).position
  return Math.hypot(x, y, z) * 1.4
}

/** Celular em pé (9:19,5): o caso mais exigente para a distância da câmera. */
export const PORTRAIT_VIEWPORT: Viewport = { aspect: 9 / 19.5, fov: 50 }
export const STARFIELD_MIN_RADIUS = 260
/** Espessura da casca de estrelas. */
export const STARFIELD_DEPTH = 80
/** Plano far da câmera: passa da borda externa da casca no pior caso (40 planetas máximos com 6 luas, celular em pé). */
export const CAMERA_FAR = 6000

/**
 * Raio interno da casca de estrelas. A casca acompanha a câmera (o StarField se prende ao observador), então
 * precisa envolver o sistema inteiro visto do zoom máximo para fora: max(260, 1,6 × maxCameraDistance) no pior
 * entre desktop e celular em pé. Não depende do viewport atual, para não reconstruir a cada resize.
 */
export function starfieldRadius(system: OrbitSystem): number {
  const far = Math.max(maxCameraDistance(system, DEFAULT_VIEWPORT), maxCameraDistance(system, PORTRAIT_VIEWPORT))
  return Math.max(STARFIELD_MIN_RADIUS, 1.6 * far)
}

/** Pose do perfil, em volta do sol; `center` é onde o sol está (ele bamboleia em torno do baricentro). */
export function sunPose(layout: PanelLayout, center: Vec3 = [0, 0, 0]): Pose {
  const [cx, cy, cz] = center
  const target: Vec3 = layout === 'side' ? [2.5, 0, 0] : [0, -2, 0]
  return { position: [cx, 3 + cy, 13 + cz], target: [target[0] + cx, target[1] + cy, target[2] + cz] }
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
  if (sel.kind === 'profile') return sunPose(layout, barycenterOffset(system, time))
  const name = selectedPlanet(sel)
  return (name && planetFocusPose(system, name, time, layout)) || overviewPose(system, viewport)
}

export function showcasePlanet(repos: Pick<RepoBase, 'name' | 'languages'>[]): string | null {
  return (repos.find((r) => r.languages.length >= 2) ?? repos[0])?.name ?? null
}

export function tutorialPose(
  step: TutorialStep,
  system: OrbitSystem,
  repos: Pick<RepoBase, 'name' | 'languages'>[],
  time: number,
  layout: PanelLayout,
  viewport: Viewport = DEFAULT_VIEWPORT,
): Pose {
  if (step === 'welcome') return sunPose(layout, barycenterOffset(system, time))
  if (step === 'tech') {
    const name = showcasePlanet(repos)
    return (name && planetFocusPose(system, name, time, layout)) || overviewPose(system, viewport)
  }
  return overviewPose(system, viewport)
}
