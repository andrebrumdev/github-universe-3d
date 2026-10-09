import { describe, expect, it } from 'vitest'
import {
  axisAngles,
  bodyExtent,
  FOCUS_MOON_RATE,
  FOCUS_SPIN_RATE,
  focusMoonStep,
  focusSpinStep,
  languageShares,
  MAX_MOON_ECCENTRICITY,
  MAX_MOONS,
  MAX_MOON_RADIUS,
  MAX_PLANET_RADIUS,
  MIN_MOON_ECCENTRICITY,
  MIN_PLANET_RADIUS,
  maxPlanetWeight,
  moonOrbits,
  moonPeriod,
  moonPosition,
  planetRadius,
  planetSpin,
  planetWeight,
  rankRepos,
} from './planets'

const NOW = new Date('2026-10-08T00:00:00Z')
const lang = (name: string, bytes: number) => ({ name, color: '#fff', bytes })
type V = [number, number, number]
const len = (v: V) => Math.hypot(v[0], v[1], v[2])
const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

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

  it('órbitas de Kepler: excentricidade pequena (0,02–0,12), inclinadas e determinísticas por planeta', () => {
    const equal = Array.from({ length: MAX_MOONS }, (_, i) => lang(`L${i}`, 900))
    for (const r of [MIN_PLANET_RADIUS, 1, 2, MAX_PLANET_RADIUS]) {
      const moons = moonOrbits(r, equal, 'repo')
      expect(moons[0].radius).toBeCloseTo(MAX_MOON_RADIUS, 12)
      for (let i = 0; i < moons.length; i++) {
        expect(moons[i].e).toBeGreaterThanOrEqual(MIN_MOON_ECCENTRICITY)
        expect(moons[i].e).toBeLessThanOrEqual(MAX_MOON_ECCENTRICITY)
        expect(Math.abs(moons[i].inclination)).toBeGreaterThan(0)
        if (i > 0) expect(moons[i].a).toBeGreaterThan(moons[i - 1].a)
      }
    }
    expect(moonOrbits(1.5, equal, 'x')).toEqual(moonOrbits(1.5, equal, 'x'))
    expect(moonOrbits(1.5, equal, 'x')[0].periapsis).not.toBe(moonOrbits(1.5, equal, 'y')[0].periapsis)
    // a primeira lua de um planeta pequeno é visivelmente elíptica
    const small = Array.from({ length: 40 }, (_, k) => moonOrbits(MIN_PLANET_RADIUS, equal, `s${k}`)[0].e)
    expect(Math.max(...small)).toBeGreaterThan(0.08)
  })

  it('período pela 3ª lei de Kepler em volta do planeta: T ∝ a^1,5; a lua interna de um planeta médio leva 8–15 s', () => {
    const equal = Array.from({ length: MAX_MOONS }, (_, i) => lang(`L${i}`, 900))
    for (const r of [1.5, 1.7, 2]) {
      const moons = moonOrbits(r, equal, 'mid')
      expect(moons[0].period).toBeGreaterThanOrEqual(8)
      expect(moons[0].period).toBeLessThanOrEqual(15)
      for (const m of moons) expect(m.period / moons[0].period).toBeCloseTo(Math.pow(m.a / moons[0].a, 1.5), 9)
    }
    // mesmo semieixo relativo ao raio (planeta ∝ r³) → mesmo período
    expect(moonPeriod(2, 1)).toBeCloseTo(moonPeriod(4, 2), 12)
  })

  it('posição pelo solver de Kepler: periapse a(1−e), apoapse a(1+e), volta ao ponto depois de um período', () => {
    const [m] = moonOrbits(1.5, [lang('Go', 1)], 'kepler')
    let lo = Infinity
    let hi = 0
    for (let s = 0; s < 2000; s++) {
      const r = len(moonPosition(m, (s / 2000) * m.period))
      lo = Math.min(lo, r)
      hi = Math.max(hi, r)
    }
    expect(lo).toBeCloseTo(m.a * (1 - m.e), 3)
    expect(hi).toBeCloseTo(m.a * (1 + m.e), 3)
    const out: [number, number, number] = [0, 0, 0]
    const p0 = moonPosition(m, 3.3)
    expect(moonPosition(m, 3.3 + m.period, out)).toBe(out)
    expect(dist(p0, out)).toBeLessThan(1e-9)
  })

  it('nenhuma lua encosta no planeta nem em outra, com 6 luas máximas (menor folga)', () => {
    const equal = Array.from({ length: MAX_MOONS }, (_, i) => lang(`L${i}`, 900))
    let planetGap = Infinity
    let pairGap = Infinity
    for (const r of [MIN_PLANET_RADIUS, 1, 1.7, 2.4, MAX_PLANET_RADIUS]) {
      for (const seed of ['a', 'b', 'c']) {
        const moons = moonOrbits(r, equal, seed)
        const slowest = moons[moons.length - 1].period
        const STEPS = 3000
        for (let s = 0; s < STEPS; s++) {
          const t = (s / STEPS) * 3 * slowest
          const pos = moons.map((m) => moonPosition(m, t))
          for (let i = 0; i < moons.length; i++) {
            planetGap = Math.min(planetGap, len(pos[i]) - r - moons[i].radius)
            for (let j = i + 1; j < moons.length; j++) pairGap = Math.min(pairGap, dist(pos[i], pos[j]) - moons[i].radius - moons[j].radius)
          }
        }
      }
    }
    expect(planetGap).toBeGreaterThan(0)
    expect(pairGap).toBeGreaterThan(0)
  })
})

