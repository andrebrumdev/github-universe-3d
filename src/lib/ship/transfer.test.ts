import { describe, expect, it } from 'vitest'
import { planetMass } from '../universe/barycenter'
import { advanceClock } from '../universe/clock'
import { buildOrbits, planetPosition, type Vec3 } from '../universe/orbits'
import { ARRIVAL_TAIL } from './burn'
import {
  ASSIST_MIN_RADIUS,
  BLEND_SECONDS,
  BRAKE_SECONDS,
  BURN_FRACTION,
  burnPhase,
  clockTimeAfter,
  flybyDeflection,
  FLYBY_MARGIN,
  MAX_LIFT,
  MU_PER_MASS,
  OBSTACLE_MARGIN,
  PEAK_SPEED_RATIO,
  planTransfer,
  planTransferTo,
  travelBodies,
  type TravelBody,
} from './transfer'
import { MAX_TRAVEL_SECONDS, MIN_TRAVEL_SECONDS, SUN_SAFE_DISTANCE, travelTangent, type TravelPath } from './travel'
import { add, cross, dot, length, normalize, scale, sub } from './vec'

const ring = (r: number, angle: number, y = 0): Vec3 => [Math.cos(angle) * r, y, -Math.sin(angle) * r]
const dist = (a: Vec3, b: Vec3) => length(sub(a, b))
const ORIGIN: Vec3 = [0, 0, 0]

function samples(path: TravelPath, n = 600): { t: number; p: Vec3; v: Vec3 }[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = (i / n) * path.duration
    return { t, p: path.point(t), v: path.velocity(t) }
  })
}

const minDistance = (path: TravelPath, center: Vec3) => Math.min(...samples(path).map((s) => dist(s.p, center)))

function finiteVelocity(path: TravelPath, t: number, h = 1e-5): Vec3 {
  return scale(sub(path.point(t + h), path.point(t - h)), 1 / (2 * h))
}

function expectVelocityMatchesFiniteDifferences(path: TravelPath) {
  for (let i = 1; i < 60; i++) {
    const t = (i / 60) * path.duration
    const numeric = finiteVelocity(path, t)
    expect(length(sub(path.velocity(t), numeric))).toBeLessThan(2e-3 * Math.max(1, length(numeric)))
  }
}

/** Sem salto de posição nem de velocidade: passos pequenos andam pouco e a velocidade varia pouco. */
function expectContinuous(path: TravelPath) {
  const n = 4000
  const h = path.duration / n
  let maxSpeed = 0
  for (const s of samples(path, 200)) maxSpeed = Math.max(maxSpeed, length(s.v))
  let prevP = path.point(0)
  let prevV = path.velocity(0)
  for (let i = 1; i <= n; i++) {
    const p = path.point(i * h)
    const v = path.velocity(i * h)
    expect(dist(p, prevP)).toBeLessThan(maxSpeed * h * 1.5 + 1e-9)
    expect(length(sub(v, prevV))).toBeLessThan(0.05 * maxSpeed + 1e-9)
    prevP = p
    prevV = v
  }
}

const tripCases: [string, Vec3, Vec3][] = [
  ['de dentro para fora', ring(12, 0.3, 0.5), ring(45, 0.3 + Math.PI * 0.9, -2)],
  ['de fora para dentro', ring(60, 2, 4), ring(14, 3.1, -1)],
  ['mesma órbita, perto', ring(15, 1, 0.2), ring(15, 1.2, 0.4)],
  ['mesma órbita, coladinho', ring(15, 1, 0.2), ring(15, 1.01, 0.25)],
  ['lados opostos do sol', ring(8, 0), ring(8, Math.PI)],
  ['mesma órbita, lados opostos (r = 10)', ring(10, 0), ring(10, Math.PI)],
  ['de dentro para fora, varredura curta', ring(6, 0.4), ring(30, 0.4 + Math.PI / 6)],
  ['de fora para dentro, varredura curta', ring(30, 0.4), ring(6, 0.4 + Math.PI / 6)],
  ['varredura longa (mais de 180°)', ring(15, 0), ring(40, 1.15 * Math.PI)],
  ['lados opostos, raios diferentes', ring(6, 0.3, 0.5), ring(40, 0.3 + Math.PI)],
  ['alvo logo atrás na órbita', ring(20, 1), ring(20, 0.7)],
  ['da câmera, lá em cima', [0, 40, 70], ring(15, 1.2)],
  ['do lado do sol para fora', ring(5.5, 2, 1.6), ring(30, 2.5)],
]

