import { describe, expect, it } from 'vitest'
import {
  languageShares,
  MAX_MOONS,
  MAX_PLANET_RADIUS,
  MIN_PLANET_RADIUS,
  moonOrbits,
  planetRadius,
  planetSpin,
  rankRepos,
} from './planets'

const NOW = new Date('2026-10-08T00:00:00Z')
const lang = (name: string, bytes: number) => ({ name, color: '#fff', bytes })

describe('planetRadius', () => {
  it('fica entre o mínimo e o máximo e cresce com a popularidade', () => {
    expect(planetRadius(0, 0)).toBe(MIN_PLANET_RADIUS)
    expect(planetRadius(1_000_000, 0)).toBe(MAX_PLANET_RADIUS)
    expect(planetRadius(50, 5)).toBeGreaterThan(planetRadius(5, 0))
  })
})

describe('rankRepos', () => {
  it('ordena por stars e recência, com desempate por nome', () => {
    const repos = [
      { name: 'antigo', stars: 10, pushedAt: '2023-01-01T00:00:00Z' },
      { name: 'popular', stars: 500, pushedAt: '2025-01-01T00:00:00Z' },
      { name: 'recente', stars: 10, pushedAt: '2026-10-07T00:00:00Z' },
      { name: 'b-empate', stars: 0, pushedAt: '2020-01-01T00:00:00Z' },
      { name: 'a-empate', stars: 0, pushedAt: '2020-01-01T00:00:00Z' },
    ]
    expect(rankRepos(repos, NOW).map((r) => r.name)).toEqual(['popular', 'recente', 'antigo', 'a-empate', 'b-empate'])
  })
})

describe('moonOrbits', () => {
  it('repo sem linguagens não tem luas', () => {
    expect(moonOrbits(1, [])).toEqual([])
  })

  it('limita a MAX_MOONS e mantém luas maiores para mais bytes', () => {
    const langs = Array.from({ length: 9 }, (_, i) => lang(`L${i}`, 1000 - i * 100))
    const moons = moonOrbits(1, langs)
    expect(moons).toHaveLength(MAX_MOONS)
    for (let i = 1; i < moons.length; i++) expect(moons[i].radius).toBeLessThanOrEqual(moons[i - 1].radius)
  })

  it('órbitas crescem e não encostam no planeta nem entre si', () => {
    const moons = moonOrbits(2, [lang('a', 900), lang('b', 900), lang('c', 900)])
    expect(moons[0].orbitRadius - moons[0].radius).toBeGreaterThan(2)
    for (let i = 1; i < moons.length; i++) {
      expect(moons[i].orbitRadius - moons[i - 1].orbitRadius).toBeGreaterThan(moons[i].radius + moons[i - 1].radius)
    }
  })
})

describe('languageShares', () => {
  it('soma 100% e lida com lista vazia', () => {
    const shares = languageShares([lang('a', 300), lang('b', 100)])
    expect(shares.map((s) => s.share)).toEqual([75, 25])
    expect(languageShares([])).toEqual([])
  })
})

describe('planetSpin', () => {
  it('é determinístico e tem obliquidade entre 0 e 30°', () => {
    expect(planetSpin('alpha')).toEqual(planetSpin('alpha'))
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      const { obliquity } = planetSpin(name)
      expect(obliquity).toBeGreaterThanOrEqual(0)
      expect(obliquity).toBeLessThanOrEqual((30 * Math.PI) / 180)
    }
  })
})
