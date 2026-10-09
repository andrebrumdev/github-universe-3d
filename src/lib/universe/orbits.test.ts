import { describe, expect, it } from 'vitest'
import { bodyExtent, MAX_MOONS, MAX_PLANET_RADIUS, MIN_PLANET_RADIUS } from './planets'
import {
  apsidalAngle,
  APSIDAL_TURN_PERIODS,
  buildOrbits,
  MAX_ECCENTRICITY,
  MAX_INCLINATION,
  MIN_ECCENTRICITY,
  MIN_INCLINATION,
  orbitNormal,
  orbitPosition,
  orbitPath,
  periapsisAt,
  planetPosition,
  resonantRatio,
  type Ring,
  RING_GAP,
  solveKepler,
  SUN_RADIUS,
  type Vec3,
} from './orbits'

/**
 * Trava de regressão do pior caso (40 planetas máximos com 6 luas): alcance ≈ 392 com as luas em órbitas de Kepler
 * (mais folga entre as cascas), ≈ 403 com as ressonâncias dos anéis (cada anel sobe até a próxima razão simples) e
 * ≈ 1253 com as luas em ressonância (1:2:4:6:12:24: a sexta lua fica a 24^(2/3) ≈ 8,3× a interna, alcance 9,4 → 32,6).
 * O enquadramento é testado em cameraPoses.test.
 */
const REACH_LIMIT = 1280
const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

const ring = (over: Partial<Ring> = {}): Ring => ({
  index: 0,
  a: 10,
  e: 0.08,
  inclination: 0.1,
  node: 0.7,
  periapsis: 1.3,
  period: 60,
  apsidalRate: 0,
  maxRadius: 1,
  ...over,
})

/** Rotação de Rodrigues de v em torno do eixo unitário k. */
const rotate = (v: Vec3, k: Vec3, ang: number): Vec3 => {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2]
  const x: Vec3 = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]]
  return [0, 1, 2].map((j) => v[j] * c + x[j] * s + k[j] * d * (1 - c)) as Vec3
}

describe('solveKepler', () => {
  it('resolve M = E − e·sin E com erro desprezível', () => {
    for (const e of [0, 0.02, 0.08, 0.12, 0.25, 0.3]) {
      for (let M = -Math.PI; M <= Math.PI; M += 0.37) {
        const E = solveKepler(M, e)
        expect(Math.abs(E - e * Math.sin(E) - M)).toBeLessThan(1e-9)
      }
    }
  })
})

describe('posição na órbita', () => {
  it('periélio a(1−e) em M=0 e afélio a(1+e) em M=π', () => {
    const r = ring()
    expect(len(orbitPosition(r, 0))).toBeCloseTo(r.a * (1 - r.e), 9)
    expect(len(orbitPosition(r, Math.PI))).toBeCloseTo(r.a * (1 + r.e), 9)
  })

  it('volta ao mesmo ponto depois de um período (sem precessão) e à mesma distância do sol (com precessão)', () => {
    const orbit = { name: 'p', ring: 0, radius: 1, extent: 1, phase: 0.4 }
    const still = ring()
    expect(dist(planetPosition(still, orbit, 12.3), planetPosition(still, orbit, 12.3 + still.period))).toBeLessThan(1e-9)
    const r = ring({ apsidalRate: 0.01 })
    expect(len(planetPosition(r, orbit, 12.3 + r.period))).toBeCloseTo(len(planetPosition(r, orbit, 12.3)), 9)
  })

  it('com `out`, escreve no vetor dado em vez de alocar', () => {
    const r = ring({ apsidalRate: 0.02 })
    const orbit = { name: 'p', ring: 0, radius: 1, extent: 1, phase: 0.4 }
    const out: Vec3 = [0, 0, 0]
    expect(planetPosition(r, orbit, 7, out)).toBe(out)
    expect(out).toEqual(planetPosition(r, orbit, 7))
  })

  it('órbita sem inclinação fica no plano y = 0', () => {
    const r = ring({ inclination: 0 })
    for (let M = 0; M < 6; M += 0.5) expect(Math.abs(orbitPosition(r, M)[1])).toBeLessThan(1e-12)
  })
})

