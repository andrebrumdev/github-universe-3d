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
  /** precessão do periélio dω/dt, rad por segundo de simulação (ver `APSIDAL_TURN_PERIODS`) */
  apsidalRate: number
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
/**
 * Precessão do periélio: cada anel dá uma volta completa em ω a cada APSIDAL_TURN_PERIODS dos próprios períodos.
 * O externo leva ~20 voltas dele; os internos, de período curto, giram mais rápido (como Mercúrio).
 * Periélio e afélio não mudam de distância, e todos os planetas de um anel giram juntos: o espaçamento continua valendo.
 */
export const APSIDAL_TURN_PERIODS = 20
/** Troianos ficam em L4/L5: ±60° em anomalia média do planeta, na mesma órbita. */
export const TROJAN_LEAD = Math.PI / 3
/** Meia largura da nuvem em anomalia média: libração de até 10° mais 2° de espalhamento. */
export const TROJAN_ARC = (12 * Math.PI) / 180
/** Raio da nuvem fora da órbita (espalhamento radial e vertical mais a maior rocha). */
export const TROJAN_CLOUD_RADIUS = 0.62

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

/** Maior denominador das razões de ressonância (p:q) com o anel 0. */
export const RESONANCE_MAX_DENOMINATOR = 3

/** A menor razão simples p/q (q ≤ RESONANCE_MAX_DENOMINATOR) que não fica abaixo de `min` (mínimo duro). */
export function resonantRatio(min: number): number {
  let best = Infinity
  for (let q = 1; q <= RESONANCE_MAX_DENOMINATOR; q++) best = Math.min(best, Math.ceil(min * q) / q)
  return best
}

/** Pontos por volta na tabela de cordas (0,5°). */
const CHORD_SAMPLES = 720

/**
 * Menor corda entre dois pontos de uma elipse de semieixo 1 separados por d em anomalia média, para d de 0 a π
 * (passo 2π/CHORD_SAMPLES), mínima em qualquer ponto da volta. A tabela é monotonizada (mínimo daqui até π), então
 * ler o índice de baixo é sempre conservador.
 */
function chordTable(e: number): Float64Array {
  const b = Math.sqrt(1 - e * e)
  const xs = new Float64Array(CHORD_SAMPLES)
  const ys = new Float64Array(CHORD_SAMPLES)
  for (let i = 0; i < CHORD_SAMPLES; i++) {
    const E = solveKepler((i / CHORD_SAMPLES) * Math.PI * 2, e)
    xs[i] = Math.cos(E) - e
    ys[i] = b * Math.sin(E)
  }
  const half = CHORD_SAMPLES / 2
  const table = new Float64Array(half + 1)
  for (let d = 0; d <= half; d++) {
    let min = Infinity
    for (let i = 0; i < CHORD_SAMPLES; i++) {
      const j = (i + d) % CHORD_SAMPLES
      min = Math.min(min, Math.hypot(xs[j] - xs[i], ys[j] - ys[i]))
    }
    table[d] = min
  }
  for (let d = half - 1; d >= 0; d--) table[d] = Math.min(table[d], table[d + 1])
  return table
}

/** Distância angular no círculo, em [0, π]. */
function circularGap(x: number): number {
  const m = ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  return Math.min(m, 2 * Math.PI - m)
}

const chordAt = (table: Float64Array, d: number) => table[Math.floor((d / (2 * Math.PI)) * CHORD_SAMPLES)]

/**
 * Menor semieixo em que, com estas fases, os planetas do anel não se tocam e nenhuma nuvem de troianos (L4/L5 de
 * quem tem, com a libração) encosta num planeta do anel (inclusive o dono). Infinity se uma nuvem cai sobre um
 * planeta (não há a que resolva).
 */
function ringSemiMajor(table: Float64Array, phases: number[], trojans: boolean[], maxRadius: number): number {
  let need = 0
  const n = phases.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) need = Math.max(need, (2 * maxRadius + RING_GAP) / (0.98 * chordAt(table, circularGap(phases[j] - phases[i]))))
    if (!trojans[i]) continue
    for (const side of [1, -1]) {
      for (let j = 0; j < n; j++) {
        const gap = circularGap(phases[i] + side * TROJAN_LEAD - phases[j]) - TROJAN_ARC
        if (gap <= 0) return Infinity
        need = Math.max(need, (maxRadius + TROJAN_CLOUD_RADIUS + RING_GAP) / (0.98 * chordAt(table, gap)))
      }
    }
  }
  return need
}

/**
 * Fases do anel quando alguém tem troianos. Espaçados por igual (o padrão), L4/L5 de um planeta podem cair em cima de
 * um vizinho (anel de 6: exatamente; de 5 ou 7: quase). Alternativa: três grupos a 120°, cada um com abertura S;
 * as nuvens de um grupo caem no vão entre os grupos. Fica a disposição (e o S) que pede o menor semieixo.
 */
function trojanRingLayout(e: number, trojans: boolean[], maxRadius: number): { phases: number[]; a: number } {
  const n = trojans.length
  const table = chordTable(e)
  const uniform = trojans.map((_, i) => (i / n) * Math.PI * 2)
  let best = { phases: uniform, a: ringSemiMajor(table, uniform, trojans, maxRadius) }
  const sizes = [0, 1, 2].map((g) => Math.floor(n / 3) + (g < n % 3 ? 1 : 0))
  for (let deg = 2; deg <= 60; deg++) {
    const span = (deg * Math.PI) / 180
    const phases: number[] = []
    sizes.forEach((k, g) => {
      for (let m = 0; m < k; m++) phases.push((g * 2 * Math.PI) / 3 + (k > 1 ? (m / (k - 1) - 0.5) * span : 0))
    })
    const a = ringSemiMajor(table, phases, trojans, maxRadius)
    if (a < best.a) best = { phases, a }
  }
  return best
}

