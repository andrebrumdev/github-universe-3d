import type { SunMode } from './sunMachine'

/**
 * Olhar do sol com personalidade: de tempos em tempos ele escolhe sozinho para onde olhar — a câmera (de frente para
 * quem vê), o mouse, a nave ou um planeta para admirar —, com pequenas sacadas enquanto olha. Interrupções passam na
 * frente da escolha aleatória. O diretor só dá o alvo; a mola do rosto (`faceSpring`) continua suavizando a virada.
 */
export type GazeKind = 'camera' | 'mouse' | 'ship' | 'planet'

export interface Gaze {
  kind: GazeKind
  /** Nome do planeta quando `kind` é 'planet'. */
  planet: string | null
}

export interface GazeState {
  gaze: Gaze
  /** Tempo que ainda falta olhando para o alvo escolhido (s). */
  left: number
  /** O alvo atual veio de uma interrupção contínua (clique, hover, foco): ao acabar, escolhe outro na hora. */
  forced: boolean
  /** Micro-desvio do olhar (rad), trocado a cada `saccadeLeft` s. */
  saccadeYaw: number
  saccadePitch: number
  saccadeLeft: number
  /** Planeta selecionado que já ganhou a olhada (só uma por seleção). */
  glanced: string | null
}

export interface GazeInput {
  mode: SunMode
  /** Há um ponteiro de verdade sobre o canvas (não toque). */
  pointer: boolean
  shipTraveling: boolean
  /** Planeta em foco na apresentação ou no tutorial. */
  focusPlanet: string | null
  selectedPlanet: string | null
  planets: readonly { name: string; weight: number }[]
  reduced: boolean
}

export const DWELL: readonly [number, number] = [2, 6]
export const ADMIRE_DWELL: readonly [number, number] = [4, 8]
/** Peso de cada tipo de alvo na escolha aleatória. */
export const GAZE_WEIGHT: Record<GazeKind, number> = { camera: 3, mouse: 2, ship: 1.5, planet: 2 }
/** Com a nave viajando, ela fica bem mais interessante. */
export const TRAVEL_SHIP_BOOST = 5
/** Sacadas: desvio máximo (rad) e intervalo entre elas (s). */
export const SACCADE = { yaw: 0.05, pitch: 0.035, min: 0.25, max: 0.9 } as const

export const GAZE_AT_START: GazeState = {
  gaze: { kind: 'camera', planet: null },
  left: 2.5,
  forced: false,
  saccadeYaw: 0,
  saccadePitch: 0,
  saccadeLeft: 0.5,
  glanced: null,
}

const CAMERA: Gaze = { kind: 'camera', planet: null }
const MOUSE: Gaze = { kind: 'mouse', planet: null }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function dwellFor(kind: GazeKind, rng: () => number): number {
  const [lo, hi] = kind === 'planet' ? ADMIRE_DWELL : DWELL
  return lerp(lo, hi, rng())
}

function weighted<T>(items: readonly T[], weight: (item: T) => number, rng: () => number): T | null {
  const total = items.reduce((sum, item) => sum + weight(item), 0)
  if (total <= 0) return null
  let r = rng() * total
  for (const item of items) {
    r -= weight(item)
    if (r < 0) return item
  }
  return items[items.length - 1]
}

/** Escolha aleatória ponderada, sem repetir o tipo anterior; mouse só com ponteiro, planeta só se houver planetas. */
export function pickGaze(prev: GazeKind | null, input: GazeInput, rng: () => number): Gaze {
  const kinds = (['camera', 'mouse', 'ship', 'planet'] as const).filter(
    (k) => k !== prev && (k !== 'mouse' || input.pointer) && (k !== 'planet' || input.planets.length > 0),
  )
  const kind = weighted(kinds, (k) => GAZE_WEIGHT[k] * (k === 'ship' && input.shipTraveling ? TRAVEL_SHIP_BOOST : 1), rng) ?? 'camera'
  if (kind !== 'planet') return { kind, planet: null }
  const planet = weighted(input.planets, (p) => p.weight, rng)
  return planet ? { kind, planet: planet.name } : CAMERA
}

