import { describe, expect, it } from 'vitest'
import { barycenterOffset, MAX_WOBBLE } from './barycenter'
import {
  buildComets,
  COMET_MAX_E,
  COMET_MIN_E,
  cometPosition,
  cometVelocity,
  daysAgoLabel,
  MAX_COMETS,
  recentActivity,
  TAIL_MAX,
  tailDirections,
  tailLength,
} from './comets'
import { buildOrbits, solveKepler, SUN_RADIUS, type OrbitSystem, type Vec3 } from './orbits'
import { bodyExtent, MAX_MOONS, MAX_PLANET_RADIUS } from './planets'

const DEG = Math.PI / 180
const NOW = new Date('2026-10-08T18:00:00Z')
const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const daysBefore = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

const repo = (name: string, pushedDays: number, commitDays: number | null = null) => ({
  name,
  pushedAt: daysBefore(pushedDays),
  lastCommit: commitDays === null ? null : { date: daysBefore(commitDays), message: 'x' },
})

describe('solveKepler com excentricidade alta (cometas)', () => {
  it.each([0.85, 0.9, 0.92, 0.95])('e = %s: resolve M = E − e·sin E até o arredondamento (1e-12), inclusive perto do periélio', (e) => {
    const Ms = [0, 1e-6, -1e-6, 0.001, 0.01, 0.05, 0.2, 1, 2.5, Math.PI, -Math.PI, -0.03, 7.3, -20.1, 1000.5]
    for (let M = -Math.PI; M <= Math.PI; M += 0.0007) Ms.push(M)
    for (const M of Ms) {
      const E = solveKepler(M, e)
      expect(Math.abs(E - e * Math.sin(E) - M)).toBeLessThan(1e-12)
    }
  })
})

describe('recentActivity', () => {
  it('repos com push ou commit nos últimos 7 dias, no máximo 3, do mais recente para o mais antigo', () => {
    const repos = [
      repo('velho', 30),
      repo('ontem', 1),
      repo('hoje', 0.2),
      repo('commit-recente', 40, 2),
      repo('seis', 6),
      repo('oito', 8),
    ]
    const recent = recentActivity(repos, NOW)
    expect(MAX_COMETS).toBe(3)
    expect(recent.map((r) => repos[r.index].name)).toEqual(['hoje', 'ontem', 'commit-recente'])
    expect(recent.map((r) => r.daysAgo)).toEqual([0, 1, 2])
    expect(recentActivity([repo('a', 7.5), repo('b', 10)], NOW)).toEqual([])
  })

  it('data inválida ou no futuro não quebra', () => {
    const recent = recentActivity([{ name: 'x', pushedAt: 'nada', lastCommit: null }, repo('futuro', -1)], NOW)
    expect(recent).toHaveLength(1)
    expect(recent[0].daysAgo).toBe(0)
  })

  it('rótulo em português: hoje, há 1 dia, há N dias', () => {
    expect(daysAgoLabel(0)).toBe('hoje')
    expect(daysAgoLabel(1)).toBe('há 1 dia')
    expect(daysAgoLabel(5)).toBe('há 5 dias')
  })
})

const sample = buildOrbits(
  [3, 2.67, 2.34, 2.16, 1.72, 1.61, 1.43, 1.3, 1.15, 0.97, 0.86, 0.68, 0.59, 0.45].map((radius, i) => ({
    name: `p${i}`,
    radius,
    extent: bodyExtent(radius, 1 + (i % 4)),
    trojans: i < 11,
  })),
)
const worst = buildOrbits(
  Array.from({ length: 40 }, (_, i) => ({ name: `p${i}`, radius: MAX_PLANET_RADIUS, extent: bodyExtent(MAX_PLANET_RADIUS, MAX_MOONS), trojans: true })),
)
const tiny = buildOrbits([{ name: 'p0', radius: 1 }])
const recentRepos = (n: number) => Array.from({ length: n }, (_, i) => repo(`p${i}`, i * 0.5))