describe('transferência de Hohmann', () => {
  it('começa na origem e termina no destino', () => {
    for (const [, from, to] of tripCases) {
      const path = planTransfer(from, to)
      expect(dist(path.point(0), from)).toBeLessThan(1e-9)
      expect(dist(path.point(path.duration), to)).toBeLessThan(1e-9)
    }
  })

  it('nunca chega mais perto do sol que o raio seguro (com o sol fora da origem também)', () => {
    const sun: Vec3 = [0.4, -0.1, 0.3]
    for (const [, from, to] of tripCases) {
      expect(minDistance(planTransfer(from, to), ORIGIN)).toBeGreaterThanOrEqual(SUN_SAFE_DISTANCE)
      expect(minDistance(planTransfer(from, to, { sun }), sun)).toBeGreaterThanOrEqual(SUN_SAFE_DISTANCE)
    }
  })

  it('posição e velocidade contínuas; a velocidade analítica confere com diferenças finitas', () => {
    for (const [, from, to] of tripCases) {
      const path = planTransfer(from, to)
      expectContinuous(path)
      expectVelocityMatchesFiniteDifferences(path)
    }
  })

  it('parte e chega parada (queimas nas pontas); fora do trajeto, velocidade zero', () => {
    const path = planTransfer(ring(12, 0), ring(40, 2.5))
    expect(length(path.velocity(0))).toBeLessThan(1e-9)
    expect(length(path.velocity(path.duration))).toBeLessThan(1e-9)
    expect(length(path.velocity(-1))).toBe(0)
    expect(length(path.velocity(path.duration * 50))).toBe(0)
    // a queima é curta: logo depois dela a nave já está em cruzeiro
    const cruise = length(path.velocity(path.duration * 0.5))
    expect(length(path.velocity(path.duration * BURN_FRACTION * 1.2))).toBeGreaterThan(0.3 * cruise)
  })

  it('duração dentro dos limites e altura limitada', () => {
    for (const [, from, to] of tripCases) {
      const path = planTransfer(from, to)
      expect(path.duration).toBeGreaterThanOrEqual(MIN_TRAVEL_SECONDS)
      expect(path.duration).toBeLessThanOrEqual(MAX_TRAVEL_SECONDS)
      const peak = Math.max(...samples(path).map((s) => s.p[1]))
      const floor = Math.min(...samples(path).map((s) => s.p[1]))
      expect(peak).toBeLessThanOrEqual(Math.max(from[1], to[1]) + MAX_LIFT + 2)
      expect(floor).toBeGreaterThanOrEqual(Math.min(from[1], to[1]) - 2)
    }
  })

  it('sobe acima do plano das órbitas', () => {
    const path = planTransfer(ring(10, 0), ring(10, 1.5))
    expect(path.point(path.duration / 2)[1]).toBeGreaterThan(1)
  })

  it('meia elipse de Hohmann: varre ~180° no sentido das órbitas, tangente às órbitas nas pontas', () => {
    const from = ring(12, 0)
    const to = ring(48, Math.PI)
    const path = planTransfer(from, to)
    // sentido das órbitas: momento angular para +y em todo o trajeto
    for (const s of samples(path, 100).slice(1, -1)) expect(cross(s.p, s.v)[1]).toBeGreaterThan(0)
    // a meio caminho no ângulo, o raio está entre os dois (passou pelo outro lado do sol)
    const mid = samples(path, 200).find((s) => Math.abs(Math.atan2(-s.p[2], s.p[0]) - Math.PI / 2) < 0.03)
    expect(mid).toBeDefined()
    // tangente às órbitas: na saída e na chegada a direção é perpendicular ao raio (no plano)
    for (const t of [path.duration * 0.002, path.duration * 0.998]) {
      const dir = travelTangent(path, t)
      const radial = normalize(path.point(t))
      expect(Math.abs(dot([dir[0], 0, dir[2]], [radial[0], 0, radial[2]]))).toBeLessThan(0.05)
    }
  })

  it('2ª lei de Kepler amaciada: arranco perto do sol, com teto (pico ≤ PEAK_SPEED_RATIO × a média)', () => {
    const path = planTransfer(ring(12, 0), ring(48, Math.PI))
    const near = path.velocity(path.duration * 0.3)
    const far = path.velocity(path.duration * 0.7)
    expect(length(near)).toBeGreaterThan(1.2 * length(far))
    let surge = 0
    for (const [, from, to] of tripCases) {
      const p = planTransfer(from, to)
      const speeds = samples(p).map((s) => length(s.v))
      const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length
      expect(Math.max(...speeds)).toBeLessThanOrEqual(PEAK_SPEED_RATIO * mean)
      surge = Math.max(surge, Math.max(...speeds) / mean)
    }
    // e o pico se vê: perto do sol a nave dá um arranco de verdade
    expect(surge).toBeGreaterThan(1.8)
  })

  it('duração cresce com o comprimento do caminho', () => {
    const short = planTransfer(ring(15, 0), ring(15, 0.6))
    const mid = planTransfer(ring(15, 0), ring(41, 1.5))
    const long = planTransfer(ring(15, 0), ring(72, 2.6))
    expect(mid.duration).toBeGreaterThan(short.duration)
    expect(long.duration).toBeGreaterThan(mid.duration)
  })

  it('alvo logo atrás na mesma órbita: vai pelo caminho curto (sem dar a volta no sol)', () => {
    const path = planTransfer(ring(20, 1), ring(20, 0.7))
    const len = samples(path, 200).reduce((acc, s, i, all) => (i ? acc + dist(s.p, all[i - 1].p) : 0), 0)
    expect(len).toBeLessThan(20)
  })

  it('saída de dentro do raio seguro é empurrada para fora (no centro exato, para cima)', () => {
    const start = planTransfer([0, 0, 0], ring(10, 1)).point(0)
    expect(Math.abs(start[0])).toBeLessThan(1e-12)
    expect(start[1]).toBeGreaterThan(SUN_SAFE_DISTANCE)
    expect(Math.abs(start[2])).toBeLessThan(1e-12)
  })
})

