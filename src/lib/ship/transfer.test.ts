import { describe, expect, it } from 'vitest'
import { planetMass, SUN_MASS } from '../universe/barycenter'
import { advanceClock } from '../universe/clock'
import { buildOrbits, planetPosition, type Vec3 } from '../universe/orbits'
import {
  ASSIST_MIN_RADIUS,
  BURN_FRACTION,
  clockTimeAfter,
  flybyDeflection,
  FLYBY_MARGIN,
  MAX_LIFT,
  MU_PER_MASS,
  OBSTACLE_MARGIN,
  planTransfer,
  planTransferTo,
  SUN_FLYBY_PERIAPSIS,
  travelBodies,
  type TravelBody,
} from './transfer'
import { MAX_TRAVEL_SECONDS, MIN_TRAVEL_SECONDS, SUN_SAFE_DISTANCE, travelTangent, type TravelPath } from './travel'
import { cross, dot, length, normalize, scale, sub } from './vec'

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

  it('2ª lei de Kepler: mais rápida perto do sol, varrendo área quase constante', () => {
    const path = planTransfer(ring(12, 0), ring(48, Math.PI))
    const near = path.velocity(path.duration * 0.3)
    const far = path.velocity(path.duration * 0.7)
    expect(length(near)).toBeGreaterThan(1.5 * length(far))
    // fora das queimas, |r × v| (dobro da velocidade areolar) varia pouco
    const areal = [0.3, 0.4, 0.5, 0.6, 0.7].map((k) => length(cross(path.point(path.duration * k), path.velocity(path.duration * k))))
    expect(Math.max(...areal) / Math.min(...areal)).toBeLessThan(1.15)
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

  it('massa do sol entra na mesma escala dos planetas', () => {
    expect(flybyDeflection(SUN_FLYBY_PERIAPSIS, 20, MU_PER_MASS * SUN_MASS)).toBeGreaterThan(flybyDeflection(6, 20, MU_PER_MASS * planetMass(3)))
  })

  describe('pelo sol (destino do outro lado)', () => {
    const from = ring(13, 0.2, 0.5)
    const to = ring(14, 0.2 + Math.PI * 0.97, -0.5)
    const path = planTransfer(from, to)

    it('mergulha em volta do sol sem entrar no raio seguro', () => {
      expect(path.assist?.body).toBe('sun')
      expect(path.assist!.periapsis).toBeGreaterThanOrEqual(SUN_FLYBY_PERIAPSIS - 1e-9)
      expect(minDistance(path, ORIGIN)).toBeGreaterThanOrEqual(SUN_SAFE_DISTANCE)
      expect(minDistance(path, ORIGIN)).toBeLessThan(Math.min(length(from), length(to)) - 2)
    })

    it('acelera perto do sol', () => {
      const { start, peak } = path.assist!
      expect(start).toBeLessThan(peak)
      // parabólico: v ∝ 1/√r, da entrada da janela (meio caminho até o periélio) ao periélio
      expect(length(path.velocity(peak))).toBeGreaterThan(1.15 * length(path.velocity(start)))
    })

    it('liga as pontas, contínuo e com velocidade analítica', () => {
      expect(dist(path.point(0), from)).toBeLessThan(1e-9)
      expect(dist(path.point(path.duration), to)).toBeLessThan(1e-9)
      expectContinuous(path)
      expectVelocityMatchesFiniteDifferences(path)
    })

    it('não acontece quando o destino é o próprio sol', () => {
      expect(planTransfer(ring(14, 0), ring(5.5, Math.PI, 1.5)).assist).toBeNull()
    })
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
