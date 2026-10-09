import { starfieldRadius } from '../cameraPoses'
import { buildOrbits, type OrbitSystem } from './orbits'
import { bodyExtent, MAX_MOONS, maxPlanetWeight, planetRadius } from './planets'

/** O que o tamanho e o espaçamento usam de cada repo (o resto do repo não atravessa para o worker). */
export interface LayoutRepo {
  name: string
  stars: number
  forks: number
  /** Linguagens do repo (cada uma vira lua, até MAX_MOONS). */
  languageCount: number
}

/** O que o espaçamento das órbitas usa de cada planeta. */
export interface PlanetSlot {
  name: string
  radius: number
  extent: number
  trojans: boolean
}

/** Sistema montado e o raio da casca de estrelas: só dados, atravessam o postMessage. */
export interface SystemLayout {
  system: OrbitSystem
  starRadius: number
}

/**
 * Tamanho relativo ao próprio perfil (o repo de maior peso fica com o raio máximo); o espaçamento reserva o planeta
 * com as luas (uma por linguagem, até MAX_MOONS) e, no repo com forks, as nuvens de troianos em L4/L5.
 */
export function planetSlots(repos: LayoutRepo[]): PlanetSlot[] {
  const maxWeight = maxPlanetWeight(repos)
  return repos.map((r) => {
    const radius = planetRadius(r.stars, r.forks, maxWeight)
    return { name: r.name, radius, extent: bodyExtent(radius, Math.min(MAX_MOONS, r.languageCount)), trojans: r.forks > 0 }
  })
}

/**
 * Órbitas e casca de estrelas (que cresce com o sistema). É a parte cara da carga (~60–240 ms com a CPU 4× mais
 * lenta), por isso roda no worker da cena; a função é pura e também roda na thread principal (sem worker).
 */
export function layoutSystem(slots: PlanetSlot[]): SystemLayout {
  const system = buildOrbits(slots)
  return { system, starRadius: starfieldRadius(system) }
}