/** Gerador com semente (mulberry32): os mesmos sorteios a cada execução. */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Perfil radial do caminho fora de [skipFrom, skipTo] (s): distância ao sol e ângulo varrido (desenrolado).
 * Uma órbita em volta do sol nunca se curva para longe dele: com u = 1/r, u'' + u ≥ 0 (em função do ângulo).
 */
function radialProfile(path: TravelPath, sun: Vec3 = ORIGIN, skipFrom = Infinity, skipTo = -Infinity, n = 1200) {
  const r: number[] = []
  const theta: number[] = []
  let prev = 0
  let unwrapped = 0
  /** Primeiro ponto depois da janela pulada: a curvatura não é medida através do buraco. */
  let gap = -1
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * path.duration
    if (t >= skipFrom && t <= skipTo) {
      if (gap < 0) gap = r.length
      continue
    }
    const p = sub(path.point(t), sun)
    const phi = Math.atan2(-p[2], p[0])
    if (r.length) unwrapped += Math.atan2(Math.sin(phi - prev), Math.cos(phi - prev))
    prev = phi
    r.push(length(p))
    theta.push(Math.abs(unwrapped))
  }
  let minCurvature = Infinity
  for (let i = 1; i < r.length - 1; i++) {
    if (gap >= 0 && i - 1 < gap && gap <= i + 1) continue
    const h0 = theta[i] - theta[i - 1]
    const h1 = theta[i + 1] - theta[i]
    if (h0 < 1e-3 || h1 < 1e-3) continue
    const u0 = 1 / r[i - 1]
    const u1 = 1 / r[i]
    const u2 = 1 / r[i + 1]
    const upp = (2 * ((u2 - u1) / h1 - (u1 - u0) / h0)) / (h0 + h1)
    minCurvature = Math.min(minCurvature, (upp + u1) * r[i])
  }
  return { r, minCurvature }
}

