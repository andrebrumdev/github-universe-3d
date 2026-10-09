import { describe, expect, it } from 'vitest'
import { buildOrbits, planetPosition, SUN_RADIUS, type Vec3 } from '../universe/orbits'
import {
  bankAngle,
  CHASE_SPRING,
  chasePose,
  ESCORT_LEAN_DEPTH,
  escortFraming,
  escortOffset,
  keepAway,
  KNOCK_DURATION,
  knockOffset,
  knockPose,
  MAX_BANK,
  MAX_CHASE_LEAD,
  MIN_SHIP_DISTANCE,
  SHIP_WORLD_HEIGHT,
  SHIP_WORLD_WIDTH,
  springLead,
  springStep,
  targetAnchor,
  visitPosition,
} from './escort'
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

describe('escortOffset (perto da lente, derivado do frustum)', () => {
  const desktop = { aspect: 16 / 10, fov: 50 }
  const wide = { aspect: 21 / 9, fov: 50 }
  const phone = { aspect: 390 / 844, fov: 50 }
  const t = Math.tan((50 * Math.PI) / 360)
  /** Caixa da nave em NDC (−1..1), a partir do offset no referencial da câmera. */
  const ndcBox = (o: [number, number, number], aspect: number) => {
    const depth = -o[2]
    const sx = (v: number) => v / (depth * t * aspect)
    const sy = (v: number) => v / (depth * t)
    return {
      left: sx(o[0] - SHIP_WORLD_WIDTH / 2),
      right: sx(o[0] + SHIP_WORLD_WIDTH / 2),
      bottom: sy(o[1] - SHIP_WORLD_HEIGHT / 2),
      top: sy(o[1] + SHIP_WORLD_HEIGHT / 2),
      cx: sx(o[0]),
      heightFraction: SHIP_WORLD_HEIGHT / (2 * depth * t),
    }
  }

  it('desktop: canto inferior direito, 22–28% da altura, rosto (centro) dentro da tela', () => {
    for (const vp of [desktop, wide]) {
      const b = ndcBox(escortOffset(vp), vp.aspect)
      expect(b.heightFraction).toBeGreaterThanOrEqual(0.22)
      expect(b.heightFraction).toBeLessThanOrEqual(0.28)
      expect(b.cx).toBeGreaterThan(0.4)
      expect(b.right).toBeGreaterThan(0.95) // encostada na borda direita (pode cortar um pouco a asa)
      expect(b.right - 1).toBeLessThan(0.25 * (b.right - b.left)) // corta no máximo uma ponta de asa
      expect(b.bottom).toBeGreaterThan(-1)
      expect(b.bottom).toBeLessThan(-0.85)
      // abaixo do cartão do tutorial no desktop (bottom-56 = 224 px de 800 → 28% da altura)
      expect((b.top + 1) / 2).toBeLessThanOrEqual(0.29)
    }
  })

  it('celular em pé: menor (~16–18%), no canto de baixo, sob o cartão do tutorial e longe do botão', () => {
    const b = ndcBox(escortOffset(phone), phone.aspect)
    expect(b.heightFraction).toBeGreaterThanOrEqual(0.15)
    expect(b.heightFraction).toBeLessThanOrEqual(0.18)
    expect(b.bottom).toBeGreaterThan(-1)
    // cartão do tutorial no celular: bottom-36 = 144 px de 844 → 17% da altura
    expect((b.top + 1) / 2).toBeLessThanOrEqual(144 / 844)
    // lado esquerdo: o botão "? Tutorial" fica no canto inferior direito
    expect(escortFraming(phone).side).toBe(-1)
    expect(b.cx).toBeLessThan(0)
    expect(b.cx).toBeGreaterThan(-1)
  })

  it('longe do plano próximo (0,1) com folga para a nave inteira', () => {
    for (const vp of [desktop, wide, phone]) expect(-escortOffset(vp)[2]).toBeGreaterThan(MIN_SHIP_DISTANCE + SHIP_WORLD_WIDTH)
  })
})

describe('knockPose (bater no vidro)', () => {
  it('fora da janela, nada', () => {
    for (const t of [-1, KNOCK_DURATION, KNOCK_DURATION + 5, Number.NaN]) expect(knockPose(t)).toEqual({ closer: 0, bob: 0, waving: false })
  })

  it('chega perto, bate duas vezes, acena e volta', () => {
    expect(knockPose(0).closer).toBe(0)
    expect(knockPose(1.7).closer).toBeCloseTo(1)
    expect(knockPose(1.125).bob).toBeCloseTo(1)
    expect(knockPose(1.575).bob).toBeCloseTo(1)
    expect(knockPose(1.3).bob).toBe(0)
    expect(knockPose(0.3).bob).toBe(0)
    expect(knockPose(KNOCK_DURATION - 1e-6).closer).toBeLessThan(1e-3)
    expect(knockPose(1).waving).toBe(true)
    expect(knockPose(0.2).waving).toBe(false)
    expect(knockPose(3).waving).toBe(false)
  })

  it('é contínuo (sem saltos entre frames de 1/60)', () => {
    let prev = knockPose(0)
    for (let t = 1 / 60; t < KNOCK_DURATION; t += 1 / 60) {
      const k = knockPose(t)
      expect(Math.abs(k.closer - prev.closer)).toBeLessThan(0.1)
      expect(Math.abs(k.bob - prev.bob)).toBeLessThan(0.25)
      prev = k
    }
  })
})

describe('knockOffset', () => {
  const base = escortOffset({ aspect: 16 / 10, fov: 50 })

  it('sem batida, é a escolta', () => {
    expect(knockOffset(base, knockPose(-1))).toEqual(base)
  })

  it('na batida, chega mais perto da lente pelo mesmo raio de visão, sem passar do mínimo', () => {
    for (let t = 0; t < KNOCK_DURATION; t += 0.05) {
      const o = knockOffset(base, knockPose(t))
      expect(length(o)).toBeLessThanOrEqual(length(base) + 1e-9)
      expect(length(o)).toBeGreaterThan(MIN_SHIP_DISTANCE + SHIP_WORLD_WIDTH / 2)
    }
    const peak = knockOffset(base, knockPose(1.125))
    expect(-peak[2]).toBeLessThan(-base[2] * (1 - ESCORT_LEAN_DEPTH) + 1e-9)
  })
})

describe('keepAway', () => {
  it('empurra para fora de uma esfera em volta da câmera; fora dela, não mexe', () => {
    const cam: Vec3 = [1, 2, 3]
    expect(keepAway([1, 2, 10], cam, 1)).toEqual([1, 2, 10])
    expect(length(sub(keepAway([1, 2, 3.2], cam, 1), cam))).toBeCloseTo(1)
    expect(length(sub(keepAway(cam, cam, 1), cam))).toBeCloseTo(1)
  })
})