describe('precessão do periélio', () => {
  it('ω avança com o tempo: o periélio no instante t é o da elipse com ω + dω/dt·t', () => {
    const r = ring({ apsidalRate: 0.03 })
    const orbit = { name: 'p', ring: 0, radius: 1, extent: 1, phase: 0 }
    // fase 0 e t = um período: o planeta está no periélio, que girou 0,03·60 rad
    const at = planetPosition(r, orbit, r.period)
    expect(dist(at, orbitPosition({ ...r, periapsis: r.periapsis + 0.03 * r.period }, 0))).toBeLessThan(1e-9)
    expect(periapsisAt(r, 10)).toBeCloseTo(r.periapsis + 0.3, 12)
  })

  it('a elipse gira em torno da normal do plano orbital (é o que o OrbitLines faz, sem refazer a geometria)', () => {
    const r = ring({ e: 0.2, inclination: -0.2, node: 2.1, apsidalRate: 0.04 })
    const n = orbitNormal(r)
    expect(len(n)).toBeCloseTo(1, 12)
    // a normal é perpendicular a todos os pontos da órbita (o sol fica no plano)
    for (const p of orbitPath(r, 0, 24)) expect(Math.abs(p[0] * n[0] + p[1] * n[1] + p[2] * n[2])).toBeLessThan(1e-9)
    const t = 17
    const base = orbitPath(r, 0, 32)
    const moved = orbitPath(r, t, 32)
    for (let i = 0; i < base.length; i++) expect(dist(rotate(base[i], n, apsidalAngle(r, t)), moved[i])).toBeLessThan(1e-9)
  })

  it('uma volta completa em 20 períodos do próprio anel: os internos giram mais rápido (como Mercúrio)', () => {
    const { rings } = buildOrbits(Array.from({ length: 40 }, (_, i) => ({ name: `p${i}`, radius: 1.2 })))
    for (const r of rings) {
      expect(r.apsidalRate).toBeGreaterThan(0)
      expect((2 * Math.PI) / r.apsidalRate).toBeCloseTo(APSIDAL_TURN_PERIODS * r.period, 6)
    }
    for (let k = 1; k < rings.length; k++) expect(rings[k].apsidalRate).toBeLessThan(rings[k - 1].apsidalRate)
    expect(APSIDAL_TURN_PERIODS).toBe(20)
  })
})

describe('ressonâncias orbitais', () => {
  it('resonantRatio: a menor fração simples (denominador até 3) que não fica abaixo do mínimo', () => {
    expect(resonantRatio(1.9)).toBe(2)
    expect(resonantRatio(2)).toBe(2)
    expect(resonantRatio(2.01)).toBeCloseTo(7 / 3, 12)
    expect(resonantRatio(2.4)).toBe(2.5)
    expect(resonantRatio(1.05)).toBeCloseTo(4 / 3, 12)
    expect(resonantRatio(10.2)).toBeCloseTo(31 / 3, 12)
  })

  it.each([
    ['amostra (14)', Array.from({ length: 14 }, (_, i) => ({ name: `p${i}`, radius: 3 - i * 0.18, extent: bodyExtent(3 - i * 0.18, i % 4) }))],
    ['40 máximos com 6 luas', Array.from({ length: 40 }, (_, i) => ({ name: `p${i}`, radius: MAX_PLANET_RADIUS, extent: bodyExtent(MAX_PLANET_RADIUS, MAX_MOONS) }))],
  ])('%s: o período de cada anel é uma razão simples (p/q, q ≤ 3) do anel 0, bem abaixo de 1 por cento de erro', (_, planets) => {
    const { rings } = buildOrbits(planets)
    for (const r of rings.slice(1)) {
      const ratio = r.period / rings[0].period
      // exata (até o arredondamento), o que é bem mais forte que "a menos de 1%"; em razões grandes, frações de
      // denominador 3 ficam a menos de 1% de qualquer número, então só a tolerância fina testa alguma coisa
      const near = [1, 2, 3].some((q) => Math.abs(Math.round(ratio * q) / q - ratio) / ratio < 1e-9)
      expect(near).toBe(true)
      // a vem da 3ª lei: a = a₀ · razão^(2/3)
      expect(r.a / rings[0].a).toBeCloseTo(Math.pow(ratio, 2 / 3), 9)
    }
  })
})