describe('órbitas de verdade: nunca se curvam para longe do sol', () => {
  const rnd = seeded(20261009)
  const trips = Array.from({ length: 300 }, () => {
    const r1 = 5 + rnd() * 75
    const r2 = 5 + rnd() * 75
    const a1 = rnd() * 2 * Math.PI
    return [ring(r1, a1, (rnd() - 0.5) * 6), ring(r2, a1 + rnd() * 2 * Math.PI, (rnd() - 0.5) * 6)] as [Vec3, Vec3]
  })
  const named: [Vec3, Vec3][] = [
    [ring(6, 0), ring(30, Math.PI / 6)],
    [ring(6, 0), ring(30, Math.PI / 3)],
    [ring(30, 0), ring(6, Math.PI / 6)],
    [ring(12, 0), ring(20, Math.PI / 6)],
  ]

  it('distância ao sol monótona: sem máximo no meio indo para fora, sem mínimo no meio indo para dentro', () => {
    for (const [from, to] of [...named, ...trips]) {
      const { r } = radialProfile(planTransfer(from, to))
      const outward = length(to) >= length(from)
      for (let i = 1; i < r.length; i++) {
        const step = r[i] - r[i - 1]
        expect(outward ? step : -step).toBeGreaterThanOrEqual(-1e-9 * r[i])
      }
    }
  }, 30_000)

  it('curvatura sempre para o lado do sol (u″ + u ≥ 0), sem S', () => {
    for (const [from, to] of [...named, ...trips]) {
      const { minCurvature } = radialProfile(planTransfer(from, to))
      expect(minCurvature).toBeGreaterThan(-1e-4)
    }
  }, 30_000)

  it('com planetas no caminho, vale o mesmo fora da janela do estilingue', () => {
    const giants: TravelBody[] = Array.from({ length: 10 }, (_, i) => ({ name: `g${i}`, position: ring(12 + i * 6, i * 2.1, 0.5), radius: 2.5, extent: 4 }))
    let assists = 0
    for (const [from, to] of trips.slice(0, 120)) {
      const path = planTransfer(from, to, { bodies: giants })
      const a = path.assist
      if (a) assists++
      const skipFrom = a ? a.start - 0.6 : Infinity
      const skipTo = a ? a.end + 0.6 : -Infinity
      expect(radialProfile(path, ORIGIN, skipFrom, skipTo).minCurvature).toBeGreaterThan(-1e-4)
    }
    expect(assists).toBeGreaterThan(0)
  }, 30_000)
})

describe('lados opostos do sol: transferência simples, sem estilingue', () => {
  const cases: [string, Vec3, Vec3][] = [
    ['mesma órbita, r = 9', ring(9, 0.3), ring(9, 0.3 + Math.PI)],
    ['mesma órbita, r = 10', ring(10, 1), ring(10, 1 + Math.PI)],
    ['mesma órbita, r = 14', ring(14, 2), ring(14, 2 + Math.PI)],
    ['10 → 20', ring(10, 0.5), ring(20, 0.5 + Math.PI)],
    ['14 → 18', ring(14, 4), ring(18, 4 + Math.PI)],
  ]
  it('meia elipse de Hohmann: sem flag, sem mergulho, tangente às duas órbitas', () => {
    for (const [, from, to] of cases) {
      const path = planTransfer(from, to)
      expect(path.assist).toBeNull()
      // não mergulha em direção ao sol: nunca abaixo da órbita de dentro
      expect(minDistance(path, ORIGIN)).toBeGreaterThanOrEqual(Math.min(length(from), length(to)) - 1e-6)
      for (const t of [path.duration * 0.002, path.duration * 0.998]) {
        const dir = travelTangent(path, t)
        const radial = normalize(path.point(t))
        expect(Math.abs(dot([dir[0], 0, dir[2]], [radial[0], 0, radial[2]]))).toBeLessThan(0.05)
      }
    }
  })
})

describe('troca de destino no meio do voo', () => {
  const first = planTransfer(ring(12, 0), ring(45, 2.6))
  const t = first.duration * 0.45
  const here = first.point(t)
  const v0 = first.velocity(t)
  const second = planTransfer(here, ring(20, 4.2), { velocity: v0 })

  it('parte do ponto atual com a velocidade atual (sem quina)', () => {
    expect(dist(second.point(0), here)).toBeLessThan(1e-9)
    expect(length(sub(second.velocity(0), v0))).toBeLessThan(1e-6 * length(v0))
    expect(length(sub(travelTangent(second, 0), normalize(v0)))).toBeLessThan(1e-6)
  })

  it('continua seguro, contínuo e coerente', () => {
    expect(minDistance(second, ORIGIN)).toBeGreaterThanOrEqual(SUN_SAFE_DISTANCE)
    expectContinuous(second)
    expectVelocityMatchesFiniteDifferences(second)
    expect(length(second.velocity(second.duration))).toBeLessThan(1e-9)
  })

  it('mesmo indo direto para o sol, não entra no raio seguro', () => {
    const towardSun = scale(normalize(sub(ORIGIN, here)), 60)
    const path = planTransfer(ring(7, 1), ring(30, 1 + Math.PI), { velocity: towardSun })
    expect(minDistance(path, ORIGIN)).toBeGreaterThanOrEqual(SUN_SAFE_DISTANCE)
  })
})

