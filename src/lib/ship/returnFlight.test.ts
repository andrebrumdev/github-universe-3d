import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../universe/orbits'
import { ARRIVAL_TAIL } from './burn'
import { frameFromPose, frameToLocal, frameToWorld, type CameraFrame } from './cameraFrame'
import { MIN_SHIP_DISTANCE, THREE_QUARTER_YAW } from './escort'
import {
  planReturn,
  RETURN_MAX_SECONDS,
  RETURN_MIN_SECONDS,
  returnDuration,
  returnHeading,
  returnLocal,
  returnLocalVelocity,
  returnPoint,
  returnBurnPhase,
  returnBurns,
  type ReturnPlan,
} from './returnFlight'
import { dot, length, normalize, scale, sub } from './vec'

/** Gerador com semente (mulberry32). */
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

const ESCORT_RIGHT: Vec3 = [1.4, -0.75, -2.2]
const ESCORT_LEFT: Vec3 = [-0.5, -0.9, -3.1]
const randomUnit = (rnd: () => number): Vec3 => normalize([rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1])

function cases(): { start: Vec3; velocity: Vec3; departure: Vec3; escort: Vec3; side: 1 | -1 }[] {
  const rnd = seeded(42)
  const out = []
  for (let i = 0; i < 80; i++) {
    const right = i % 2 === 0
    // o planeta lá na frente (longe) ou a nave em primeiro plano (perto da lente), em qualquer lado
    const far = i % 3 !== 0
    const start: Vec3 = far
      ? [(rnd() * 2 - 1) * 30, (rnd() * 2 - 1) * 12, -10 - rnd() * 60]
      : [(rnd() * 2 - 1) * 1.6, -0.3 - rnd() * 0.6, -2.6 - rnd() * 0.8]
    const moving = i % 5 === 0
    out.push({
      start,
      velocity: moving ? scale(randomUnit(rnd), 30) : ([0, 0, 0] as Vec3),
      departure: randomUnit(rnd),
      escort: right ? ESCORT_RIGHT : ESCORT_LEFT,
      side: right ? (1 as const) : (-1 as const),
    })
  }
  return out
}

const samples = (plan: ReturnPlan, n = 600) => Array.from({ length: n + 1 }, (_, i) => (i / n) * plan.duration)

// Duas câmeras diferentes (a da hora da volta e a de agora, já indo para a visão geral).
const F0: CameraFrame = frameFromPose({ position: [10, 6, 20], target: [4, 0, 0] })
const F1: CameraFrame = frameFromPose({ position: [0, 50, 80], target: [0, 0, 0] })

describe('referencial da câmera', () => {
  it('ida e volta entre o mundo e o referencial', () => {
    const p: Vec3 = [3, -2, 7]
    expect(length(sub(frameToWorld(F0, frameToLocal(F0, p)), p))).toBeLessThan(1e-12)
    // o alvo da pose fica à frente (−z), no centro
    const t = frameToLocal(F0, [4, 0, 0])
    expect(t[2]).toBeLessThan(0)
    expect(Math.hypot(t[0], t[1])).toBeLessThan(1e-12)
  })
})

