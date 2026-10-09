import { MAX_PITCH } from './faceSpring'
import type { SunExpression, SunMode } from './sunMachine'

/**
 * Olhar do sol com personalidade. Na maior parte do tempo ele está "viajando" (sonhando acordado, `dream`): olhos em
 * traço, a cabeça vagando devagar. De vez em quando abre os olhos para uma olhada curta — a câmera (quem vê), o mouse,
 * a nave ou um planeta para admirar — e volta a viajar. Interrupções passam na frente, nesta ordem: clique (câmera) >
 * hover (mouse) > nave viajando (a viagem inteira, com olhadelas curtas para outro lado) > foco da apresentação/tutorial
 * (planeta) > planeta recém-selecionado (uma olhada). Quando a interrupção acaba, ele fica acordado olhando para quem vê
 * por 3–6 s e volta a viajar. O diretor só dá o alvo e a expressão; a mola do rosto (`faceSpring`) suaviza a virada.
 */
export type GazeKind = 'dream' | 'camera' | 'mouse' | 'ship' | 'planet'

export interface Gaze {
  kind: GazeKind
  /** Nome do planeta quando `kind` é 'planet'. */
  planet: string | null
}

export interface GazeState {
  gaze: Gaze
  /** Tempo que ainda falta no olhar atual (s). */
  left: number
  /** O alvo atual veio de uma interrupção contínua: ao acabar, fica acordado olhando para quem vê (`AWAKE_DWELL`). */
  forced: boolean
  /** A interrupção atual é a viagem da nave (expressão séria, mesmo nas olhadelas). */
  traveling: boolean
  /** Micro-desvio do olhar de olhos abertos (rad), trocado a cada `saccadeLeft` s. */
  saccadeYaw: number
  saccadePitch: number
  saccadeLeft: number
  /** Cabeça vagando enquanto viaja (rad): anda devagar até o objetivo, trocado a cada `wanderLeft` s. */
  wanderYaw: number
  wanderPitch: number
  wanderGoalYaw: number
  wanderGoalPitch: number
  wanderLeft: number
  /** Tipo da última olhada curta (não repete em seguida). */
  lastBrief: GazeKind | null
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

/** Olhadas curtas de olhos abertos; admirar um planeta demora mais. */
export const DWELL: readonly [number, number] = [2, 6]
export const ADMIRE_DWELL: readonly [number, number] = [4, 8]
/** Viajando entre uma olhada e outra: ~8 s em média contra ~4,5 s de olhada, ~64% do tempo parado. */
export const DREAM_DWELL: readonly [number, number] = [5, 11]
/** Acordado depois de uma interrupção, olhando para quem vê, antes de voltar a viajar. */
export const AWAKE_DWELL: readonly [number, number] = [3, 6]
/** Peso de cada tipo de olhada curta. */
export const GAZE_WEIGHT: Record<Exclude<GazeKind, 'dream'>, number> = { camera: 3, mouse: 2, ship: 1.5, planet: 2 }
/** Viagem da nave: olhadelas de 0,3–0,6 s para outro lado a cada 2,5–5 s, e de volta para a nave. */
export const TRAVEL_GLANCE = { min: 0.3, max: 0.6, everyMin: 2.5, everyMax: 5 } as const
/** Sacadas: desvio máximo (rad) e intervalo entre elas (s). */
export const SACCADE = { yaw: 0.05, pitch: 0.035, min: 0.25, max: 0.9 } as const
/** Cabeça vagando enquanto viaja: amplitude (rad), troca de objetivo (s) e constante de tempo (s) — preguiçosa. */
export const WANDER = { yaw: 0.3, pitch: 0.15, min: 2.5, max: 5, tau: 1.6 } as const

export const GAZE_AT_START: GazeState = {
  gaze: { kind: 'dream', planet: null },
  left: 6,
  forced: false,
  traveling: false,
  saccadeYaw: 0,
  saccadePitch: 0,
  saccadeLeft: 0.5,
  wanderYaw: 0,
  wanderPitch: 0,
  wanderGoalYaw: 0,
  wanderGoalPitch: 0,
  wanderLeft: 1,
  lastBrief: null,
  glanced: null,
  glanceLeft: 0,
  glanceIn: -1,
}

const DREAM: Gaze = { kind: 'dream', planet: null }
const SHIP: Gaze = { kind: 'ship', planet: null }
const CAMERA: Gaze = { kind: 'camera', planet: null }
const MOUSE: Gaze = { kind: 'mouse', planet: null }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function dwellFor(kind: GazeKind, rng: () => number): number {
  const [lo, hi] = kind === 'planet' ? ADMIRE_DWELL : kind === 'dream' ? DREAM_DWELL : DWELL
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

/** Olhada curta: sorteio ponderado sem repetir o tipo anterior; mouse só com ponteiro, planeta só se houver planetas. */
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
    // sem sorteio, sem sacada, sem cabeça vagando: viajando de frente para quem vê (ou o mouse no hover)
    const gaze = input.mode === 'hover' && input.pointer ? MOUSE : DREAM
    return {
      ...s,
      gaze,
      left: 0,
      forced: false,
      traveling: false,
      saccadeYaw: 0,
      saccadePitch: 0,
      saccadeLeft: 0,
      wanderYaw: 0,
      wanderPitch: 0,
      wanderGoalYaw: 0,
      wanderGoalPitch: 0,
      glanced,
      glanceLeft: 0,
      glanceIn: -1,
    }
  }

