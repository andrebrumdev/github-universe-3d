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
  /** maior raio de planeta no anel */
  maxRadius: number
}

export interface PlanetOrbit {
  name: string
  ring: number
  radius: number
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
export const MAX_INCLINATION = (6 * Math.PI) / 180
const SUN_CLEARANCE = 3
const RING_GAP = 1.2

export function ringCapacity(k: number): number {
  return 3 + 2 * k
}

export function buildOrbits(planets: { name: string; radius: number }[]): OrbitSystem {
  const rings: Ring[] = []
  const orbits: PlanetOrbit[] = []
  let start = 0
  for (let k = 0; start < planets.length; k++) {
    const members = planets.slice(start, start + ringCapacity(k))
    const n = members.length
    const maxRadius = Math.max(...members.map((m) => m.radius))
    const rng = seededRandom(`ring-${k}`)
    const e = 0.02 + rng() * 0.06
    const inclination = (rng() * 2 - 1) * MAX_INCLINATION
    const node = rng() * Math.PI * 2
    const periapsis = rng() * Math.PI * 2

    const prev = rings[k - 1]
    // O periélio deste anel fica além do afélio do anterior (ou do sol), com folga.
    const minPeri = prev
      ? prev.a * (1 + prev.e) + prev.maxRadius + maxRadius + RING_GAP
      : SUN_RADIUS + SUN_CLEARANCE + maxRadius
    // Vizinhos no mesmo anel: a separação em anomalia verdadeira encolhe no afélio (fator ≥ 0,8 para e ≤ 0,08).
    const sameRing = n > 1 ? (2 * maxRadius + RING_GAP) / (2 * Math.sin((0.8 * Math.PI) / n)) : 0
    const a = Math.max(minPeri, sameRing) / (1 - e)
    const period = rings.length ? INNER_PERIOD * Math.pow(a / rings[0].a, 1.5) : INNER_PERIOD

    rings.push({ index: k, a, e, inclination, node, periapsis, period, maxRadius })
    members.forEach((m, i) => orbits.push({ name: m.name, ring: k, radius: m.radius, phase: (i / n) * Math.PI * 2 + k * 0.7 }))
    start += n
  }
  return { rings, orbits }
}

/** Equação de Kepler M = E − e·sin E, por Newton (converge em poucas iterações para e ≤ 0,1). */
export function solveKepler(M: number, e: number): number {
  let E = M
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