describe('planeta no caminho', () => {
  it('o arco direto sobe por cima dele (sem estilingue)', () => {
    const from = ring(12, 0)
    const to = ring(60, Math.PI)
    const direct = planTransfer(from, to)
    const small: TravelBody = { name: 'pequeno', position: direct.point(direct.duration * 0.5), radius: 1.5, extent: 2.5 }
    expect(minDistance(direct, small.position)).toBeLessThan(small.radius)
    const path = planTransfer(from, to, { bodies: [small] })
    expect(minDistance(path, small.position)).toBeGreaterThanOrEqual(small.radius + OBSTACLE_MARGIN)
    expect(dist(path.point(path.duration), to)).toBeLessThan(1e-9)
    expect(minDistance(path, ORIGIN)).toBeGreaterThanOrEqual(SUN_SAFE_DISTANCE)
  })
})

describe('estilingue gravitacional', () => {
  it('deflexão cresce com a massa e cai com a distância', () => {
    const mu = (r: number) => MU_PER_MASS * planetMass(r)
    expect(flybyDeflection(6, 20, mu(3))).toBeGreaterThan(flybyDeflection(6, 20, mu(2)))
    expect(flybyDeflection(6, 20, mu(3))).toBeGreaterThan(flybyDeflection(9, 20, mu(3)))
    expect(flybyDeflection(6, 20, mu(3))).toBeCloseTo(2 * Math.asin(1 / (1 + (6 * 400) / mu(3))))
  })

  describe('por um planeta grande no caminho', () => {
    const from = ring(12, 0)
    const to = ring(60, Math.PI)
    const direct = planTransfer(from, to)
    // planeta grande bem em cima do caminho direto (no meio dele)
    const giant: TravelBody = { name: 'gigante', position: direct.point(direct.duration * 0.5), radius: 2.8, extent: 4.5 }
    const path = planTransfer(from, to, { bodies: [giant] })

    it('contorna o planeta numa hipérbole sem encostar nele', () => {
      expect(direct.assist).toBeNull()
      expect(minDistance(direct, giant.position)).toBeLessThan(giant.extent)
      expect(path.assist?.body).toBe('gigante')
      expect(path.assist!.periapsis).toBeGreaterThanOrEqual(giant.extent + FLYBY_MARGIN - 1e-9)
      expect(minDistance(path, giant.position)).toBeGreaterThanOrEqual(giant.extent + FLYBY_MARGIN / 2)
      expect(path.assist!.deflection).toBeGreaterThan(0.1)
    })

    it('acelera no periápside', () => {
      const { start, peak, end } = path.assist!
      expect(start).toBeLessThan(peak)
      expect(peak).toBeLessThan(end)
      expect(length(path.velocity(peak))).toBeGreaterThan(1.1 * length(path.velocity(start)))
    })

    it('trechos costurados com C1, seguro do sol, pontas certas', () => {
      expect(dist(path.point(0), from)).toBeLessThan(1e-9)
      expect(dist(path.point(path.duration), to)).toBeLessThan(1e-9)
      for (const t of [path.assist!.start, path.assist!.end]) {
        expect(dist(path.point(t - 1e-7), path.point(t + 1e-7))).toBeLessThan(1e-4)
        expect(length(sub(path.velocity(t - 1e-9), path.velocity(t + 1e-9)))).toBeLessThan(1e-4 * length(path.velocity(t)))
      }
      expect(minDistance(path, ORIGIN)).toBeGreaterThanOrEqual(SUN_SAFE_DISTANCE)
      expectContinuous(path)
      expectVelocityMatchesFiniteDifferences(path)
      expect(path.duration).toBeLessThanOrEqual(MAX_TRAVEL_SECONDS)
    })

    it('só um por viagem e só com planeta grande, nunca o próprio destino', () => {
      const small = { ...giant, name: 'pequeno', radius: ASSIST_MIN_RADIUS - 0.1 }
      expect(planTransfer(from, to, { bodies: [small] }).assist).toBeNull()
      expect(planTransfer(from, to, { bodies: [giant], exclude: 'gigante' }).assist).toBeNull()
      const twin = { ...giant, name: 'gêmeo', position: direct.point(direct.duration * 0.3) }
      expect(planTransfer(from, to, { bodies: [giant, twin] }).assist).not.toBeNull()
    })

    it('planeta grande que passa perto (sem raspar) também dá estilingue, com periápside na distância de passagem', () => {
      const t = direct.duration * 0.5
      const at = direct.point(t)
      const across = normalize(cross(direct.velocity(t), [0, 1, 0]))
      const near: TravelBody = { ...giant, name: 'vizinho', position: add(at, scale(across, 2 * giant.extent)) }
      const path = planTransfer(from, to, { bodies: [near] })
      expect(path.assist?.body).toBe('vizinho')
      expect(path.assist!.periapsis).toBeGreaterThan(giant.extent + FLYBY_MARGIN)
      expect(path.assist!.periapsis).toBeLessThanOrEqual(2 * giant.extent * 1.01) // distância de passagem amostrada
      expect(minDistance(path, near.position)).toBeGreaterThanOrEqual(giant.extent + FLYBY_MARGIN / 2)
      expectContinuous(path)
      expectVelocityMatchesFiniteDifferences(path)
    })

    it('deflexão pela física: mesmo caminho, planeta mais massivo curva mais', () => {
      const light = planTransfer(from, to, { bodies: [{ ...giant, radius: 2.1 }] }).assist!
      const heavy = planTransfer(from, to, { bodies: [{ ...giant, radius: 3 }] }).assist!
      expect(heavy.deflection).toBeGreaterThan(light.deflection)
      expect(light.periapsis).toBeCloseTo(heavy.periapsis)
    })

    it('planeta longe do caminho não desvia nada', () => {
      const far = { ...giant, position: [0, 0, 80] as Vec3 }
      expect(planTransfer(from, to, { bodies: [far] }).assist).toBeNull()
    })
  })
})

