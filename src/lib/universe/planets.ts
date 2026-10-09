import type { Language, RepoBase } from '../types'
import { orbitPosition, type Vec3 } from './orbits'
import { seededRandom } from './random'

export const MIN_PLANET_RADIUS = 0.45
export const MAX_PLANET_RADIUS = 3.0
/**
 * Peso de referência quando o maior peso do perfil não é informado (escala absoluta).
 * Com `maxWeight` do próprio perfil, o maior repo sempre ganha MAX_PLANET_RADIUS.
 */
export const REFERENCE_PLANET_WEIGHT = 1000
/** Expoente da curva sobre a escala log: >1 abre a diferença entre os repos do topo. */
const RADIUS_CURVE = 2
export const MAX_MOONS = 6
const DAY_MS = 86_400_000

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Popularidade de um repo: stars + 2·forks. */
export function planetWeight(stars: number, forks: number): number {
  return Math.max(0, stars + 2 * forks)
}

/** Maior peso do perfil; é o que vira o planeta de raio máximo. */
export function maxPlanetWeight(repos: { stars: number; forks: number }[]): number {
  return repos.reduce((max, r) => Math.max(max, planetWeight(r.stars, r.forks)), 0)
}

/**
 * Raio relativo ao próprio perfil: escala log normalizada pelo maior repo (0..1), elevada a RADIUS_CURVE.
 * O maior repo ganha MAX_PLANET_RADIUS; repos sem atividade ganham MIN_PLANET_RADIUS.
 */
export function planetRadius(stars: number, forks: number, maxWeight: number = REFERENCE_PLANET_WEIGHT): number {
  if (maxWeight <= 0) return MIN_PLANET_RADIUS
  const x = clamp(Math.log1p(planetWeight(stars, forks)) / Math.log1p(maxWeight), 0, 1)
  return MIN_PLANET_RADIUS + (MAX_PLANET_RADIUS - MIN_PLANET_RADIUS) * Math.pow(x, RADIUS_CURVE)
}

export function planetScore(repo: Pick<RepoBase, 'stars' | 'pushedAt'>, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - new Date(repo.pushedAt).getTime()) / DAY_MS)
  return Math.log10(1 + repo.stars) + 1.5 * Math.exp(-ageDays / 180)
}

export function rankRepos<T extends Pick<RepoBase, 'name' | 'stars' | 'pushedAt'>>(repos: T[], now: Date): T[] {
  return [...repos].sort((a, b) => planetScore(b, now) - planetScore(a, now) || a.name.localeCompare(b.name))
}

export interface MoonSpec {
  language: string
  color: string
  radius: number
  /** semieixo maior em volta do planeta */
  a: number
  /** excentricidade (MIN_MOON_ECCENTRICITY..MAX_MOON_ECCENTRICITY) */
  e: number
  /** inclinação sobre o equador do planeta */
  inclination: number
  /** longitude do nó ascendente Ω */
  node: number
  /** argumento do periapse ω */
  periapsis: number
  /** segundos de simulação por volta (3ª lei de Kepler em volta do planeta) */
  period: number
  /** anomalia média em t = 0 */
  phase: number
}

export const MIN_MOON_RADIUS = 0.12
export const MAX_MOON_RADIUS = 0.35
export const MIN_MOON_ECCENTRICITY = 0.02
export const MAX_MOON_ECCENTRICITY = 0.12
/**
 * Maior afastamento radial (a·e) pedido a uma lua: as internas, de semieixo pequeno, chegam a e = 0,12; as de fora,
 * de semieixo grande, ficam perto de e = 0,02. Assim a folga entre as cascas não explode o alcance do planeta.
 */