describe('volta do planeta até perto da tela', () => {
  it('duração entre 1,2 e 2 s, crescendo com a distância', () => {
    expect(returnDuration(0)).toBe(RETURN_MIN_SECONDS)
    expect(returnDuration(200)).toBe(RETURN_MAX_SECONDS)
    expect(returnDuration(40)).toBeGreaterThan(returnDuration(10))
    for (const c of cases()) {
      const plan = planReturn(c)
      expect(plan.duration).toBeGreaterThanOrEqual(RETURN_MIN_SECONDS)
      expect(plan.duration).toBeLessThanOrEqual(RETURN_MAX_SECONDS)
    }
  })

  it('pontas: parte de onde a nave está (no mundo da hora da volta) e termina no canto da escolta (câmera de agora)', () => {
    for (const c of cases()) {
      const plan = planReturn(c)
      expect(length(sub(returnPoint(plan, 0, F0, F1), frameToWorld(F0, c.start)))).toBeLessThan(1e-9)
      expect(length(sub(returnPoint(plan, plan.duration, F0, F1), frameToWorld(F1, c.escort)))).toBeLessThan(1e-9)
      expect(length(sub(returnLocal(plan, plan.duration * 2), c.escort))).toBeLessThan(1e-9)
    }
  })

  it('C1: sem salto de posição nem de velocidade, inclusive na mistura dos referenciais', () => {
    for (const c of cases().slice(0, 20)) {
      const plan = planReturn(c)
      const h = plan.duration / 3000
      const P = (t: number) => returnPoint(plan, t, F0, F1)
      const V = (t: number) => scale(sub(P(t + h / 2), P(t - h / 2)), 1 / h)
      let vmax = 0
      for (const t of samples(plan, 300)) vmax = Math.max(vmax, length(V(Math.min(Math.max(t, h), plan.duration - h))))
      for (let t = h; t < plan.duration - 2 * h; t += h) {
        expect(length(sub(P(t + h), P(t)))).toBeLessThan(vmax * h * 1.5 + 1e-9)
        expect(length(sub(V(t + h), V(t)))).toBeLessThan(0.05 * vmax + 1e-6)
      }
      // parte com a velocidade que tinha (parada, ou em voo)
      expect(length(sub(V(h), frameToWorldDir(F0, c.velocity)))).toBeLessThan(0.05 * Math.max(1, length(c.velocity)) + 0.02 * vmax)
    }
  })

  it('nunca atravessa o plano próximo nem enche a tela: dentro do quadro, nunca mais perto que o canto da escolta', () => {
    const tanY = Math.tan((50 * Math.PI) / 360)
    for (const c of cases()) {
      const plan = planReturn(c)
      const depth = -c.escort[2]
      for (const t of samples(plan)) {
        const p = returnLocal(plan, t)
        expect(length(p)).toBeGreaterThanOrEqual(2 * MIN_SHIP_DISTANCE)
        const inFrame = p[2] < 0 && Math.abs(p[0]) < -p[2] * tanY * 1.78 && Math.abs(p[1]) < -p[2] * tanY
        if (inFrame && t > plan.duration * 0.3) expect(-p[2]).toBeGreaterThanOrEqual(0.85 * depth)
      }
    }
  })

  it('sai pela tangente da órbita (sem virar de cara para a câmera) e termina de frente, em três-quartos', () => {
    for (const c of cases()) {
      const plan = planReturn(c)
      // parada: pela tangente (sem a parte que apontaria para a lente); em voo: pela velocidade que tinha
      const firstMove = length(c.velocity) > 0 ? normalize(c.velocity) : plan.departure
      if (length(c.velocity) === 0) expect(dot(plan.departure, c.departure)).toBeGreaterThan(0)
      expect(dot(returnHeading(plan, plan.duration * 0.02), firstMove)).toBeGreaterThan(0.9)
      const end = returnHeading(plan, plan.duration)
      const toCamera = normalize(scale(c.escort, -1))
      expect(Math.acos(Math.min(1, dot(end, toCamera)))).toBeCloseTo(THREE_QUARTER_YAW, 3)
      // o nariz gira para o centro da tela (como na escolta)
      expect(Math.sign(end[0] - toCamera[0])).toBe(-c.side)
    }
  })

  it('queimas como toda viagem: partida ao sair, chama-piloto por trás da câmera, puff que para no canto', () => {
    for (const c of cases()) {
      const plan = planReturn(c)
      const { departure, arrival } = returnBurns(plan)
      expect(departure).toBeGreaterThan(0)
      expect(arrival).toBeGreaterThan(departure)
      expect(arrival).toBeLessThan(plan.duration)
      expect(returnBurnPhase(plan, 0)).toEqual({ phase: 'departure', intensity: 1 })
      expect(returnBurnPhase(plan, (departure + arrival) / 2)).toEqual({ phase: 'coast', intensity: 0 })
      expect(returnBurnPhase(plan, plan.duration)).toEqual({ phase: 'arrival', intensity: ARRIVAL_TAIL })
    }
  })

  it('freia numa curva só, alinhada com o puff: cruzeiro constante, depois a velocidade só cai até parar no canto', () => {
    for (const c of cases()) {
      const plan = planReturn(c)
      const T = plan.duration
      const { departure, puffs } = returnBurns(plan)
      const puff = puffs[0]
      expect(puff.time + puff.duration).toBeCloseTo(T, 9)
      const speed = (t: number) => length(returnLocalVelocity(plan, t))
      const cruise = speed((departure + puff.time) / 2)
      expect(cruise).toBeGreaterThan(0)
      // planagem: velocidade de cruzeiro, sem cair
      for (let i = 0; i <= 60; i++) {
        const t = departure + ((puff.time - departure) * i) / 60
        expect(Math.abs(speed(t) - cruise)).toBeLessThan(1e-6 * cruise + 1e-9)
      }
      // puff: nunca sobe, chega a zero no fim; a nave só se aproxima do canto (sem passar e voltar)
      let prevV = speed(puff.time)
      let prevD = length(sub(returnLocal(plan, puff.time), c.escort))
      for (let i = 1; i <= 200; i++) {
        const t = puff.time + (puff.duration * i) / 200
        const v = speed(t)
        const d = length(sub(returnLocal(plan, t), c.escort))
        expect(v).toBeLessThanOrEqual(prevV + 1e-9)
        expect(d).toBeLessThanOrEqual(prevD + 1e-9)
        prevV = v
        prevD = d
      }
      expect(speed(T)).toBeLessThan(1e-9)
      expect(length(sub(returnLocal(plan, T), c.escort))).toBeLessThan(1e-9)
    }
  })
})

function frameToWorldDir(f: CameraFrame, v: Vec3): Vec3 {
  return sub(frameToWorld(f, v), f.position)
}