describe('chegada prevista', () => {
  it('clockTimeAfter segue o relógio desacelerando até parar', () => {
    let clock = { time: 10, scale: 1 }
    for (let i = 0; i < 120; i++) clock = advanceClock(clock, 1 / 60, 0)
    // o relógio discreto soma pela direita (e trava em 1e-3): fica um pouco abaixo da integral contínua
    expect(clockTimeAfter({ time: 10, scale: 1 }, 2)).toBeCloseTo(clock.time, 1)
    expect(clockTimeAfter({ time: 10, scale: 0 }, 2)).toBe(10)
  })

  it('o destino é o do instante de chegada (iterado com a duração)', () => {
    const at = (seconds: number) => ring(30, 1 + seconds * 0.2)
    const path = planTransferTo(ring(12, 0), at)
    expect(dist(path.point(path.duration), at(path.duration))).toBeLessThan(0.02)
  })

  it('travelBodies lista os planetas na posição do instante', () => {
    const system = buildOrbits([
      { name: 'grande', radius: 2.5 },
      { name: 'pequeno', radius: 1 },
    ])
    const bodies = travelBodies(system, 7)
    expect(bodies.map((b) => b.name)).toEqual(['grande', 'pequeno'])
    expect(bodies[0].position).toEqual(planetPosition(system.rings[0], system.orbits[0], 7))
  })
})

