import type { RepoBase } from '../types'
import { positionFromE, solveKepler, SUN_RADIUS, type OrbitSystem, type Vec3 } from './orbits'
import { seededRandom } from './random'

/** Atividade recente: push ou commit nos últimos RECENT_DAYS dias vira cometa (até MAX_COMETS). */
export const RECENT_DAYS = 7
export const MAX_COMETS = 3
export const COMET_MIN_E = 0.85
export const COMET_MAX_E = 0.92
const DEG = Math.PI / 180
const COMET_MIN_INCLINATION = 20 * DEG
const COMET_MAX_INCLINATION = 50 * DEG
/** Núcleo gelado, pequeno. */
export const COMET_NUCLEUS = 0.35
/**
 * Periélio logo fora do raio seguro do sol (SUN_RADIUS + 2, o da nave): mesmo com o sol bamboleando (MAX_WOBBLE),
 * o núcleo nunca chega a SUN_RADIUS + 1 dele.
 */
export const COMET_PERIHELION = SUN_RADIUS + 2.5
/** Comprimento da cauda no periélio (unidades); cai com 1/r². */
export const TAIL_MAX = 9
/** Quanto a cauda de poeira se curva para trás da velocidade (fração da direção oposta ao sol). */
const DUST_LAG = 0.35
const DAY_MS = 86_400_000

type ActivityRepo = Pick<RepoBase, 'name' | 'pushedAt' | 'lastCommit'>

export interface RecentActivity {
  /** Índice do repo na lista (= índice do planeta em `system.orbits`). */
  index: number
  /** Data mais recente entre o push e o último commit (ms). */
  time: number
  /** Dias inteiros desde então (0 = hoje). */
  daysAgo: number
}

const parse = (iso: string | undefined) => {
  const t = iso ? new Date(iso).getTime() : NaN
  return Number.isFinite(t) ? t : -Infinity
}

/** Repos com push ou commit nos últimos RECENT_DAYS dias, do mais recente para o mais antigo, até `max`. */
export function recentActivity(repos: ActivityRepo[], now: Date, max = MAX_COMETS): RecentActivity[] {
  const nowMs = now.getTime()
  return repos
    .map((r, index) => ({ index, time: Math.min(nowMs, Math.max(parse(r.pushedAt), parse(r.lastCommit?.date))) }))
    .filter((r) => r.time > -Infinity && nowMs - r.time <= RECENT_DAYS * DAY_MS)
    .sort((a, b) => b.time - a.time || a.index - b.index)
    .slice(0, max)
    .map((r) => ({ ...r, daysAgo: Math.floor((nowMs - r.time) / DAY_MS) }))
}

/** "hoje", "há 1 dia", "há N dias". */
export function daysAgoLabel(days: number): string {
  if (days <= 0) return 'hoje'
  return days === 1 ? 'há 1 dia' : `há ${days} dias`
}

export interface Comet {
  /** Repo (e planeta) do cometa. */
  name: string
  index: number
  daysAgo: number
  a: number
  e: number
  inclination: number
  node: number
  periapsis: number
  /** s de simulação por volta (3ª lei, na escala dos anéis) */
  period: number
  /** anomalia média em t = 0 */
  phase: number
  /** raio do núcleo */
  nucleus: number
}

/**
 * Um cometa por repo com atividade recente: e entre 0,85 e 0,92, inclinação de 20–50° (passa por cima ou por baixo
 * dos anéis), periélio logo fora do sol e afélio além do anel externo. Se o sistema for grande demais para isso com
 * e ≤ 0,92, o periélio se afasta (o afélio sempre passa do anel externo). Não entra no espaçamento dos anéis.
 */
