import { describe, expect, it } from 'vitest'
import { buildOrbits, planetPosition, SUN_RADIUS, type Vec3 } from '../universe/orbits'
import { bankAngle, CHASE_SPRING, chasePose, escortPosition, MAX_BANK, MAX_CHASE_LEAD, springLead, springStep, targetAnchor, visitPosition } from './escort'
import { bezierPoint, planTravel, travelProgress, travelVelocity } from './travel'
import { SUN_SAFE_DISTANCE } from './travel'
import { cross, dot, length, sub } from './vec'

const system = buildOrbits(Array.from({ length: 12 }, (_, i) => ({ name: `p${i}`, radius: 2.2 })))

describe('targetAnchor', () => {
  it('sol na origem com o raio do sol; planeta na posição do instante', () => {
    expect(targetAnchor({ kind: 'sun' }, system, 0)).toEqual({ position: [0, 0, 0], radius: SUN_RADIUS })
    const orbit = system.orbits[5]
    expect(targetAnchor({ kind: 'planet', name: 'p5' }, system, 12)).toEqual({
      position: planetPosition(system.rings[orbit.ring], orbit, 12),
      radius: orbit.radius,
    })
    expect(targetAnchor({ kind: 'planet', name: 'nada' }, system, 0)).toBeNull()
  })
})

describe('visitPosition', () => {
  it('fica ao lado do alvo, do lado da câmera, e longe do sol', () => {
    const cameraPositions: Vec3[] = [[0, 20, 40], [0, 2, 0.1], [30, 5, -30]]
    for (const cam of cameraPositions) {
      for (const orbit of system.orbits) {
        const anchor = targetAnchor({ kind: 'planet', name: orbit.name }, system, 3)!
        const visit = visitPosition(anchor.position, anchor.radius, cam)
        expect(length(sub(visit, anchor.position))).toBeGreaterThan(anchor.radius)
        expect(length(visit)).toBeGreaterThanOrEqual(SUN_SAFE_DISTANCE)
      }
      expect(length(visitPosition([0, 0, 0], SUN_RADIUS, cam))).toBeGreaterThanOrEqual(SUN_SAFE_DISTANCE)
    }
  })

  it('o lado escolhido é o da visão da câmera', () => {
    const anchor: Vec3 = [20, 0, 0]
    const cam: Vec3 = [20, 0, 30]
    const right = cross([0, 0, -1], [0, 1, 0])
    expect(dot(sub(visitPosition(anchor, 1, cam), anchor), right)).toBeLessThan(0)
    expect(dot(sub(visitPosition(anchor, 1, cam, 1), anchor), right)).toBeGreaterThan(0)
    expect(dot(sub(visitPosition(anchor, 1, cam, 0), anchor), right)).toBeCloseTo(0)
  })
})

describe('escortPosition', () => {
  it('fica à frente, à direita e abaixo do centro da câmera', () => {
    const cam: Vec3 = [0, 10, 30]
    const forward: Vec3 = [0, 0, -1]
    const up: Vec3 = [0, 1, 0]
    const offset = sub(escortPosition(cam, forward, up), cam)
    expect(dot(offset, forward)).toBeGreaterThan(0)
    expect(dot(offset, cross(forward, up))).toBeGreaterThan(0)
    expect(dot(offset, up)).toBeLessThan(0)
  })
})

describe('chasePose', () => {
  it('câmera atrás e acima da nave, olhando para a frente dela', () => {
    const position: Vec3 = [5, 2, 5]
    const tangent: Vec3 = [1, 0, 0]
    const pose = chasePose(position, tangent)
    expect(dot(sub(pose.position, position), tangent)).toBeLessThan(0)
    expect(pose.position[1]).toBeGreaterThan(position[1])
    expect(dot(sub(pose.target, position), tangent)).toBeGreaterThan(0)
  })
})

describe('bankAngle', () => {
  it('inclina para dentro da curva, com limite', () => {
    const straight: Vec3 = [0, 0, 1]
    const left: Vec3 = [Math.sin(0.05), 0, Math.cos(0.05)]
    expect(bankAngle(straight, straight, 1 / 60)).toBe(0)
    expect(Math.sign(bankAngle(straight, left, 1 / 60))).not.toBe(0)
    expect(Math.abs(bankAngle(straight, [1, 0, 0], 1 / 60))).toBe(MAX_BANK)
    expect(bankAngle(straight, left, 0)).toBe(0)
  })
})

