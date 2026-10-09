import type { SunMode } from './sunMachine'

/**
 * Olhar do sol com personalidade: de tempos em tempos ele escolhe sozinho para onde olhar — a câmera (de frente para
 * quem vê), o mouse, a nave ou um planeta para admirar —, com pequenas sacadas enquanto olha. Interrupções passam na
 * frente da escolha aleatória, nesta ordem: clique (câmera) > hover (mouse) > nave viajando (a viagem inteira, com
 * olhadelas curtas para outro lado) > foco da apresentação/tutorial (planeta) > planeta recém-selecionado (uma olhada).
 * O diretor só dá o alvo; a mola do rosto (`faceSpring`) continua suavizando a virada.
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
  /** Com a nave viajando: tempo que falta da olhadela para outro lado (> 0 durante ela). */
  glanceLeft: number
  /** Com a nave viajando: tempo até a próxima olhadela; −1 fora de viagem. */
  glanceIn: number
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
/** Viagem da nave: olhadelas de 0,3–0,6 s para outro lado a cada 2,5–5 s, e de volta para a nave. */
export const TRAVEL_GLANCE = { min: 0.3, max: 0.6, everyMin: 2.5, everyMax: 5 } as const
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
  glanceLeft: 0,
  glanceIn: -1,
}

const SHIP: Gaze = { kind: 'ship', planet: null }
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
  const kind = weighted(kinds, (k) => GAZE_WEIGHT[k], rng) ?? 'camera'
  if (kind !== 'planet') return { kind, planet: null }
  const planet = weighted(input.planets, (p) => p.weight, rng)
  return planet ? { kind, planet: planet.name } : CAMERA
}

/** Interrupções acima da viagem da nave: clique (câmera) > hover (mouse). */
function urgent(input: GazeInput): Gaze | null {
  if (input.mode === 'click') return CAMERA
  if (input.mode === 'hover' && input.pointer) return MOUSE
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

  const now = urgent(input)
  if (now) return { ...s, ...micro, gaze: now, left: 0, forced: true, glanced, glanceLeft: 0, glanceIn: -1 }

  // Nave viajando: olha para ela a viagem inteira (sem a regra de não repetir), com olhadelas curtas para outro lado.
  if (input.shipTraveling) {
    const travel = { ...s, ...micro, left: 0, forced: true, glanced }
    const glanceLeft = s.glanceLeft - dt
    if (s.glanceIn >= 0 && glanceLeft > 0) return { ...travel, glanceLeft }
    const glanceIn = s.glanceIn < 0 ? lerp(TRAVEL_GLANCE.everyMin, TRAVEL_GLANCE.everyMax, rng()) : s.glanceIn - dt
    if (glanceIn <= 0) {
      return {
        ...travel,
        gaze: pickGaze('ship', input, rng),
        glanceLeft: lerp(TRAVEL_GLANCE.min, TRAVEL_GLANCE.max, rng()),
        glanceIn: lerp(TRAVEL_GLANCE.everyMin, TRAVEL_GLANCE.everyMax, rng()),
      }
    }
    return { ...travel, gaze: SHIP, glanceLeft: 0, glanceIn }
  }
  const idle = { glanceLeft: 0, glanceIn: -1 }

  if (input.focusPlanet) return { ...s, ...micro, ...idle, gaze: { kind: 'planet', planet: input.focusPlanet }, left: 0, forced: true, glanced }

  // Planeta recém-selecionado: uma olhada (o tempo de admirar) antes de seguir a vida.
  if (input.selectedPlanet && input.selectedPlanet !== glanced) {
    return { ...s, ...micro, ...idle, gaze: { kind: 'planet', planet: input.selectedPlanet }, left: dwellFor('planet', rng), forced: false, glanced: input.selectedPlanet }
  }

  const left = s.left - dt
  if (s.forced || left <= 0) {
    const gaze = pickGaze(s.gaze.kind, input, rng)
    return { ...s, ...micro, ...idle, gaze, left: dwellFor(gaze.kind, rng), forced: false, glanced }
  }
  return { ...s, ...micro, ...idle, left, glanced }
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
