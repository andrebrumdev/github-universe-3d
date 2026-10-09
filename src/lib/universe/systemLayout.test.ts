import { describe, expect, it } from 'vitest'
import { overviewPose, starfieldRadius } from '../cameraPoses'
import { buildSampleUniverse } from '../github/sample'
import { buildOrbits } from './orbits'
import { bodyExtent, MAX_MOONS, maxPlanetWeight, planetRadius } from './planets'
import { layoutSystem, planetSlots, type LayoutRepo } from './systemLayout'

const universe = buildSampleUniverse()
const repos: LayoutRepo[] = universe.repos.map((r) => ({ name: r.name, stars: r.stars, forks: r.forks, languageCount: r.languages.length }))

describe('layoutSystem', () => {
  it('é o mesmo sistema que a cena montava (buildOrbits + starfieldRadius)', () => {
    const maxWeight = maxPlanetWeight(universe.repos)
    const expected = buildOrbits(
      universe.repos.map((r) => {
        const radius = planetRadius(r.stars, r.forks, maxWeight)
        return { name: r.name, radius, extent: bodyExtent(radius, Math.min(MAX_MOONS, r.languages.length)), trojans: r.forks > 0 }
      }),
    )
    const layout = layoutSystem(planetSlots(repos))
    expect(layout.system).toEqual(expected)
    expect(layout.starRadius).toBe(starfieldRadius(expected))
  })

  it('só leva dados (atravessa o postMessage) e o clone enquadra igual', () => {
    const layout = layoutSystem(planetSlots(repos))
    const clone = structuredClone(layout)
    expect(clone).toEqual(layout)
    expect(overviewPose(clone.system, { aspect: 1.6, fov: 50 })).toEqual(overviewPose(layout.system, { aspect: 1.6, fov: 50 }))
  })

  it('planetSlots manda só o que o espaçamento usa', () => {
    const [slot] = planetSlots(repos)
    expect(Object.keys(slot).sort()).toEqual(['extent', 'name', 'radius', 'trojans'])
  })

  it('perfil vazio: sistema vazio, casca mínima', () => {
    const layout = layoutSystem(planetSlots([]))
    expect(layout.system).toEqual({ rings: [], orbits: [] })
    expect(layout.starRadius).toBeGreaterThan(0)
  })
})
