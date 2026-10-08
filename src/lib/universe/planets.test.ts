import { describe, expect, it } from 'vitest'
import {
  axisAngles,
  bodyExtent,
  languageShares,
  MAX_MOONS,
  MAX_MOON_RADIUS,
  MAX_PLANET_RADIUS,
  MIN_PLANET_RADIUS,
  maxPlanetWeight,
  moonOrbits,
  planetRadius,
  planetSpin,
  planetWeight,
  rankRepos,
} from './planets'

const NOW = new Date('2026-10-08T00:00:00Z')
const lang = (name: string, bytes: number) => ({ name, color: '#fff', bytes })

describe('planetRadius', () => {
  it('normaliza pelo maior repo do perfil: o maior ganha o máximo, sem atividade ganha o mínimo', () => {
    expect(planetWeight(80, 10)).toBe(100)
    expect(planetRadius(80, 10, 100)).toBe(MAX_PLANET_RADIUS)
    expect(planetRadius(0, 0, 100)).toBe(MIN_PLANET_RADIUS)
    expect(planetRadius(1_000, 0, 100)).toBe(MAX_PLANET_RADIUS)
    expect(planetRadius(50, 5, 100)).toBeGreaterThan(planetRadius(5, 0, 100))
  })

  it('perfil sem nenhuma atividade não gera NaN', () => {
    expect(planetRadius(0, 0, 0)).toBe(MIN_PLANET_RADIUS)
    expect(maxPlanetWeight([])).toBe(0)
  })

  it('o mesmo repo é maior num perfil pequeno que num perfil enorme', () => {
    expect(planetRadius(20, 0, 20)).toBeGreaterThan(planetRadius(20, 0, 50_000))
  })

  it('na amostra os planetas se espalham entre pequenos, médios e grandes', () => {
    const repos = [
      [320, 41], [210, 30], [150, 12], [95, 20], [60, 4], [44, 6], [30, 5],
      [25, 3], [18, 2], [12, 1], [8, 1], [5, 0], [3, 0], [0, 0],
    ].map(([stars, forks]) => ({ stars, forks }))
    const max = maxPlanetWeight(repos)
    expect(max).toBe(402)
    const radii = repos.map((r) => planetRadius(r.stars, r.forks, max))
    expect(radii[0]).toBe(MAX_PLANET_RADIUS)
    expect(radii[radii.length - 1]).toBe(MIN_PLANET_RADIUS)
    expect(radii.filter((r) => r < 1).length).toBeGreaterThanOrEqual(3)
    expect(radii.filter((r) => r >= 1 && r <= 2).length).toBeGreaterThanOrEqual(4)
    expect(radii.filter((r) => r > 2).length).toBeGreaterThanOrEqual(3)
    // vizinhos no topo do ranking também se distinguem a olho
    expect(radii[0] - radii[1]).toBeGreaterThan(0.25)
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

  it('órbitas crescem e não encostam no planeta nem entre si, mesmo com 6 luas máximas', () => {
    const equal = Array.from({ length: MAX_MOONS }, (_, i) => lang(`L${i}`, 900))
    for (const r of [MIN_PLANET_RADIUS, 1, 2, MAX_PLANET_RADIUS]) {
      const moons = moonOrbits(r, equal)
      expect(moons[0].radius).toBeCloseTo(MAX_MOON_RADIUS, 12)
      expect(moons[0].orbitRadius - moons[0].radius).toBeGreaterThan(r + 0.05)
      for (let i = 1; i < moons.length; i++) {
        expect(moons[i].orbitRadius - moons[i - 1].orbitRadius).toBeGreaterThan(moons[i].radius + moons[i - 1].radius)
      }
    }
  })
})

describe('bodyExtent', () => {
  it('sem luas é o próprio raio; com luas, a órbita mais externa mais o maior raio de lua', () => {
    expect(bodyExtent(1.7, 0)).toBe(1.7)
    const six = moonOrbits(3, Array.from({ length: 6 }, (_, i) => lang(`L${i}`, 900)))
    expect(bodyExtent(3, 6)).toBeCloseTo(six[5].orbitRadius + MAX_MOON_RADIUS, 12)
    expect(bodyExtent(3, 9)).toBe(bodyExtent(3, MAX_MOONS))
  })

  it('cobre todas as luas reais e cresce com o número de luas sem explodir', () => {
    const langs = [lang('a', 1000), lang('b', 400), lang('c', 90), lang('d', 10), lang('e', 5)]
    for (const r of [MIN_PLANET_RADIUS, 1.3, MAX_PLANET_RADIUS]) {
      for (let n = 1; n <= langs.length; n++) {
        const ext = bodyExtent(r, n)
        for (const m of moonOrbits(r, langs.slice(0, n))) expect(m.orbitRadius + m.radius).toBeLessThanOrEqual(ext + 1e-12)
        expect(ext).toBeGreaterThan(bodyExtent(r, n - 1))
      }
    }
    // o planeta maior com 6 luas não passa de ~2,6× o próprio raio
    expect(bodyExtent(MAX_PLANET_RADIUS, MAX_MOONS)).toBeLessThan(8)
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
  const NAMES = Array.from({ length: 60 }, (_, i) => `repo-${i}`)
  const deg = (d: number) => (d * Math.PI) / 180

  it('é determinístico', () => {
    expect(planetSpin('alpha')).toEqual(planetSpin('alpha'))
  })

  it('obliquidade entre 10° e 45°, nutação de 2° a 3° a 3–5× a precessão', () => {
    for (const name of NAMES) {
      const s = planetSpin(name)
      expect(s.obliquity).toBeGreaterThanOrEqual(deg(10))
      expect(s.obliquity).toBeLessThanOrEqual(deg(45))
      expect(s.nutationAmplitude).toBeGreaterThanOrEqual(deg(2))
      expect(s.nutationAmplitude).toBeLessThanOrEqual(deg(3))
      const ratio = s.nutationSpeed / Math.abs(s.precessionSpeed)
      expect(ratio).toBeGreaterThanOrEqual(3)
      expect(ratio).toBeLessThanOrEqual(5)
    }
  })

  it('precessão visível mas lenta (0,12–0,3 rad/s), retrógrada em relação à rotação própria', () => {
    for (const name of NAMES) {
      const s = planetSpin(name)
      expect(Math.abs(s.precessionSpeed)).toBeGreaterThanOrEqual(0.12)
      expect(Math.abs(s.precessionSpeed)).toBeLessThanOrEqual(0.3)
      expect(Math.abs(s.spinSpeed)).toBeGreaterThanOrEqual(0.25)
      expect(Math.abs(s.spinSpeed)).toBeLessThanOrEqual(0.6)
      expect(Math.sign(s.precessionSpeed)).toBe(-Math.sign(s.spinSpeed))
    }
  })
})

describe('axisAngles', () => {
  it('compõe precessão, obliquidade com nutação e rotação própria no tempo', () => {
    const s = planetSpin('universe-3d')
    const a0 = axisAngles(s, 0)
    expect(a0.precession).toBeCloseTo(s.precessionPhase, 12)
    expect(a0.spin).toBeCloseTo(0, 12)
    const t = 7.3
    const a = axisAngles(s, t)
    expect(a.precession).toBeCloseTo(s.precessionPhase + s.precessionSpeed * t, 12)
    expect(a.spin).toBeCloseTo(s.spinSpeed * t, 12)
    let lo = Infinity
    let hi = -Infinity
    for (let k = 0; k < 400; k++) {
      const { obliquity } = axisAngles(s, k * 0.25)
      lo = Math.min(lo, obliquity)
      hi = Math.max(hi, obliquity)
    }
    // a obliquidade oscila (nutação) em torno do valor médio, dentro da amplitude
    expect(hi - lo).toBeGreaterThan(1.8 * s.nutationAmplitude)
    expect(hi).toBeLessThanOrEqual(s.obliquity + s.nutationAmplitude + 1e-12)
    expect(lo).toBeGreaterThanOrEqual(s.obliquity - s.nutationAmplitude - 1e-12)
  })
})
