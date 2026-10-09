import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../universe/random'
import { MAX_PITCH } from './faceSpring'
import { headOffset, limitTurn, MAX_TURN_AWAY, MOTION_AT_REST, quantizePupil, SACCADE, stepGazeMotion, WANDER, type GazeMotion } from './gaze'

const DT = 1 / 30

function run(seconds: number, reduced = false, seed = 7) {
  const rng = mulberry32(seed)
  const trace: GazeMotion[] = []
  let s = MOTION_AT_REST
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    s = stepGazeMotion(s, reduced, DT, rng)
    trace.push(s)
  }
  return trace
}

describe('movimento do olhar: deriva preguiçosa dormindo, sacadas de olhos abertos', () => {
  it('dormindo, a cabeça vaga devagar e pouco (sem pular para alvo nenhum)', () => {
    const trace = run(120)
    const maxStep = 2 * WANDER.yaw * (1 - Math.exp(-DT / WANDER.tau)) + 1e-9
    for (let i = 1; i < trace.length; i++) {
      const [y0, p0] = headOffset(trace[i - 1], true)
      const [y1, p1] = headOffset(trace[i], true)
      expect(Math.abs(y1)).toBeLessThanOrEqual(WANDER.yaw)
      expect(Math.abs(p1)).toBeLessThanOrEqual(WANDER.pitch)
      expect(Math.abs(y1 - y0)).toBeLessThanOrEqual(maxStep)
      expect(Math.abs(p1 - p0)).toBeLessThanOrEqual(maxStep)
    }
    expect(new Set(trace.map((s) => headOffset(s, true)[0].toFixed(3))).size).toBeGreaterThan(20)
  })

  it('de olhos abertos, só sacadas pequenas, trocando de vez em quando', () => {
    const trace = run(20)
    expect(new Set(trace.map((s) => headOffset(s, false)[0])).size).toBeGreaterThan(10)
    for (const s of trace) {
      expect(Math.abs(headOffset(s, false)[0])).toBeLessThanOrEqual(SACCADE.yaw)
      expect(Math.abs(headOffset(s, false)[1])).toBeLessThanOrEqual(SACCADE.pitch)
    }
  })

  it('movimento reduzido: nem deriva nem sacada', () => {
    for (const s of run(30, true)) {
      expect(headOffset(s, true)).toEqual([0, 0])
      expect(headOffset(s, false)).toEqual([0, 0])
    }
  })

  it('a mesma semente dá o mesmo movimento', () => {
    expect(run(10, false, 42).map((s) => s.wanderYaw)).toEqual(run(10, false, 42).map((s) => s.wanderYaw))
  })
})

describe('pupila em degraus (cara de olhar de desenho, sem jitter)', () => {
  it('8 degraus no alcance: arredonda para o degrau mais perto e não passa do alcance', () => {
    const reach = 5
    const step = (2 * reach) / 8
    expect(quantizePupil(0, reach)).toBe(0)
    expect(quantizePupil(0.3, reach)).toBe(0)
    expect(quantizePupil(0.7, reach)).toBeCloseTo(step)
    expect(quantizePupil(-2.6, reach)).toBeCloseTo(-2 * step)
    expect(quantizePupil(99, reach)).toBe(reach)
    expect(quantizePupil(-99, reach)).toBe(-reach)
    const levels = new Set<number>()
    for (let v = -6; v <= 6; v += 0.01) levels.add(quantizePupil(v, reach))
    expect(levels.size).toBe(9)
  })
})

describe('olhando longe: o rosto desliza pela esfera até 55° de quem vê e o pitch fica limitado', () => {
  const deg = (d: number) => (d * Math.PI) / 180
  const front = { yaw: 0, pitch: 0 }
  const dir = (t: { yaw: number; pitch: number }) => [Math.cos(t.pitch) * Math.sin(t.yaw), Math.sin(t.pitch), Math.cos(t.pitch) * Math.cos(t.yaw)]
  const angle = (a: { yaw: number; pitch: number }, b: { yaw: number; pitch: number }) => {
    const [u, v] = [dir(a), dir(b)]
    return Math.acos(Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))
  }

  it('yaw: segue igual até 55° da câmera; além disso para no limite, do lado do alvo', () => {
    expect(MAX_TURN_AWAY).toBeCloseTo(deg(55))
    expect(limitTurn({ yaw: deg(50), pitch: 0 }, front).yaw).toBeCloseTo(deg(50))
    expect(limitTurn({ yaw: deg(170), pitch: 0 }, front).yaw).toBeCloseTo(deg(55))
    expect(limitTurn({ yaw: deg(-120), pitch: 0 }, front).yaw).toBeCloseTo(deg(-55))
    // na volta do ±π (sem normalizar: a mola trata a volta)
    expect(limitTurn({ yaw: deg(-170), pitch: 0 }, { yaw: deg(170), pitch: 0 }).yaw).toBeCloseTo(deg(190))
  })

  it('pitch: limitado a ±35° (o mesmo MAX_PITCH da mola)', () => {
    expect(MAX_PITCH).toBeCloseTo(deg(35))
    expect(limitTurn({ yaw: 0, pitch: deg(80) }, front).pitch).toBeCloseTo(deg(35))
    expect(limitTurn({ yaw: 0, pitch: deg(-80) }, front).pitch).toBeCloseTo(deg(-35))
    expect(limitTurn({ yaw: 0, pitch: deg(20) }, front).pitch).toBeCloseTo(deg(20))
  })

  it('com a câmera de cima, o ângulo de verdade até quem vê também para no limite (o rosto não some na borda)', () => {
    const viewer = { yaw: 0, pitch: deg(30) }
    for (const target of [{ yaw: deg(160), pitch: deg(-10) }, { yaw: deg(-100), pitch: 0 }, { yaw: deg(80), pitch: deg(-20) }]) {
      expect(angle(limitTurn(target, viewer), viewer)).toBeLessThanOrEqual(MAX_TURN_AWAY + 1e-9)
    }
    // alvo exatamente atrás: vira para um lado, sem NaN
    const back = limitTurn({ yaw: deg(180), pitch: deg(-30) }, viewer)
    expect(Number.isFinite(back.yaw) && Number.isFinite(back.pitch)).toBe(true)
    expect(angle(back, viewer)).toBeCloseTo(MAX_TURN_AWAY, 3)
  })
})