/** Interrupção contínua, na ordem de prioridade: clique (câmera) > hover (mouse) > foco (planeta). */
function interruption(input: GazeInput): Gaze | null {
  if (input.mode === 'click') return CAMERA
  if (input.mode === 'hover' && input.pointer) return MOUSE
  if (input.focusPlanet) return { kind: 'planet', planet: input.focusPlanet }
  return null
}

export function stepGaze(s: GazeState, input: GazeInput, dt: number, rng: () => number): GazeState {
  const glanced = input.selectedPlanet === null ? null : s.glanced
  if (input.reduced) {
    const gaze = input.mode === 'hover' && input.pointer ? MOUSE : CAMERA
    return { ...s, gaze, left: 0, forced: true, saccadeYaw: 0, saccadePitch: 0, saccadeLeft: 0, glanced }
  }

  let { saccadeYaw, saccadePitch, saccadeLeft } = s
  saccadeLeft -= dt
  if (saccadeLeft <= 0) {
    saccadeYaw = (rng() * 2 - 1) * SACCADE.yaw
    saccadePitch = (rng() * 2 - 1) * SACCADE.pitch
    saccadeLeft = lerp(SACCADE.min, SACCADE.max, rng())
  }
  const micro = { saccadeYaw, saccadePitch, saccadeLeft }

  const forced = interruption(input)
  if (forced) return { ...s, ...micro, gaze: forced, left: 0, forced: true, glanced }

  // Planeta recém-selecionado: uma olhada (o tempo de admirar) antes de seguir a vida.
  if (input.selectedPlanet && input.selectedPlanet !== glanced) {
    return { ...s, ...micro, gaze: { kind: 'planet', planet: input.selectedPlanet }, left: dwellFor('planet', rng), forced: false, glanced: input.selectedPlanet }
  }

  const left = s.left - dt
  if (s.forced || left <= 0) {
    const gaze = pickGaze(s.gaze.kind, input, rng)
    return { ...s, ...micro, gaze, left: dwellFor(gaze.kind, rng), forced: false, glanced }
  }
  return { ...s, ...micro, left, glanced }
}

/** Admirando: olhando um planeta sem outra emoção na frente (só no idle). */
export function isAdmiring(s: GazeState, mode: SunMode): boolean {
  return s.gaze.kind === 'planet' && mode === 'idle'
}

const DAY = 86_400_000
/** Meia-vida (em dias, como constante de tempo) do interesse por atividade recente. */
const RECENT_DAYS = 5

/** Peso do planeta para admirar: o tamanho, até ×3 se teve push agora, voltando a ×1 em algumas semanas. */
export function planetGazeWeight(radius: number, pushedAt: string | null, now: number): number {
  const t = pushedAt ? Date.parse(pushedAt) : NaN
  if (!Number.isFinite(t)) return radius
  const ageDays = Math.max(0, (now - t) / DAY)
  return radius * (1 + 2 * Math.exp(-ageDays / RECENT_DAYS))
}

/** Pupila em degraus: `steps` degraus no alcance [−reach, reach] (o olhar "salta" como no desenho, sem tremer). */
export function quantizePupil(v: number, reach: number, steps = 8): number {
  const step = (2 * reach) / steps
  const q = Math.min(reach, Math.max(-reach, Math.round(v / step) * step))
  return q === 0 ? 0 : q
}

/** O rosto vira no máximo isto para longe de quem vê: admirando um planeta atrás do sol, fica de três-quartos. */
export const MAX_TURN_AWAY = (50 * Math.PI) / 180

/** Yaw do alvo limitado a ±`max` em volta do yaw da câmera (sem normalizar: a mola do rosto já trata a volta). */
export function limitTurnAway(yaw: number, cameraYaw: number, max = MAX_TURN_AWAY): number {
  const d = Math.atan2(Math.sin(yaw - cameraYaw), Math.cos(yaw - cameraYaw))
  return cameraYaw + Math.min(max, Math.max(-max, d))
}
