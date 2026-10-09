import { SUN_RADIUS, type Vec3 } from '../universe/orbits'
import type { BurnWindows } from './burn'
import { length, normalize } from './vec'

export const SUN_SAFE_DISTANCE = SUN_RADIUS + 2
export const MIN_TRAVEL_SECONDS = 1.5
export const MAX_TRAVEL_SECONDS = 3
/** Folga além do raio seguro para onde é empurrada uma saída de dentro do sol. */
export const LAUNCH_MARGIN = 0.5

/** Estilingue gravitacional de uma viagem (no máximo um): a UI reage a ele (inclinação, fala do Octocat). */
export interface GravityAssist {
  /** 'sun' ou o nome do planeta. */
  body: string
  /** Centro do corpo durante o sobrevoo. */
  center: Vec3
  /** Menor distância ao centro do corpo (periápside). */
  periapsis: number
  /** Quanto a direção da nave gira no sobrevoo (rad). */
  deflection: number
  /** Instantes (s, desde a partida) da entrada na janela do sobrevoo, da passagem mais perto e da saída. */
  start: number
  peak: number
  end: number
}

/**
 * Caminho da viagem, parametrizado pelo tempo real (s) desde a partida. Construído em `transfer.ts`
 * (transferência de Hohmann, com estilingue opcional).
 */
export interface TravelPath {
  duration: number
  /** Posição no instante t, travada em [0, duration]. Com `out`, escreve nele. */
  point(t: number, out?: Vec3): Vec3
  /** Velocidade analítica (unidades/s) no instante t; zero fora de [0, duration]. Com `out`, escreve nele. */
  velocity(t: number, out?: Vec3): Vec3
  assist: GravityAssist | null
  /**
   * Janelas das queimas (s desde a partida): a de partida vai de 0 a `departure`, a de chegada de `arrival` ao fim;
   * entre elas o motor fica desligado (planagem na cônica, estilingue incluído). Ver `burnPhase` em transfer.ts.
   */
  burns: BurnWindows
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Duração da viagem (s) pelo comprimento do caminho: cresce com ele, entre MIN e MAX. */
export function travelDuration(distance: number): number {
  return clamp(MIN_TRAVEL_SECONDS + distance / 40, MIN_TRAVEL_SECONDS, MAX_TRAVEL_SECONDS)
}

export function travelPoint(path: TravelPath, elapsed: number, out?: Vec3): Vec3 {
  return path.point(clamp(elapsed, 0, path.duration), out)
}

/** Velocidade da nave no caminho (unidades/s), analítica. Zero antes e depois da viagem. */
export function travelVelocity(path: TravelPath, elapsed: number, out?: Vec3): Vec3 {
  return path.velocity(elapsed, out)
}

/**
 * Direção unitária do movimento. Nas pontas a nave está parada (queimas): vale a direção do limite,
 * olhando um instante para dentro do caminho.
 */
export function travelTangent(path: TravelPath, elapsed: number): Vec3 {
  const T = path.duration
  const t = clamp(elapsed, 0, T)
  const v = path.velocity(t)
  if (length(v) > 1e-6) return normalize(v)
  const inner = t < T / 2 ? t + 1e-3 * T : t - 1e-3 * T
  return normalize(path.velocity(inner), [0, 0, 1])
}

/** Menor distância do caminho até `sun` (amostrada). */
export function minSunDistance(path: TravelPath, sun: Vec3 = [0, 0, 0], samples = 240): number {
  let min = Infinity
  const p: Vec3 = [0, 0, 0]
  for (let i = 0; i <= samples; i++) {
    path.point((i / samples) * path.duration, p)
    min = Math.min(min, Math.hypot(p[0] - sun[0], p[1] - sun[1], p[2] - sun[2]))
  }
  return min
}