/**
 * `extent` (planeta + luas) é o que entra no espaçamento; se faltar, vale o próprio `radius`.
 * `trojans`: o planeta tem troianos em L4/L5 (repo com forks); o anel abre espaço para as nuvens.
 */
export function buildOrbits(planets: { name: string; radius: number; extent?: number; trojans?: boolean }[]): OrbitSystem {
  const rings: Ring[] = []
  const orbits: PlanetOrbit[] = []
  let start = 0
  for (let k = 0; start < planets.length; k++) {
    const members = planets.slice(start, start + ringCapacity(k)).map((m) => ({ ...m, extent: Math.max(m.radius, m.extent ?? m.radius) }))
    const n = members.length
    const trojans = members.map((m) => m.trojans === true)
    const hasTrojans = trojans.some(Boolean)
    // a nuvem dos troianos fica na órbita, com TROJAN_CLOUD_RADIUS de espessura: entra no alcance do anel
    const maxRadius = Math.max(...members.map((m) => m.extent), hasTrojans ? TROJAN_CLOUD_RADIUS : 0)
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
    let phases = members.map((_, i) => (i / n) * Math.PI * 2)
    let sameRing = n > 1 ? (2 * maxRadius + RING_GAP) / (0.98 * minChordFactor(e, n)) : 0
    if (hasTrojans) ({ phases, a: sameRing } = trojanRingLayout(e, trojans, maxRadius))
    const minA = Math.max(minPeri / (1 - e), sameRing)
    // Ressonância com o anel 0: o período vira uma fração simples do interno (2:1, 7:3, 5:2, 3:1…). O espaçamento é
    // um mínimo duro, então a razão sobe até a próxima fração cujo a (3ª lei: a ∝ razão^(2/3)) cabe.
    const ratio = rings.length ? resonantRatio(Math.pow(minA / rings[0].a, 1.5)) : 1
    const a = rings.length ? rings[0].a * Math.pow(ratio, 2 / 3) : minA
    const period = INNER_PERIOD * ratio

    const apsidalRate = (2 * Math.PI) / (APSIDAL_TURN_PERIODS * period)
    rings.push({ index: k, a, e, inclination, node, periapsis, period, apsidalRate, maxRadius })
    members.forEach((m, i) => orbits.push({ name: m.name, ring: k, radius: m.radius, extent: m.extent, phase: phases[i] + k * 0.7 }))
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

/** Elementos keplerianos que bastam para posicionar um corpo (anel, lua, cometa). */
export type OrbitElements = Pick<Ring, 'a' | 'e' | 'inclination' | 'node' | 'periapsis'>

/**
 * Com `out`, escreve nele (para o laço por frame não alocar) e o devolve.
 * `periapsis` substitui o ω dos elementos (a precessão passa o ω do instante).
 */
export function positionFromE(ring: OrbitElements, E: number, out?: Vec3, periapsis = ring.periapsis): Vec3 {
  const { a, e, node, inclination } = ring
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
  if (!out) return [X, Z, -Y]
  out[0] = X
  out[1] = Z
  out[2] = -Y
  return out
}

export function orbitPosition(ring: OrbitElements, M: number, out?: Vec3): Vec3 {
  return positionFromE(ring, solveKepler(M, ring.e), out)
}

/** Quanto o periélio do anel girou (rad) até o instante t. */
export function apsidalAngle(ring: Pick<Ring, 'apsidalRate'>, t: number): number {
  return ring.apsidalRate * t
}

/** ω no instante t (precessão do periélio). */
export function periapsisAt(ring: Pick<Ring, 'periapsis' | 'apsidalRate'>, t: number): number {
  return ring.periapsis + apsidalAngle(ring, t)
}

/** Normal unitária do plano orbital (no referencial do Three.js, y para cima): o eixo em torno do qual o periélio gira. */
export function orbitNormal(ring: OrbitElements): Vec3 {
  const si = Math.sin(ring.inclination)
  // 3ª coluna da rotação 3-1-3: (sin Ω sin i, −cos Ω sin i, cos i), com Z para cima → [X, Z, −Y].
  return [Math.sin(ring.node) * si, Math.cos(ring.inclination), Math.cos(ring.node) * si]
}

/** Posição do planeta no instante t; com `out`, escreve nele em vez de alocar. */
export function planetPosition(ring: Ring, orbit: PlanetOrbit, t: number, out?: Vec3): Vec3 {
  const M = orbit.phase + (2 * Math.PI * t) / ring.period
  return positionFromE(ring, solveKepler(M, ring.e), out, periapsisAt(ring, t))
}

/** A elipse do anel no instante t (com o periélio já girado pela precessão). */
export function orbitPath(ring: Ring, t = 0, segments = 160): Vec3[] {
  const omega = periapsisAt(ring, t)
  return Array.from({ length: segments + 1 }, (_, i) => positionFromE(ring, (i / segments) * Math.PI * 2, undefined, omega))
}
