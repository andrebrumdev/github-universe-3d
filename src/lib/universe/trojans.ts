import { periapsisAt, positionFromE, solveKepler, TROJAN_LEAD, type OrbitSystem, type Vec3 } from './orbits'
import { seededRandom } from './random'

/** Um asteroide por fork, até MAX_TROJANS por planeta, metade em L4 e metade em L5. */
export const MAX_TROJANS = 16

const DEG = Math.PI / 180
const MIN_LIBRATION = 5 * DEG
const MAX_LIBRATION = 10 * DEG
/** Espalhamento na nuvem: ao longo da órbita (anomalia média), radial e fora do plano. */
const SCATTER_ALONG = 2 * DEG
const SCATTER_RADIAL = 0.35
const SCATTER_NORMAL = 0.25
const MIN_ROCK = 0.08
const MAX_ROCK = 0.18
/** Libração lenta: uma oscilação a cada 4–7 voltas do anel. */
const MIN_LIBRATION_PERIODS = 4
const MAX_LIBRATION_PERIODS = 7

export interface Trojan {
  /** Índice do planeta em `system.orbits`. */
  planet: number
  /** +1 = L4 (à frente), −1 = L5 (atrás). */
  side: 1 | -1
  /** Amplitude da libração (girino) em anomalia média, rad. */
  amplitude: number
  /** Período da libração, s de simulação. */
  libration: number
  /** Fase da libração em t = 0. */
  librationPhase: number
  /** Deslocamento fixo na nuvem: ao longo da órbita (rad), radial e na normal do plano (unidades). */
  along: number
  radial: number
  normal: number
  /** Raio da rocha. */
  size: number
}

/** Os troianos do planeta `planet` (índice em `system.orbits`), um por fork até MAX_TROJANS. */
export function trojanSwarm(system: OrbitSystem, planet: number, forks: number): Trojan[] {
  const orbit = system.orbits[planet]
  const count = Math.min(MAX_TROJANS, Math.max(0, Math.floor(forks)))
  if (!orbit || count === 0) return []
  const period = system.rings[orbit.ring].period
  const rng = seededRandom(`trojans-${orbit.name}`)
  const spread = (r: number) => (2 * rng() - 1) * r
  return Array.from({ length: count }, (_, i) => ({
    planet,
    side: i % 2 === 0 ? 1 : -1,
    amplitude: MIN_LIBRATION + rng() * (MAX_LIBRATION - MIN_LIBRATION),
    libration: period * (MIN_LIBRATION_PERIODS + rng() * (MAX_LIBRATION_PERIODS - MIN_LIBRATION_PERIODS)),
    librationPhase: rng() * Math.PI * 2,
    along: spread(SCATTER_ALONG),
    radial: spread(SCATTER_RADIAL),
    normal: spread(SCATTER_NORMAL),
    size: MIN_ROCK + rng() * (MAX_ROCK - MIN_ROCK),
  }))
}

/** Todos os troianos do sistema; `forks[i]` é do planeta `system.orbits[i]`. */
export function systemTrojans(system: OrbitSystem, forks: number[]): Trojan[] {
  return system.orbits.flatMap((_, i) => trojanSwarm(system, i, forks[i] ?? 0))
}

/** Avanço do troiano sobre o planeta, em anomalia média: ±60° mais o espalhamento e a libração (girino). */
export function trojanLongitude(tr: Trojan, t: number): number {
  return tr.side * TROJAN_LEAD + tr.along + tr.amplitude * Math.sin((2 * Math.PI * t) / tr.libration + tr.librationPhase)
}

/** Posição do troiano no instante t (na órbita do planeta, com a precessão). Escreve em `out` e o devolve. */
export function trojanPosition(system: OrbitSystem, tr: Trojan, t: number, out: Vec3): Vec3 {
  const orbit = system.orbits[tr.planet]
  const ring = system.rings[orbit.ring]
  const M = orbit.phase + (2 * Math.PI * t) / ring.period + trojanLongitude(tr, t)
  positionFromE(ring, solveKepler(M, ring.e), out, periapsisAt(ring, t))
  const r = Math.hypot(out[0], out[1], out[2])
  const k = 1 + tr.radial / r
  // normal do plano orbital (como orbitNormal, sem alocar)
  const si = Math.sin(ring.inclination)
  out[0] = out[0] * k + Math.sin(ring.node) * si * tr.normal
  out[1] = out[1] * k + Math.cos(ring.inclination) * tr.normal
  out[2] = out[2] * k + Math.cos(ring.node) * si * tr.normal
  return out
}