describe('queimas: motor ligado só nas pontas, planagem no meio', () => {
  const phases = (path: TravelPath, n = 400) => Array.from({ length: n + 1 }, (_, i) => ({ t: (i / n) * path.duration, ...burnPhase(path, (i / n) * path.duration) }))

  it('partida parada: queima forte, chama-piloto no meio, chegada freando com o puff de ré', () => {
    for (const [, from, to] of tripCases) {
      const path = planTransfer(from, to)
      const T = path.duration
      expect(path.burns.departure).toBeCloseTo(BURN_FRACTION * T, 9)
      // a janela da frenagem: o puff de ré (BRAKE_SECONDS, no máximo 30% da viagem)
      expect(T - path.burns.arrival).toBeCloseTo(Math.min(BRAKE_SECONDS, 0.3 * T), 9)
      expect(path.burns.puffs.length).toBe(1)
      expect(path.burns.puffs[0].time).toBeCloseTo(path.burns.arrival, 9)
      expect(burnPhase(path, 0)).toEqual({ phase: 'departure', intensity: 1 })
      expect(burnPhase(path, 0.3 * path.burns.departure).intensity).toBe(1)
      expect(burnPhase(path, T / 2)).toEqual({ phase: 'coast', intensity: 0 })
      // na frenagem o motor principal fica na chama-piloto
      expect(burnPhase(path, (path.burns.arrival + T) / 2)).toEqual({ phase: 'arrival', intensity: 0 })
      // a chegada termina no nível de quem fica parado (sem estalo na troca para a visita)
      expect(burnPhase(path, T)).toEqual({ phase: 'arrival', intensity: ARRIVAL_TAIL })
    }
  })

  it('sequência partida → planagem → chegada, intensidade em 0..1 e contínua', () => {
    for (const [, from, to] of tripCases) {
      const path = planTransfer(from, to)
      const list = phases(path)
      const order = ['departure', 'coast', 'arrival']
      for (let i = 1; i < list.length; i++) {
        expect(order.indexOf(list[i].phase)).toBeGreaterThanOrEqual(order.indexOf(list[i - 1].phase))
        expect(Math.abs(list[i].intensity - list[i - 1].intensity)).toBeLessThan(0.1)
      }
      for (const p of list) {
        expect(p.intensity).toBeGreaterThanOrEqual(0)
        expect(p.intensity).toBeLessThanOrEqual(1)
        if (p.phase === 'coast') expect(p.intensity).toBe(0)
      }
    }
  })

  it('a queima acelera e a planagem não: a velocidade só muda muito dentro das queimas', () => {
    const path = planTransfer(ring(12, 0), ring(40, 2.5))
    const { departure, arrival } = path.burns
    expect(length(path.velocity(0))).toBeLessThan(1e-9)
    expect(length(path.velocity(departure))).toBeGreaterThan(0.5 * length(path.velocity(path.duration / 2)))
    expect(length(path.velocity(path.duration))).toBeLessThan(1e-9)
    expect(length(path.velocity(arrival))).toBeGreaterThan(0.5 * length(path.velocity(path.duration / 2)))
  })

  it('fora do voo: antes vale a partida, depois a chegada', () => {
    const path = planTransfer(ring(12, 0), ring(40, 2.5))
    expect(burnPhase(path, -1).phase).toBe('departure')
    expect(burnPhase(path, path.duration + 5)).toEqual({ phase: 'arrival', intensity: ARRIVAL_TAIL })
  })

  it('troca de destino em voo: queima curta de correção (a costura da velocidade), depois planagem', () => {
    const first = planTransfer(ring(12, 0), ring(45, 2.6))
    const t = first.duration * 0.45
    const second = planTransfer(first.point(t), ring(20, 4.2), { velocity: first.velocity(t) })
    expect(second.burns.departure).toBeGreaterThan(0)
    expect(second.burns.departure).toBeLessThanOrEqual(BLEND_SECONDS + 1e-9)
    expect(burnPhase(second, 0).phase).toBe('departure')
    expect(burnPhase(second, second.duration / 2).phase).toBe('coast')
    expect(second.burns.puffs.length).toBe(1)
  })

  it('estilingue no meio da planagem: o sobrevoo é de graça, sem queima', () => {
    const from = ring(12, 0)
    const to = ring(60, Math.PI)
    const direct = planTransfer(from, to)
    const giant: TravelBody = { name: 'gigante', position: direct.point(direct.duration * 0.5), radius: 2.8, extent: 4.5 }
    const path = planTransfer(from, to, { bodies: [giant] })
    const { start, end } = path.assist!
    expect(path.burns.departure).toBeLessThan(start)
    expect(path.burns.arrival).toBeGreaterThan(end)
    for (let i = 0; i <= 50; i++) expect(burnPhase(path, start + ((end - start) * i) / 50)).toEqual({ phase: 'coast', intensity: 0 })
    expect(burnPhase(path, 0).intensity).toBe(1)
    expect(burnPhase(path, path.duration).intensity).toBe(ARRIVAL_TAIL)
  })
})