const MOON_EXCURSION = 0.1
/** Periapse da 1ª lua: MOON_ORBIT_SCALE·r + MOON_ORBIT_OFFSET (a superfície da lua fica ≥ 0,1·r + 0,05 do planeta). */
const MOON_ORBIT_SCALE = 1.1
const MOON_ORBIT_OFFSET = 0.4
/** Folga entre a apoapse de uma lua e a periapse da seguinte, além dos dois raios máximos de lua. */
const MOON_GAP = 0.05
/** T = MOON_PERIOD_SCALE·(a/r)^1,5: massa do planeta ∝ r³; a lua interna de um planeta médio leva ~11 s. */
const MOON_PERIOD_SCALE = 7
const MOON_MIN_INCLINATION = 2 * (Math.PI / 180)
const MOON_MAX_INCLINATION = 8 * (Math.PI / 180)

/** Maior excentricidade permitida a uma lua de semieixo a. */
function moonEccentricityCap(a: number): number {
  return clamp(MOON_EXCURSION / a, MIN_MOON_ECCENTRICITY, MAX_MOON_ECCENTRICITY)
}

/** Menor a cuja periapse, com a excentricidade máxima permitida, fica em `peri` (a − a·e é crescente em a). */
function semiMajorForPeriapsis(peri: number): number {
  const steep = peri / (1 - MAX_MOON_ECCENTRICITY)
  if (steep <= MOON_EXCURSION / MAX_MOON_ECCENTRICITY) return steep
  const mid = peri + MOON_EXCURSION
  if (mid <= MOON_EXCURSION / MIN_MOON_ECCENTRICITY) return mid
  return peri / (1 - MIN_MOON_ECCENTRICITY)
}

/**
 * Cascas das luas: cada lua i tem semieixo a e excentricidade máxima eMax, e a periapse dela fica além da apoapse
 * da anterior com dois raios máximos de lua e folga. Cascas radiais disjuntas: nenhuma lua encosta noutra, em
 * qualquer inclinação ou fase. Depende só do raio do planeta (o alcance não precisa do nome).
 */
function moonShells(planetR: number, n: number): { a: number; eMax: number }[] {
  const shells: { a: number; eMax: number }[] = []
  let peri = MOON_ORBIT_SCALE * planetR + MOON_ORBIT_OFFSET
  for (let i = 0; i < n; i++) {
    const a = semiMajorForPeriapsis(peri)
    const eMax = moonEccentricityCap(a)
    shells.push({ a, eMax })
    peri = a * (1 + eMax) + 2 * MAX_MOON_RADIUS + MOON_GAP
  }
  return shells
}

/** Período (s de simulação) pela 3ª lei de Kepler em volta de um planeta de raio r (massa ∝ r³). */
export function moonPeriod(a: number, planetR: number): number {
  return MOON_PERIOD_SCALE * Math.pow(a / planetR, 1.5)
}

/**
 * Alcance do planeta com as luas (distância máxima ao centro do planeta): a apoapse mais externa possível mais o
 * maior raio de lua; sem luas, o próprio raio. É o que o espaçamento das órbitas reserva para cada corpo.
 */
export function bodyExtent(planetR: number, moonCount: number): number {
  const n = Math.min(MAX_MOONS, Math.max(0, Math.floor(moonCount)))
  if (n === 0) return planetR
  const last = moonShells(planetR, n)[n - 1]
  return last.a * (1 + last.eMax) + MAX_MOON_RADIUS
}

/** `languages` deve vir ordenado por bytes (decrescente), como sai do normalize. `seed` (o nome do repo) varia a órbita. */
export function moonOrbits(planetR: number, languages: Language[], seed = ''): MoonSpec[] {
  const langs = languages.slice(0, MAX_MOONS)
  if (langs.length === 0) return []
  const maxBytes = Math.max(...langs.map((l) => l.bytes), 1)
  const shells = moonShells(planetR, langs.length)
  return langs.map((l, i) => {
    const rng = seededRandom(`moon-${seed}-${i}`)
    const { a, eMax } = shells[i]
    return {
      language: l.name,
      color: l.color,
      radius: MIN_MOON_RADIUS + (MAX_MOON_RADIUS - MIN_MOON_RADIUS) * Math.sqrt(l.bytes / maxBytes),
      a,
      e: MIN_MOON_ECCENTRICITY + rng() * (eMax - MIN_MOON_ECCENTRICITY),
      inclination: (rng() < 0.5 ? -1 : 1) * (MOON_MIN_INCLINATION + rng() * (MOON_MAX_INCLINATION - MOON_MIN_INCLINATION)),
      node: rng() * Math.PI * 2,
      periapsis: rng() * Math.PI * 2,
      period: moonPeriod(a, planetR),
      phase: i * 2.399 + rng(),
    }
  })
}