  let { saccadeYaw, saccadePitch, saccadeLeft, wanderGoalYaw, wanderGoalPitch, wanderLeft } = s
  saccadeLeft -= dt
  if (saccadeLeft <= 0) {
    saccadeYaw = (rng() * 2 - 1) * SACCADE.yaw
    saccadePitch = (rng() * 2 - 1) * SACCADE.pitch
    saccadeLeft = lerp(SACCADE.min, SACCADE.max, rng())
  }
  wanderLeft -= dt
  if (wanderLeft <= 0) {
    wanderGoalYaw = (rng() * 2 - 1) * WANDER.yaw
    wanderGoalPitch = (rng() * 2 - 1) * WANDER.pitch
    wanderLeft = lerp(WANDER.min, WANDER.max, rng())
  }
  const k = 1 - Math.exp(-dt / WANDER.tau)
  const motion = {
    saccadeYaw,
    saccadePitch,
    saccadeLeft,
    wanderGoalYaw,
    wanderGoalPitch,
    wanderLeft,
    wanderYaw: s.wanderYaw + (wanderGoalYaw - s.wanderYaw) * k,
    wanderPitch: s.wanderPitch + (wanderGoalPitch - s.wanderPitch) * k,
  }
  const idle = { glanceLeft: 0, glanceIn: -1, traveling: false }

  const now = urgent(input)
  if (now) return { ...s, ...motion, ...idle, gaze: now, left: 0, forced: true, glanced }

