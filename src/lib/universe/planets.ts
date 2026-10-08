import type { Language, RepoBase } from '../types'
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
  orbitRadius: number
  /** rad por segundo de simulação */
  speed: number
  inclination: number
  phase: number
}

export const MIN_MOON_RADIUS = 0.12
export const MAX_MOON_RADIUS = 0.35
/**
 * Órbita da lua i: MOON_ORBIT_SCALE·r + MOON_ORBIT_OFFSET + i·MOON_ORBIT_STEP.
 * O passo passa de 2·MAX_MOON_RADIUS, então duas luas nunca se tocam (a distância entre elas é ≥ a diferença das órbitas),
 * e a primeira fica fora do planeta mesmo no menor raio.
 */
const MOON_ORBIT_SCALE = 1.1
const MOON_ORBIT_OFFSET = 0.4
const MOON_ORBIT_STEP = 0.75

function moonOrbitRadius(planetR: number, i: number): number {
  return MOON_ORBIT_SCALE * planetR + MOON_ORBIT_OFFSET + i * MOON_ORBIT_STEP
}

/**
 * Alcance do planeta com as luas (distância máxima ao centro do planeta): a órbita mais externa mais o maior raio
 * de lua possível; sem luas, o próprio raio. É o que o espaçamento das órbitas reserva para cada corpo.
 */
export function bodyExtent(planetR: number, moonCount: number): number {
  const n = Math.min(MAX_MOONS, Math.max(0, Math.floor(moonCount)))
  return n === 0 ? planetR : moonOrbitRadius(planetR, n - 1) + MAX_MOON_RADIUS
}

/** `languages` deve vir ordenado por bytes (decrescente), como sai do normalize. */
export function moonOrbits(planetR: number, languages: Language[]): MoonSpec[] {
  const langs = languages.slice(0, MAX_MOONS)
  if (langs.length === 0) return []
  const maxBytes = Math.max(...langs.map((l) => l.bytes), 1)
  return langs.map((l, i) => ({
    language: l.name,
    color: l.color,
    radius: MIN_MOON_RADIUS + (MAX_MOON_RADIUS - MIN_MOON_RADIUS) * Math.sqrt(l.bytes / maxBytes),
    orbitRadius: moonOrbitRadius(planetR, i),
    speed: 0.8 / (1 + i * 0.5),
    inclination: ((i % 3) - 1) * 0.12,
    phase: i * 2.399,
  }))
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
