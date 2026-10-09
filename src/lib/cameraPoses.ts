import { selectedPlanet, type UniverseSelection } from './interaction'
import type { TutorialStep } from './tutorial'
import type { RepoBase } from './types'
import { SIDE_SHEET_MAX_HEIGHT } from './uiLayout'
import { barycenterOffset } from './universe/barycenter'
import { orbitPath, planetPosition, SUN_RADIUS, type OrbitSystem, type Vec3 } from './universe/orbits'

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

/** Elevação da câmera da visão geral: posição = alvo + (0, OVERVIEW_RISE·d, d). */
const OVERVIEW_RISE = 0.6
/**
 * O alvo fica OVERVIEW_LEAD·alcance à frente do sol, do lado da câmera: com a câmera elevada, é a metade de perto
 * que transborda a tela; mirando nela, a metade de longe deixa de sobrar e a câmera chega mais perto.
 */
const OVERVIEW_LEAD = 0.3
/** Encaixe exato: fases da precessão e pontos por elipse amostrados, e a margem até a borda (1 = encostado). */
const FIT_PHASES = 8
const FIT_POINTS = 48
const FIT_EDGE = 0.95

/** Pontos das órbitas em FIT_PHASES fases da precessão, cada um com o alcance do anel (planeta + luas). */
const fitSamples = new WeakMap<OrbitSystem, { p: Vec3; r: number }[]>()
function samplesOf(system: OrbitSystem): { p: Vec3; r: number }[] {
  let samples = fitSamples.get(system)
  if (!samples) {
    samples = []
    for (const ring of system.rings) {
      const turn = ring.apsidalRate > 0 ? (2 * Math.PI) / ring.apsidalRate : 0
      for (let k = 0; k < (turn ? FIT_PHASES : 1); k++) {
        for (const p of orbitPath(ring, (k / FIT_PHASES) * turn, FIT_POINTS)) samples.push({ p, r: ring.maxRadius })
      }
    }
    fitSamples.set(system, samples)
  }
  return samples
}

/**
 * Maior coordenada normalizada de tela (|x| ou |y|; 1 = borda) entre as amostras, cada uma inflada pelo alcance:
 * a esfera de raio r em volta do ponto, no pior caso, desloca o centro de r para fora. Infinity se algo fica atrás.
 */
function screenExtent(samples: { p: Vec3; r: number }[], eye: Vec3, target: Vec3, viewport: Viewport): number {
  const fx = target[0] - eye[0]
  const fy = target[1] - eye[1]
  const fz = target[2] - eye[2]
  const fl = Math.hypot(fx, fy, fz)
  const f: Vec3 = [fx / fl, fy / fl, fz / fl]
  const rl = Math.hypot(f[2], f[0])
  const right: Vec3 = [-f[2] / rl, 0, f[0] / rl]
  const up: Vec3 = [right[1] * f[2] - right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1] - right[1] * f[0]]
  const tanY = Math.tan((viewport.fov * Math.PI) / 360)
  const tanX = tanY * viewport.aspect
  let worst = 0
  for (const { p, r } of samples) {
    const vx = p[0] - eye[0]
    const vy = p[1] - eye[1]
    const vz = p[2] - eye[2]
    const depth = vx * f[0] + vy * f[1] + vz * f[2] - r
    if (depth <= 0) return Infinity
    const sx = (Math.abs(vx * right[0] + vy * right[1] + vz * right[2]) + r) / (depth * tanX)
    const sy = (Math.abs(vx * up[0] + vy * up[1] + vz * up[2]) + r) / (depth * tanY)
    worst = Math.max(worst, sx, sy)
  }
  return worst
}

const overviewAt = (d: number, lead: number): Pose => ({ position: [0, d * OVERVIEW_RISE, lead + d], target: [0, 0, lead] })

/** Uma pose por sistema e viewport: a busca roda a cada frame da mola da câmera. */
const overviewCache = new WeakMap<OrbitSystem, Map<string, Pose>>()

/**
 * Visão geral: a menor distância em que todas as órbitas (com o alcance dos corpos e a inclinação) cabem na tela
 * com folga FIT_EDGE, em qualquer fase da precessão do periélio. Encaixe exato por bissecção nas amostras.
 */
export function overviewPose(system: OrbitSystem, viewport: Viewport = DEFAULT_VIEWPORT): Pose {
  // canvas de tamanho zero (aspecto NaN, ∞ ou 0) nunca "cabe": usa o enquadramento padrão
  if (!(Number.isFinite(viewport.aspect) && viewport.aspect > 0 && Number.isFinite(viewport.fov) && viewport.fov > 0)) {
    viewport = DEFAULT_VIEWPORT
  }
  const outer = system.rings[system.rings.length - 1]
  if (!outer) return overviewAt(12 * 1.5 + 10, 0)
  const key = `${viewport.aspect}|${viewport.fov}`
  let cache = overviewCache.get(system)
  const hit = cache?.get(key)
  if (hit) return hit
  const reach = outer.a * (1 + outer.e) + outer.maxRadius
  const lead = OVERVIEW_LEAD * reach
  const samples = samplesOf(system)
  const fits = (d: number) => {
    const pose = overviewAt(d, lead)
    return screenExtent(samples, pose.position, pose.target, viewport) <= FIT_EDGE
  }
  let lo = 0
  let hi = reach * 1.5 + 10
  // 20 × 1,5 ≈ 3300× o chute inicial: limite só contra laço infinito
  for (let i = 0; i < 20 && !fits(hi); i++) {
    lo = hi
    hi *= 1.5
  }
  for (let i = 0; i < 40 && hi - lo > 1e-3; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) hi = mid
    else lo = mid
  }
  const pose = overviewAt(hi, lead)
  if (!cache) overviewCache.set(system, (cache = new Map()))
  cache.set(key, pose)
  return pose
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