  // Nave viajando: olha para ela a viagem inteira (sem a regra de não repetir), com olhadelas curtas para outro lado.
  if (input.shipTraveling) {
    const travel = { ...s, ...motion, left: 0, forced: true, traveling: true, glanced }
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

  if (input.focusPlanet) return { ...s, ...motion, ...idle, gaze: { kind: 'planet', planet: input.focusPlanet }, left: 0, forced: true, glanced }

  // Planeta recém-selecionado: uma olhada (o tempo de admirar) antes de voltar a viajar.
  if (input.selectedPlanet && input.selectedPlanet !== glanced) {
    return {
      ...s,
      ...motion,
      ...idle,
      gaze: { kind: 'planet', planet: input.selectedPlanet },
      left: dwellFor('planet', rng),
      forced: false,
      glanced: input.selectedPlanet,
    }
  }

  // A interrupção acabou: acordado, olhando para quem vê, e depois volta a viajar.
  if (s.forced) return { ...s, ...motion, ...idle, gaze: CAMERA, left: lerp(AWAKE_DWELL[0], AWAKE_DWELL[1], rng()), forced: false, glanced }

  const left = s.left - dt
  if (left > 0) return { ...s, ...motion, ...idle, left, glanced }
  if (s.gaze.kind !== 'dream') return { ...s, ...motion, ...idle, gaze: DREAM, left: dwellFor('dream', rng), glanced }
  const brief = pickGaze(s.lastBrief, input, rng)
  return { ...s, ...motion, ...idle, gaze: brief, left: dwellFor(brief.kind, rng), lastBrief: brief.kind, glanced }
}

/** Desvio da cabeça (yaw, pitch em rad): viajando, a cabeça vaga devagar; de olhos abertos, só as sacadas. */
export function headOffset(s: GazeState): [number, number] {
  return s.gaze.kind === 'dream' ? [s.wanderYaw, s.wanderPitch] : [s.saccadeYaw, s.saccadePitch]
}

/**
 * Expressão pelo modo e pelo olhar: clique → surpreso, hover → feliz, away → triste; no idle, viajando (o padrão),
 * sério acompanhando a viagem da nave, de olho (pálpebra pesada) na nave ou no mouse, admirando um planeta, feliz para
 * quem vê.
 */
export function gazeExpression(s: GazeState, mode: SunMode): SunExpression {
  if (mode === 'click') return 'surprised'
  if (mode === 'hover') return 'happy'
  if (mode === 'away') return 'sad'
  if (s.traveling) return 'serious'
  switch (s.gaze.kind) {
    case 'dream':
      return 'viajando'
    case 'planet':
      return 'admiring'
    case 'ship':
    case 'mouse':
      return 'watching'
    case 'camera':
      return 'happy'
  }
}

/** Saindo do "viajando" para olhos abertos: os traços abrem numa piscada rápida. */
export function wakesUp(prev: SunExpression, next: SunExpression): boolean {
  return prev === 'viajando' && next !== 'viajando'
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

/**
 * O rosto vira no máximo isto para os lados, a partir de quem vê: olhando longe, ele desliza pela esfera (como na foto
 * do Sphere de lado, ~45–50°), com os dois olhos legíveis e o de longe encurtado. 70° deixava meio rosto na borda.
 */
export const MAX_TURN_AWAY = (55 * Math.PI) / 180

type Turn = { yaw: number; pitch: number }
const toDir = (t: Turn): [number, number, number] => [Math.cos(t.pitch) * Math.sin(t.yaw), Math.sin(t.pitch), Math.cos(t.pitch) * Math.cos(t.yaw)]
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * Cabeça limitada: no máximo `MAX_TURN_AWAY` de ângulo de verdade (yaw e pitch juntos) até a direção de quem vê — além
 * disso, para no limite, no caminho mais curto até o alvo —, e pitch a ±`MAX_PITCH`. O yaw sai perto do de quem vê
 * (sem normalizar: a mola do rosto trata a volta do ±π).
 */
export function limitTurn(target: Turn, viewer: Turn): Turn {
  const v = toDir(viewer)
  const t = toDir(target)
  const theta = Math.acos(Math.min(1, Math.max(-1, v[0] * t[0] + v[1] * t[1] + v[2] * t[2])))
  let d = t
  if (theta > MAX_TURN_AWAY) {
    if (Math.PI - theta < 1e-4) {
      // alvo exatamente atrás: vira de lado (no horizontal da vista), exatamente no limite
      const len = Math.hypot(v[2], v[0]) || 1
      const side = [v[2] / len, 0, -v[0] / len]
      const [c, sn] = [Math.cos(MAX_TURN_AWAY), Math.sin(MAX_TURN_AWAY)]
      d = [c * v[0] + sn * side[0], c * v[1] + sn * side[1], c * v[2] + sn * side[2]]
    } else {
      const a = Math.sin(theta - MAX_TURN_AWAY) / Math.sin(theta)
      const b = Math.sin(MAX_TURN_AWAY) / Math.sin(theta)
      d = [a * v[0] + b * t[0], a * v[1] + b * t[1], a * v[2] + b * t[2]]
    }
  }
  let dy = wrap(Math.atan2(d[0], d[2]) - viewer.yaw)
  const raw = Math.asin(Math.min(1, Math.max(-1, d[1])))
  const pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, raw))
  if (pitch !== raw) {
    // o pitch travado mexe no ângulo: acha o yaw que deixa exatamente no limite (se passou), do mesmo lado
    const c = Math.cos(pitch) * Math.cos(viewer.pitch)
    const cosDy = (Math.cos(MAX_TURN_AWAY) - Math.sin(pitch) * Math.sin(viewer.pitch)) / Math.max(c, 1e-6)
    const limit = Math.acos(Math.min(1, Math.max(-1, cosDy)))
    if (Math.abs(dy) > limit) dy = Math.sign(dy) * limit
  }
  return { yaw: viewer.yaw + dy, pitch }
}