/**
 * Posição da lua no referencial do planeta (y = eixo de rotação) no instante t, pelo solver de Kepler: rápida perto
 * do periapse, lenta perto da apoapse. Com `out`, escreve nele em vez de alocar.
 */
export function moonPosition(m: MoonSpec, t: number, out?: Vec3): Vec3 {
  return orbitPosition(m, m.phase + (2 * Math.PI * t) / m.period, out)
}

export function languageShares(langs: Language[]): (Language & { share: number })[] {
  const total = langs.reduce((sum, l) => sum + l.bytes, 0)
  if (total === 0) return []
  return langs.map((l) => ({ ...l, share: (l.bytes / total) * 100 }))
}

/**
 * Orientação do planeta por ângulos de Euler, aplicados nesta ordem (grupos aninhados no Planet):
 * 1. precessão ψ(t) em torno do y do sistema (normal da eclíptica);
 * 2. obliquidade θ(t) em torno de z, com nutação: θ(t) = θ₀ + Δθ·sin(ν·t + δ);
 * 3. rotação própria φ(t) em torno do y local (o eixo de rotação).
 */
export interface PlanetSpin {
  /** Obliquidade média θ₀ (inclinação do eixo), rad. */
  obliquity: number
  /** Rotação própria, rad por segundo de simulação (negativa = retrógrada). */
  spinSpeed: number
  /** Precessão do eixo em torno de y, rad por segundo de simulação; sentido oposto ao da rotação própria. */
  precessionSpeed: number
  /** Ângulo de precessão em t = 0, rad. */
  precessionPhase: number
  /** Amplitude da nutação Δθ, rad. */
  nutationAmplitude: number
  /** Frequência da nutação ν (3–5× |precessão|), rad por segundo de simulação. */
  nutationSpeed: number
  /** Fase da nutação δ em t = 0, rad. */
  nutationPhase: number
}

const DEG = Math.PI / 180

export function planetSpin(name: string): PlanetSpin {
  const rng = seededRandom(`spin-${name}`)
  const spinSpeed = (0.25 + rng() * 0.35) * (rng() < 0.15 ? -1 : 1)
  const precession = 0.12 + rng() * 0.18
  return {
    obliquity: (10 + rng() * 35) * DEG,
    spinSpeed,
    // Precessão por torque é retrógrada em relação ao giro (como a da Terra).
    precessionSpeed: -Math.sign(spinSpeed) * precession,
    precessionPhase: rng() * Math.PI * 2,
    nutationAmplitude: (2 + rng()) * DEG,
    nutationSpeed: precession * (3 + rng() * 2),
    nutationPhase: rng() * Math.PI * 2,
  }
}

export interface AxisAngles {
  /** ψ: rotação em y do sistema. */
  precession: number
  /** θ: rotação em z, já com nutação. */
  obliquity: number
  /** φ: rotação em y local. */
  spin: number
}

/** Ângulos de Euler do planeta no instante t (segundos de simulação). */
export function axisAngles(s: PlanetSpin, t: number): AxisAngles {
  return {
    precession: s.precessionPhase + s.precessionSpeed * t,
    obliquity: s.obliquity + s.nutationAmplitude * Math.sin(s.nutationSpeed * t + s.nutationPhase),
    spin: s.spinSpeed * t,
  }
}