/** Câmera do perfil: um pouco acima do plano das órbitas (sobe 3 a cada 13 de recuo). */
const SUN_ELEVATION = Math.atan2(3, 13)
/** Celular: o sol ocupa essa fração (em diâmetro) da faixa de tela acima da folha do perfil. */
const SUN_SHEET_FILL = 0.7

/**
 * Pose do perfil, em volta do sol; `center` é onde o sol está (ele bamboleia em torno do baricentro).
 * Lateral: o sol à esquerda da coluna do painel. Folha (celular): a câmera recua até o sol inteiro caber na faixa
 * acima da folha (SIDE_SHEET_MAX_HEIGHT) e mira abaixo dele, para o centro do sol cair no meio dessa faixa.
 */
export function sunPose(layout: PanelLayout, center: Vec3 = [0, 0, 0], viewport: Viewport = DEFAULT_VIEWPORT): Pose {
  const [cx, cy, cz] = center
  if (layout === 'side') return { position: [cx, 3 + cy, 13 + cz], target: [2.5 + cx, cy, cz] }
  const tanY = Math.tan((viewport.fov * Math.PI) / 360)
  const free = 1 - SIDE_SHEET_MAX_HEIGHT
  // diâmetro na tela (fração da altura) = raio / (distância · tan(fov/2))
  const dist = SUN_RADIUS / (free * SUN_SHEET_FILL * tanY)
  // o centro do sol no meio da faixa livre: y normalizado = 1 − free (topo = 1)
  const pitch = SUN_ELEVATION + Math.atan((1 - free) * tanY)
  const position: Vec3 = [cx, cy + dist * Math.sin(SUN_ELEVATION), cz + dist * Math.cos(SUN_ELEVATION)]
  return { position, target: [cx, position[1] - dist * Math.sin(pitch), position[2] - dist * Math.cos(pitch)] }
}

/** Folga do planeta em foco até a borda da tela, em raios (o halo da atmosfera passa um pouco do raio). */
const PLANET_FIT_MARGIN = 1.2

/**
 * Pose de foco num planeta. A distância padrão é proporcional ao raio; numa tela estreita (iPad em pé, celular) a
 * câmera recua até o planeta caber na largura (no layout lateral, na coluna à esquerda do painel).
 */
export function planetPose(position: Vec3, radius: number, layout: PanelLayout, viewport: Viewport = DEFAULT_VIEWPORT): Pose {
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
  const shift = radius * 1.3
  // Meia largura que o planeta precisa a partir do centro da tela (de lado, o alvo o empurra `shift` para a esquerda).
  const halfWidth = (layout === 'side' ? shift : 0) + radius * PLANET_FIT_MARGIN
  const tanX = Math.tan((viewport.fov * Math.PI) / 360) * viewport.aspect
  const dist = Math.max(radius * 4 + 3, halfWidth / (FIT_EDGE * tanX))
  return {
    position: [x + dx * dist, y + radius * 1.2, z + dz * dist],
    // Direita da câmera = (dz, 0, −dx). Alvo à direita → planeta aparece à esquerda do painel.
    target: layout === 'side' ? [x + dz * shift, y, z - dx * shift] : [x, y - shift, z],
  }
}

export function planetFocusPose(
  system: OrbitSystem,
  name: string,
  time: number,
  layout: PanelLayout,
  viewport: Viewport = DEFAULT_VIEWPORT,
): Pose | null {
  const orbit = system.orbits.find((o) => o.name === name)
  if (!orbit) return null
  return planetPose(planetPosition(system.rings[orbit.ring], orbit, time), orbit.radius, layout, viewport)
}

export function selectionPose(
  sel: UniverseSelection,
  system: OrbitSystem,
  time: number,
  layout: PanelLayout,
  viewport: Viewport = DEFAULT_VIEWPORT,
): Pose {
  if (sel.kind === 'profile') return sunPose(layout, barycenterOffset(system, time), viewport)
  const name = selectedPlanet(sel)
  return (name && planetFocusPose(system, name, time, layout, viewport)) || overviewPose(system, viewport)
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
  if (step === 'welcome') return sunPose(layout, barycenterOffset(system, time), viewport)
  if (step === 'tech') {
    const name = showcasePlanet(repos)
    return (name && planetFocusPose(system, name, time, layout, viewport)) || overviewPose(system, viewport)
  }
  return overviewPose(system, viewport)
}