describe('buildOrbits', () => {
  it('sistema vazio e sistema com um planeta', () => {
    expect(buildOrbits([])).toEqual({ rings: [], orbits: [] })
    const one = buildOrbits([{ name: 'solo', radius: 1 }])
    expect(one.rings).toHaveLength(1)
    expect(one.orbits[0]).toMatchObject({ name: 'solo', ring: 0 })
  })

  it('o alcance (planeta + luas) é o que conta no espaçamento; sem alcance, vale o raio', () => {
    const { rings, orbits } = buildOrbits([
      { name: 'a', radius: 1 },
      { name: 'b', radius: 2, extent: 5 },
      { name: 'c', radius: 1.5 },
    ])
    expect(orbits.map((o) => [o.radius, o.extent])).toEqual([[1, 1], [2, 5], [1.5, 1.5]])
    expect(rings[0].maxRadius).toBe(5)
    const bare = buildOrbits([{ name: 'a', radius: 1 }, { name: 'b', radius: 2 }, { name: 'c', radius: 1.5 }])
    expect(rings[0].a).toBeGreaterThan(bare.rings[0].a)
  })

  it('preenche anéis com 3 + 2k planetas, na ordem do ranking', () => {
    const planets = Array.from({ length: 40 }, (_, i) => ({ name: `p${i}`, radius: 1 }))
    const { rings, orbits } = buildOrbits(planets)
    const sizes = rings.map((r) => orbits.filter((o) => o.ring === r.index).length)
    expect(sizes).toEqual([3, 5, 7, 9, 11, 5])
    expect(orbits.map((o) => o.name)).toEqual(planets.map((p) => p.name))
  })

  it('segue a 3ª lei de Kepler e os limites de e e inclinação (visíveis: elipses e planos inclinados)', () => {
    const { rings } = buildOrbits(Array.from({ length: 40 }, (_, i) => ({ name: `p${i}`, radius: 1.5 })))
    for (const r of rings) {
      expect(r.period / rings[0].period).toBeCloseTo(Math.pow(r.a / rings[0].a, 1.5), 9)
      expect(r.e).toBeGreaterThanOrEqual(MIN_ECCENTRICITY)
      expect(r.e).toBeLessThanOrEqual(MAX_ECCENTRICITY)
      expect(Math.abs(r.inclination)).toBeGreaterThanOrEqual(MIN_INCLINATION)
      expect(Math.abs(r.inclination)).toBeLessThanOrEqual(MAX_INCLINATION)
    }
    expect(MIN_ECCENTRICITY).toBeGreaterThanOrEqual(0.12)
    expect(MAX_INCLINATION).toBeCloseTo((14 * Math.PI) / 180, 12)
    // planos em direções diferentes: inclinações com sinais trocados entre os anéis
    expect(new Set(rings.map((r) => Math.sign(r.inclination))).size).toBe(2)
  })

  it('o periélio de cada anel passa do afélio do anterior, com os dois alcances máximos e a folga', () => {
    const planets = Array.from({ length: 40 }, (_, i) => {
      const radius = 0.45 + (i % 5) * 0.6
      return { name: `p${i}`, radius, extent: bodyExtent(radius, i % 7) }
    })
    const { rings } = buildOrbits(planets)
    for (let k = 1; k < rings.length; k++) {
      const prev = rings[k - 1]
      const next = rings[k]
      expect(next.a * (1 - next.e)).toBeGreaterThanOrEqual(
        prev.a * (1 + prev.e) + prev.maxRadius + next.maxRadius + RING_GAP - 1e-9,
      )
    }
  })

  it('o sistema cheio (40 planetas máximos com 6 luas) tem alcance limitado', () => {
    const extent = bodyExtent(MAX_PLANET_RADIUS, MAX_MOONS)
    const { rings } = buildOrbits(Array.from({ length: 40 }, (_, i) => ({ name: `p${i}`, radius: MAX_PLANET_RADIUS, extent })))
    const outer = rings[rings.length - 1]
    expect(outer.a * (1 + outer.e) + outer.maxRadius).toBeLessThan(REACH_LIMIT)
  })

  it('orbitPath desenha a elipse: periélio a(1−e) e afélio a(1+e), em qualquer instante da precessão', () => {
    const r = ring({ e: 0.2, inclination: 0.24, apsidalRate: 0.05 })
    for (const t of [0, 13, 70]) {
      const radii = orbitPath(r, t).map(len)
      expect(Math.min(...radii)).toBeCloseTo(r.a * (1 - r.e), 6)
      expect(Math.max(...radii)).toBeCloseTo(r.a * (1 + r.e), 6)
    }
  })

  const maxWithMoons = bodyExtent(MAX_PLANET_RADIUS, MAX_MOONS)
  it.each([
    ['raios mistos, sem luas', (i: number) => (i % 2 ? MAX_PLANET_RADIUS : MIN_PLANET_RADIUS), (r: number) => r],
    ['todos máximos, sem luas', () => MAX_PLANET_RADIUS, (r: number) => r],
    ['todos máximos com 6 luas', () => MAX_PLANET_RADIUS, () => maxWithMoons],
  ])('nenhuma colisão ao longo de um período do anel externo (%s)', (_, radiusOf, extentOf) => {
    const planets = Array.from({ length: 40 }, (_, i) => ({ name: `p${i}`, radius: radiusOf(i), extent: extentOf(radiusOf(i)) }))
    const { rings, orbits } = buildOrbits(planets)
    const outer = rings[rings.length - 1]
    // Menor folga, com o alcance de cada corpo (planeta + luas): nenhuma lua chega a SUN_RADIUS do centro do sol,
    // e as esferas de alcance de dois corpos nunca se cruzam. Um expect só no fim.
    // Inclinações diferentes não importam: o espaçamento compara só distâncias ao sol.
    // Passo fino o bastante para ~40 amostras por volta do anel interno (o externo é ~50× mais lento).
    const STEPS = 2000
    let sunGap = Infinity
    let pairGap = Infinity
    for (let s = 0; s < STEPS; s++) {
      const t = (s / STEPS) * outer.period
      const pos = orbits.map((o) => planetPosition(rings[o.ring], o, t))
      for (let i = 0; i < orbits.length; i++) {
        sunGap = Math.min(sunGap, len(pos[i]) - SUN_RADIUS - orbits[i].extent)
        for (let j = i + 1; j < orbits.length; j++) {
          pairGap = Math.min(pairGap, dist(pos[i], pos[j]) - orbits[i].extent - orbits[j].extent)
        }
      }
    }
    expect(sunGap).toBeGreaterThan(0)
    expect(pairGap).toBeGreaterThan(0)
  })
})
