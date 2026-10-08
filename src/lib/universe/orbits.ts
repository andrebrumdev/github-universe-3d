import { seededRandom } from './random'

export type Vec3 = [number, number, number]

export interface Ring {
  index: number
  /** semieixo maior */
  a: number
  /** excentricidade */
  e: number
  /** inclinação i (Euler) */
  inclination: number
  /** longitude do nó ascendente Ω (Euler) */
  node: number
  /** argumento do periélio ω (Euler) */
  periapsis: number
  /** segundos de simulação por volta */
  period: number
  /** maior alcance (planeta + luas, ver `bodyExtent`) entre os planetas do anel */
  maxRadius: number
}

export interface PlanetOrbit {
  name: string
  ring: number
  /** raio do planeta (desenho) */
  radius: number
  /** alcance do planeta com as luas; é o que o espaçamento reserva */
  extent: number
  /** anomalia média em t = 0 */
  phase: number
}

export interface OrbitSystem {
  rings: Ring[]
  /** Mesma ordem dos planetas recebidos. */
  orbits: PlanetOrbit[]
}

export const SUN_RADIUS = 2.5
export const INNER_PERIOD = 60
/** Excentricidade: anéis internos mais elípticos (~0,25), externos ~0,12–0,15, para o sistema não crescer demais. */
export const MIN_ECCENTRICITY = 0.12
export const MAX_ECCENTRICITY = 0.25
/** |inclinação| entre 4° e 14°, com sinal aleatório: todo plano orbital fica visivelmente inclinado. */
export const MIN_INCLINATION = (4 * Math.PI) / 180
export const MAX_INCLINATION = (14 * Math.PI) / 180
const SUN_CLEARANCE = 3
export const RING_GAP = 1.2

export function ringCapacity(k: number): number {
  return 3 + 2 * k
}

/**
 * Menor distância entre dois pontos de uma elipse de semieixo 1 separados por k·2π/n em anomalia média
 * (k = 1..n−1). Planetas do mesmo anel mantêm essa separação para sempre; a distância real é a × este fator.
 */
export function minChordFactor(e: number, n: number): number {
  const b = Math.sqrt(1 - e * e)
  const point = (M: number) => {
    const E = solveKepler(M, e)
    return [Math.cos(E) - e, b * Math.sin(E)]
  }
  const samples = 360
  let min = Infinity
  for (let k = 1; k <= n / 2; k++) {
    for (let s = 0; s < samples; s++) {
      const M = (s / samples) * Math.PI * 2
      const [x1, y1] = point(M)
      const [x2, y2] = point(M + (k / n) * Math.PI * 2)
      min = Math.min(min, Math.hypot(x2 - x1, y2 - y1))
    }
  }
  return min
}

/** `extent` (planeta + luas) é o que entra no espaçamento; se faltar, vale o próprio `radius`. */
export function buildOrbits(planets: { name: string; radius: number; extent?: number }[]): OrbitSystem {
  const rings: Ring[] = []
  const orbits: PlanetOrbit[] = []
  let start = 0
  for (let k = 0; start < planets.length; k++) {
    const members = planets.slice(start, start + ringCapacity(k)).map((m) => ({ ...m, extent: Math.max(m.radius, m.extent ?? m.radius) }))
    const n = members.length
    const maxRadius = Math.max(...members.map((m) => m.extent))
    const rng = seededRandom(`ring-${k}`)
    const taper = Math.min(1, k / 3)
    const e = MAX_ECCENTRICITY - (MAX_ECCENTRICITY - MIN_ECCENTRICITY) * (0.75 * taper + 0.25 * rng())
    const inclination = (rng() < 0.5 ? -1 : 1) * (MIN_INCLINATION + rng() * (MAX_INCLINATION - MIN_INCLINATION))
    const node = rng() * Math.PI * 2
    const periapsis = rng() * Math.PI * 2

    const prev = rings[k - 1]
    // O periélio deste anel fica além do afélio do anterior (ou do sol), com os dois alcances máximos e folga:
    // vale em qualquer orientação (Ω, i, ω), porque compara só distâncias ao sol.
    const minPeri = prev
      ? prev.a * (1 + prev.e) + prev.maxRadius + maxRadius + RING_GAP
      : SUN_RADIUS + SUN_CLEARANCE + maxRadius
    // Vizinhos no mesmo anel: a corda entre eles encolhe perto do afélio; 2% de margem sobre a amostragem.
    const sameRing = n > 1 ? (2 * maxRadius + RING_GAP) / (0.98 * minChordFactor(e, n)) : 0
    const a = Math.max(minPeri / (1 - e), sameRing)
    const period = rings.length ? INNER_PERIOD * Math.pow(a / rings[0].a, 1.5) : INNER_PERIOD

    rings.push({ index: k, a, e, inclination, node, periapsis, period, maxRadius })
    members.forEach((m, i) =>
      orbits.push({ name: m.name, ring: k, radius: m.radius, extent: m.extent, phase: (i / n) * Math.PI * 2 + k * 0.7 }),
    )
    start += n
  }
  return { rings, orbits }
}

/** Equação de Kepler M = E − e·sin E, por Newton a partir de E₀ = M + e·sin M (converge rápido para e ≤ 0,3). */
export function solveKepler(M: number, e: number): number {
  let E = M + e * Math.sin(M)
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  return E
}

export function positionFromE(ring: Ring, E: number): Vec3 {
  const { a, e, node, inclination, periapsis } = ring
  const xp = a * (Math.cos(E) - e)
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const cO = Math.cos(node), sO = Math.sin(node)
  const ci = Math.cos(inclination), si = Math.sin(inclination)
  const cw = Math.cos(periapsis), sw = Math.sin(periapsis)
  // Rotação 3-1-3 (Ω, i, ω) do plano orbital para o referencial do sol.
  const X = (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp
  const Y = (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp
  const Z = sw * si * xp + cw * si * yp
  // Astronomia usa Z para cima; Three.js usa Y para cima.
  return [X, Z, -Y]
}

export function orbitPosition(ring: Ring, M: number): Vec3 {
  return positionFromE(ring, solveKepler(M, ring.e))
}

export function planetPosition(ring: Ring, orbit: PlanetOrbit, t: number): Vec3 {
  return orbitPosition(ring, orbit.phase + (2 * Math.PI * t) / ring.period)
}

export function orbitPath(ring: Ring, segments = 160): Vec3[] {
  return Array.from({ length: segments + 1 }, (_, i) => positionFromE(ring, (i / segments) * Math.PI * 2))
}