describe('buildComets', () => {
  it.each([
    ['amostra', sample],
    ['pior caso (40 máximos)', worst],
    ['um planeta só', tiny],
  ] as [string, OrbitSystem][])('%s: órbita muito excêntrica e inclinada, periélio fora do sol, afélio além do anel externo', (_, system) => {
    const comets = buildComets(system, recentRepos(Math.min(5, system.orbits.length)), NOW)
    expect(comets.length).toBe(Math.min(MAX_COMETS, system.orbits.length))
    const outer = system.rings[system.rings.length - 1]
    const reach = outer.a * (1 + outer.e) + outer.maxRadius
    for (const c of comets) {
      expect(c.e).toBeGreaterThanOrEqual(COMET_MIN_E)
      expect(c.e).toBeLessThanOrEqual(COMET_MAX_E)
      expect(COMET_MIN_E).toBeGreaterThanOrEqual(0.85)
      expect(COMET_MAX_E).toBeLessThanOrEqual(0.92)
      expect(Math.abs(c.inclination)).toBeGreaterThanOrEqual(20 * DEG)
      expect(Math.abs(c.inclination)).toBeLessThanOrEqual(50 * DEG)
      expect(c.a * (1 + c.e)).toBeGreaterThan(reach)
      // 3ª lei, na mesma escala dos anéis
      expect(c.period / system.rings[0].period).toBeCloseTo(Math.pow(c.a / system.rings[0].a, 1.5), 9)
    }
    // periélio logo fora do raio seguro na amostra (com as luas em ressonância o sistema cresce e, com e ≤ 0,92, o
    // periélio sai um pouco: até ~7,1)
    if (system === sample) for (const c of comets) expect(c.a * (1 - c.e)).toBeLessThan(SUN_RADIUS + 5)
  })

  it.each([
    ['amostra', sample],
    ['pior caso (40 máximos)', worst],
    ['um planeta só', tiny],
  ] as [string, OrbitSystem][])('%s: nunca chega a SUN_RADIUS + 1 do sol (que bamboleia), numa volta inteira (menor folga)', (_, system) => {
    const comets = buildComets(system, recentRepos(3), NOW)
    let gap = Infinity
    const p: Vec3 = [0, 0, 0]
    const sun: Vec3 = [0, 0, 0]
    for (const c of comets) {
      // amostra em anomalia excêntrica (passo uniforme no espaço, denso no periélio, onde o cometa voa)
      const STEPS = 3000
      for (let s = 0; s < STEPS; s++) {
        const E = (s / STEPS) * 2 * Math.PI
        const t = ((E - c.e * Math.sin(E) - c.phase) / (2 * Math.PI)) * c.period
        cometPosition(c, t, p)
        barycenterOffset(system, t, sun)
        gap = Math.min(gap, len(sub(p, sun)) - c.nucleus - SUN_RADIUS - 1)
      }
    }
    expect(gap).toBeGreaterThan(0)
    expect(MAX_WOBBLE).toBeLessThan(1)
  })

  it('o primeiro cometa chega ao periélio logo depois do início (aparece na abertura)', () => {
    const [c] = buildComets(sample, recentRepos(1), NOW)
    const p: Vec3 = [0, 0, 0]
    let first = Infinity
    for (let t = 0; t < c.period; t += 0.05) {
      if (len(cometPosition(c, t, p)) < c.a * (1 - c.e) * 1.05) {
        first = t
        break
      }
    }
    expect(first).toBeLessThan(30)
  })

  it('2ª lei de Kepler: rápido no periélio, lento no afélio (v_p / v_a = (1+e)/(1−e))', () => {
    const [c] = buildComets(sample, recentRepos(1), NOW)
    const v: Vec3 = [0, 0, 0]
    const p: Vec3 = [0, 0, 0]
    // tempos do periélio e do afélio a partir da fase (anomalia média 0 e π)
    const tPeri = ((((-c.phase / (2 * Math.PI)) % 1) + 1) % 1) * c.period
    const tAph = tPeri + c.period / 2
    const vp = len(cometVelocity(c, tPeri, v))
    const va = len(cometVelocity(c, tAph, v))
    expect(len(cometPosition(c, tPeri, p))).toBeCloseTo(c.a * (1 - c.e), 6)
    expect(vp / va).toBeCloseTo((1 + c.e) / (1 - c.e), 3)
    // velocidade analítica bate com a diferença finita
    const t = 3.7
    const h = 1e-4
    const p1 = cometPosition(c, t + h, [0, 0, 0])
    const p0 = cometPosition(c, t - h, [0, 0, 0])
    const fd = sub(p1, p0).map((x) => x / (2 * h)) as Vec3
    expect(len(sub(cometVelocity(c, t, v), fd))).toBeLessThan(1e-4 * len(fd))
  })
})

describe('cauda', () => {
  const [c] = buildComets(sample, recentRepos(1), NOW)
  const q = c.a * (1 - c.e)

  it('cresce perto do periélio, ∝ 1/r²', () => {
    expect(tailLength(c, q)).toBeCloseTo(TAIL_MAX, 12)
    expect(tailLength(c, 2 * q)).toBeCloseTo(TAIL_MAX / 4, 12)
    expect(tailLength(c, 10 * q)).toBeCloseTo(TAIL_MAX / 100, 12)
  })

  it('aponta para longe do sol (íons, reta) e a de poeira se curva para trás da velocidade', () => {
    const sun: Vec3 = [0.3, 0.1, -0.2]
    const ion: Vec3 = [0, 0, 0]
    const dust: Vec3 = [0, 0, 0]
    const p: Vec3 = [0, 0, 0]
    const v: Vec3 = [0, 0, 0]
    for (const t of [0, 5, 40, 200]) {
      cometPosition(c, t, p)
      cometVelocity(c, t, v)
      tailDirections(p, sun, v, ion, dust)
      const away = sub(p, sun)
      expect(len(ion)).toBeCloseTo(1, 12)
      expect(len(dust)).toBeCloseTo(1, 12)
      expect(dot(ion, away) / len(away)).toBeCloseTo(1, 12)
      expect(dot(dust, away)).toBeGreaterThan(0.8 * len(away))
      // a poeira fica para trás: menos alinhada com a velocidade que a cauda de íons
      expect(dot(dust, v)).toBeLessThan(dot(ion, v))
    }
  })
})