describe('springStep', () => {
  const goal: Vec3 = [10, -4, 2]
  const rest = { position: [0, 0, 0] as Vec3, velocity: [0, 0, 0] as Vec3 }
  const run = (dt: number, steps: number) => {
    let s = rest
    for (let i = 0; i < steps; i++) s = springStep(s, goal, CHASE_SPRING, dt)
    return s
  }

  it('converge para o alvo', () => {
    expect(length(sub(run(1 / 60, 600).position, goal))).toBeLessThan(1e-3)
  })

  it('sai do repouso devagar: puxada com atraso, sem salto', () => {
    const first = springStep(rest, goal, CHASE_SPRING, 1 / 60)
    expect(length(first.position)).toBeLessThan(0.02 * length(goal))
  })

  it('não passa do alvo, nem com dt enorme', () => {
    for (const dt of [1 / 60, 0.1, 1, 10, 1000]) {
      let s = rest
      for (let i = 0; i < 50; i++) {
        s = springStep(s, goal, CHASE_SPRING, dt)
        for (let k = 0; k < 3; k++) {
          const along = goal[k] === 0 ? 0 : s.position[k] / goal[k]
          expect(along).toBeLessThanOrEqual(1 + 1e-9)
          expect(along).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('independe da taxa de quadros', () => {
    const coarse = run(1 / 30, 20)
    const fine = run(1 / 60, 40)
    expect(length(sub(coarse.position, fine.position))).toBeLessThan(1e-6)
    expect(length(sub(coarse.velocity, fine.velocity))).toBeLessThan(1e-6)
  })

  it('dt zero ou negativo não mexe', () => {
    expect(springStep(rest, goal, CHASE_SPRING, 0)).toBe(rest)
  })
})

describe('springLead', () => {
  it('com o alvo andando reto, a mola com antecipação alcança o alvo (sem o atraso 2v/ω)', () => {
    const v: Vec3 = [30, 0, 0]
    const dt = 1 / 60
    let goal: Vec3 = [0, 0, 0]
    let plain = { position: [0, 0, 0] as Vec3, velocity: [0, 0, 0] as Vec3 }
    let led = plain
    for (let i = 0; i < 300; i++) {
      goal = [goal[0] + v[0] * dt, 0, 0]
      plain = springStep(plain, goal, CHASE_SPRING, dt)
      led = springStep(led, springLead(goal, v, CHASE_SPRING), CHASE_SPRING, dt)
    }
    // sem antecipação: atraso de regime ≈ 2v/ω (menos meio passo, pela discretização)
    expect(Math.abs(goal[0] - plain.position[0] - (2 * v[0]) / CHASE_SPRING)).toBeLessThan(v[0] * dt)
    // com antecipação: sobra só o meio passo de discretização (o alvo anda dentro do dt), em vez de 15 unidades
    expect(Math.abs(goal[0] - led.position[0])).toBeLessThan(v[0] * dt)
  })
})

describe('escortPosition com viewport', () => {
  it('fica dentro da tela também num celular estreito', () => {
    const cam: Vec3 = [0, 10, 30]
    const forward: Vec3 = [0, 0, -1]
    const up: Vec3 = [0, 1, 0]
    for (const aspect of [0.45, 1, 1.6, 2.4]) {
      const offset = sub(escortPosition(cam, forward, up, { aspect, fov: 50 }), cam)
      const depth = dot(offset, forward)
      const halfTan = Math.tan((50 * Math.PI) / 360)
      expect(dot(offset, cross(forward, up)) / depth).toBeLessThan(halfTan * aspect * 0.75)
      expect(dot(offset, cross(forward, up))).toBeGreaterThan(0)
      expect(-dot(offset, up) / depth).toBeLessThan(halfTan * 0.75)
    }
  })

  it('sem viewport, mantém o deslocamento do plano', () => {
    const p = escortPosition([0, 0, 0], [0, 0, -1], [0, 1, 0])
    expect(p[0]).toBeCloseTo(1.6)
    expect(p[1]).toBeCloseTo(-0.9)
    expect(p[2]).toBeCloseTo(-4.5)
  })

  it('na tela larga, o lado fica o do plano', () => {
    expect(escortPosition([0, 0, 0], [0, 0, -1], [0, 1, 0], { aspect: 16 / 10, fov: 50 })[0]).toBeCloseTo(1.6)
  })
})

describe('antecipação da perseguição limitada', () => {
  const lead = (v: Vec3) => length(sub(springLead([0, 0, 0], v, CHASE_SPRING, MAX_CHASE_LEAD), [0, 0, 0]))

  it('nunca passa do limite, nem com velocidade enorme', () => {
    expect(lead([1e6, -1e6, 3e5])).toBeCloseTo(MAX_CHASE_LEAD)
    expect(lead([0.5, 0, 0])).toBeCloseTo((2 * 0.5) / CHASE_SPRING)
  })

  it('troca de destino no meio da viagem ou dt enorme não estouram a antecipação', () => {
    const first = planTravel([10, 0, 0], [-40, 0, 25])
    const mid = first.duration / 2
    // a nova viagem parte de onde a nave está (velocidade analítica do caminho, não diferença entre frames)
    const here = bezierPoint(first.points, travelProgress(mid, first.duration))
    const second = planTravel(here, [30, 0, -30])
    const samples = [travelVelocity(first, mid), travelVelocity(second, 0), travelVelocity(second, 0.1), travelVelocity(second, 1e6), travelVelocity(first, first.duration / 3)]
    for (const v of samples) expect(lead(v)).toBeLessThanOrEqual(MAX_CHASE_LEAD + 1e-9)
    expect(lead(travelVelocity(second, 0))).toBe(0)
  })

  it('sem limite, mantém a antecipação exata 2v/ω', () => {
    expect(length(springLead([0, 0, 0], [30, 0, 0], CHASE_SPRING))).toBeCloseTo((2 * 30) / CHASE_SPRING)
  })
})