describe('bodyExtent', () => {
  it('sem luas é o próprio raio; com luas, a apoapse mais externa possível mais o maior raio de lua', () => {
    expect(bodyExtent(1.7, 0)).toBe(1.7)
    expect(bodyExtent(3, 9)).toBe(bodyExtent(3, MAX_MOONS))
    // com qualquer semente, a apoapse da última lua cabe no alcance (que não depende do nome)
    const six = Array.from({ length: 6 }, (_, i) => lang(`L${i}`, 900))
    let worst = 0
    for (let k = 0; k < 30; k++) {
      const m = moonOrbits(3, six, `seed-${k}`)[5]
      worst = Math.max(worst, m.a * (1 + m.e) + m.radius)
    }
    expect(worst).toBeLessThanOrEqual(bodyExtent(3, 6) + 1e-12)
  })

  it('cobre todas as luas reais e cresce com o número de luas sem explodir', () => {
    const langs = [lang('a', 1000), lang('b', 400), lang('c', 90), lang('d', 10), lang('e', 5)]
    for (const r of [MIN_PLANET_RADIUS, 1.3, MAX_PLANET_RADIUS]) {
      for (let n = 1; n <= langs.length; n++) {
        const ext = bodyExtent(r, n)
        for (const m of moonOrbits(r, langs.slice(0, n), 'p')) {
          for (let s = 0; s < 400; s++) expect(len(moonPosition(m, (s / 400) * m.period)) + m.radius).toBeLessThanOrEqual(ext + 1e-9)
        }
        expect(ext).toBeGreaterThan(bodyExtent(r, n - 1))
      }
    }
    // o planeta maior com 6 luas não passa de ~3,2× o próprio raio (órbitas elípticas pedem mais folga)
    expect(bodyExtent(MAX_PLANET_RADIUS, MAX_MOONS)).toBeLessThan(9.6)
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

describe('focusSpinStep', () => {
  it('em foco e com o tempo parado, gira devagar (uma volta em ~40 s)', () => {
    let a = 0
    for (let i = 0; i < 60; i++) a = focusSpinStep(a, 1 / 60, true, 0)
    expect(a).toBeCloseTo(FOCUS_SPIN_RATE, 6)
    expect((2 * Math.PI) / FOCUS_SPIN_RATE).toBeGreaterThan(30)
    expect((2 * Math.PI) / FOCUS_SPIN_RATE).toBeLessThan(60)
  })

  it('entra aos poucos conforme o relógio da simulação desacelera', () => {
    expect(focusSpinStep(0, 0.1, true, 1)).toBe(0)
    expect(focusSpinStep(0, 0.1, true, 0.5)).toBeCloseTo(0.5 * FOCUS_SPIN_RATE * 0.1, 9)
  })

  it('fora de foco ou com movimento reduzido mantém o ângulo (sem salto)', () => {
    expect(focusSpinStep(1.3, 0.1, false, 0)).toBe(1.3)
    expect(focusSpinStep(1.3, 0.1, true, 0, true)).toBe(1.3)
  })

  it('limita o dt de uma aba que volta do segundo plano', () => {
    expect(focusSpinStep(0, 30, true, 0)).toBeCloseTo(FOCUS_SPIN_RATE * 0.1, 9)
  })
})

describe('focusMoonStep', () => {
  it('em foco e com o tempo parado, as luas seguem a órbita mais devagar que o normal', () => {
    let t = 0
    for (let i = 0; i < 60; i++) t = focusMoonStep(t, 1 / 60, true, 0)
    expect(t).toBeCloseTo(FOCUS_MOON_RATE, 6)
    expect(FOCUS_MOON_RATE).toBeGreaterThan(0)
    expect(FOCUS_MOON_RATE).toBeLessThan(1)
  })

  it('fora de foco ou com movimento reduzido o tempo extra fica parado', () => {
    expect(focusMoonStep(2, 0.1, false, 0)).toBe(2)
    expect(focusMoonStep(2, 0.1, true, 0, true)).toBe(2)
  })
})