export function buildComets(system: OrbitSystem, repos: ActivityRepo[], now: Date): Comet[] {
  const inner = system.rings[0]
  const outer = system.rings[system.rings.length - 1]
  if (!inner || !outer) return []
  const reach = outer.a * (1 + outer.e) + outer.maxRadius
  return recentActivity(repos, now).map(({ index, daysAgo }, k) => {
    const rng = seededRandom(`comet-${repos[index].name}`)
    const aphelion = reach * (1.1 + 0.2 * rng())
    const e = Math.min(COMET_MAX_E, Math.max(COMET_MIN_E, (aphelion - COMET_PERIHELION) / (aphelion + COMET_PERIHELION)))
    const q = Math.max(COMET_PERIHELION, (aphelion * (1 - e)) / (1 + e))
    const a = q / (1 - e)
    const period = inner.period * Math.pow(a / inner.a, 1.5)
    // o primeiro chega ao periélio em ~10 s de simulação; os outros vêm espaçados ao longo da volta
    const toPerihelion = 10 + k * 0.3 * period
    return {
      name: repos[index].name,
      index,
      daysAgo,
      a,
      e,
      inclination: (rng() < 0.5 ? -1 : 1) * (COMET_MIN_INCLINATION + rng() * (COMET_MAX_INCLINATION - COMET_MIN_INCLINATION)),
      node: rng() * Math.PI * 2,
      periapsis: rng() * Math.PI * 2,
      period,
      phase: (-2 * Math.PI * toPerihelion) / period,
      nucleus: COMET_NUCLEUS,
    }
  })
}

/** Posição no instante t (2ª lei de graça: o solver de Kepler acelera o cometa no periélio). Escreve em `out`. */
export function cometPosition(c: Comet, t: number, out: Vec3): Vec3 {
  return positionFromE(c, solveKepler(c.phase + (2 * Math.PI * t) / c.period, c.e), out)
}

/** Velocidade analítica (unidades por s de simulação): derivada da posição com dE/dt = n / (1 − e·cos E). */
export function cometVelocity(c: Comet, t: number, out: Vec3): Vec3 {
  const n = (2 * Math.PI) / c.period
  const E = solveKepler(c.phase + n * t, c.e)
  const dE = n / (1 - c.e * Math.cos(E))
  // derivada no plano da órbita, levada ao espaço pela mesma rotação (sem o deslocamento do foco, que é constante)
  const vx = -c.a * Math.sin(E) * dE
  const vy = c.a * Math.sqrt(1 - c.e * c.e) * Math.cos(E) * dE
  const cO = Math.cos(c.node), sO = Math.sin(c.node)
  const ci = Math.cos(c.inclination), si = Math.sin(c.inclination)
  const cw = Math.cos(c.periapsis), sw = Math.sin(c.periapsis)
  const X = (cO * cw - sO * sw * ci) * vx + (-cO * sw - sO * cw * ci) * vy
  const Y = (sO * cw + cO * sw * ci) * vx + (-sO * sw + cO * cw * ci) * vy
  const Z = sw * si * vx + cw * si * vy
  out[0] = X
  out[1] = Z
  out[2] = -Y
  return out
}

/** Comprimento da cauda a uma distância r do sol: TAIL_MAX no periélio, ∝ 1/r² (pressão de radiação). */
export function tailLength(c: Comet, r: number): number {
  const q = c.a * (1 - c.e)
  return TAIL_MAX * (q / Math.max(r, q)) ** 2
}

/**
 * Direções unitárias das caudas: a de íons aponta direto para longe do sol; a de poeira também, mas curvada para
 * trás da velocidade. Escreve em `ion` e `dust`.
 */
export function tailDirections(pos: Vec3, sun: Vec3, velocity: Vec3, ion: Vec3, dust: Vec3): void {
  let x = pos[0] - sun[0]
  let y = pos[1] - sun[1]
  let z = pos[2] - sun[2]
  let l = Math.hypot(x, y, z) || 1
  ion[0] = x / l
  ion[1] = y / l
  ion[2] = z / l
  const vl = Math.hypot(velocity[0], velocity[1], velocity[2]) || 1
  x = ion[0] - (DUST_LAG * velocity[0]) / vl
  y = ion[1] - (DUST_LAG * velocity[1]) / vl
  z = ion[2] - (DUST_LAG * velocity[2]) / vl
  l = Math.hypot(x, y, z) || 1
  dust[0] = x / l
  dust[1] = y / l
  dust[2] = z / l
}
