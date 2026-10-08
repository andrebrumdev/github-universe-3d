import type { Language, RepoBase } from '../types'
import { seededRandom } from './random'

export const MIN_PLANET_RADIUS = 0.6
export const MAX_PLANET_RADIUS = 2.2
export const MAX_MOONS = 6
const DAY_MS = 86_400_000

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function planetRadius(stars: number, forks: number): number {
  return clamp(MIN_PLANET_RADIUS + 0.55 * Math.log10(1 + stars + 2 * forks), MIN_PLANET_RADIUS, MAX_PLANET_RADIUS)
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

/** `languages` deve vir ordenado por bytes (decrescente), como sai do normalize. */
export function moonOrbits(planetR: number, languages: Language[]): MoonSpec[] {
  const langs = languages.slice(0, MAX_MOONS)
  if (langs.length === 0) return []
  const maxBytes = Math.max(...langs.map((l) => l.bytes), 1)
  return langs.map((l, i) => ({
    language: l.name,
    color: l.color,
    radius: 0.12 + 0.23 * Math.sqrt(l.bytes / maxBytes),
    orbitRadius: planetR + 0.6 + i * 0.8,
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

export interface PlanetSpin {
  /** Inclinação do eixo (ângulo de Euler em torno de z), rad. */
  obliquity: number
  /** Rotação própria, rad por segundo de simulação. */
  spinSpeed: number
  /** Precessão do eixo em torno de y, rad por segundo de simulação. */
  precessionSpeed: number
}

export function planetSpin(name: string): PlanetSpin {
  const rng = seededRandom(`spin-${name}`)
  return {
    obliquity: rng() * ((30 * Math.PI) / 180),
    spinSpeed: (0.15 + rng() * 0.25) * (rng() < 0.15 ? -1 : 1),
    precessionSpeed: 0.01 + rng() * 0.02,
  }
}
