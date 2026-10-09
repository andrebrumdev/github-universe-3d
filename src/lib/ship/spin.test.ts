import { describe, expect, it } from 'vitest'
import { dragSpin, FLING_WINDOW_MS, grabSpin, MAX_SPIN, MAX_TILT, newSpin, releaseSpin, settleSpin, SPIN_PER_PX, spinSpeed, stepSpin, type Spin } from './spin'

/** Arrasta `px` em `ms` em eventos de ~16 ms (como o pointermove). */
function drag(s: Spin, px: number, ms: number, reduced = false, start = 0, dy = 0): number {
  const moves = Math.max(1, Math.round(ms / 16))
  let t = start
  for (let i = 0; i < moves; i++) {
    t += ms / moves
    dragSpin(s, px / moves, dy / moves, t, reduced)
  }
  return t
}

function run(s: Spin, seconds: number, fps: number, reduced = false): Spin {
  const n = Math.round(seconds * fps)
  for (let i = 0; i < n; i++) stepSpin(s, 1 / fps, reduced)
  return s
}

describe('giro da nave no arrasto', () => {
  it('arrastando, o giro segue o dedo direto', () => {
    const s = newSpin()
    grabSpin(s, 0)
    drag(s, 100, 160)
    expect(s.yaw).toBeCloseTo(100 * SPIN_PER_PX, 9)
  })

  it('soltando com o dedo em movimento, continua girando e desacelera até parar', () => {
    const s = newSpin()
    grabSpin(s, 0)
    // devagar o bastante para o giro de meio segundo não dar a volta no ângulo
    const t = drag(s, 50, 200)
    releaseSpin(s, t, false)
    const v0 = s.yawVel
    expect(v0).toBeGreaterThan(0)
    const yaw0 = s.yaw
    run(s, 0.5, 60)
    expect(s.yawVel).toBeLessThan(v0)
    expect(s.yaw).toBeGreaterThan(yaw0)
    run(s, 10, 60)
    expect(s.yawVel).toBe(0)
  })

  it('parou o dedo antes de soltar: sem embalo', () => {
    const s = newSpin()
    grabSpin(s, 0)
    const t = drag(s, 200, 200)
    releaseSpin(s, t + 300, false)
    expect(s.yawVel).toBe(0)
  })

  it('a velocidade tem teto, por mais rápido que seja o arrasto', () => {
    const s = newSpin()
    grabSpin(s, 0)
    const t = drag(s, 5000, 32)
    releaseSpin(s, t, false)
    expect(Math.abs(s.yawVel)).toBeLessThanOrEqual(MAX_SPIN)
  })

  it('a inclinação acompanha o arrasto vertical com limite e volta ao nível depois', () => {
    const s = newSpin()
    grabSpin(s, 0)
    const t = drag(s, 0, 300, false, 0, 4000)
    expect(Math.abs(s.tilt)).toBeLessThanOrEqual(MAX_TILT)
    expect(Math.abs(s.tilt)).toBeGreaterThan(0)
    releaseSpin(s, t, false)
    run(s, 3, 60)
    expect(Math.abs(s.tilt)).toBeLessThan(1e-3)
  })

  it('não depende da taxa de quadros (30, 60 e 144 fps chegam ao mesmo lugar)', () => {
    const at = (fps: number) => {
      const s = newSpin()
      grabSpin(s, 0)
      const t = drag(s, 300, 250, false, 0, 600)
      releaseSpin(s, t, false)
      return run(s, 1, fps)
    }
    const [a, b, c] = [at(30), at(60), at(144)]
    for (const other of [a, c]) {
      expect(other.yaw).toBeCloseTo(b.yaw, 6)
      expect(other.yawVel).toBeCloseTo(b.yawVel, 6)
      expect(other.tilt).toBeCloseTo(b.tilt, 6)
    }
  })

  it('o ângulo fica num intervalo limitado (dá a volta em vez de crescer sem fim)', () => {
    const s = newSpin()
    grabSpin(s, 0)
    drag(s, 1e6, 100_000)
    expect(Math.abs(s.yaw)).toBeLessThanOrEqual(Math.PI)
    expect(Number.isFinite(s.yaw)).toBe(true)
  })

  it('movimento reduzido: gira direto, sem embalo nem mola', () => {
    const s = newSpin()
    grabSpin(s, 0)
    const t = drag(s, 200, 200, true, 0, 300)
    const yaw = s.yaw
    const tilt = s.tilt
    releaseSpin(s, t, true)
    expect(s.yawVel).toBe(0)
    run(s, 2, 60, true)
    expect(s.yaw).toBe(yaw)
    expect(s.tilt).toBe(tilt)
  })

  it('fora do modo, volta à pose de frente pelo caminho mais curto', () => {
    const s = newSpin()
    s.yaw = Math.PI - 0.2
    s.tilt = 0.3
    s.yawVel = 4
    for (let i = 0; i < 120; i++) settleSpin(s, 1 / 60, false)
    expect(Math.abs(s.yaw)).toBeLessThan(1e-2)
    expect(s.yawVel).toBe(0)
    expect(Math.abs(s.tilt)).toBeLessThan(1e-2)
    const instant = newSpin()
    instant.yaw = 2
    settleSpin(instant, 1 / 60, true)
    expect(instant.yaw).toBe(0)
  })

  it('velocidade do giro agora (para o medidor de tontura): a do dedo arrastando, a do embalo solto', () => {
    const s = newSpin()
    grabSpin(s, 0)
    const t = drag(s, 200, 200)
    expect(spinSpeed(s, t)).toBeGreaterThan(5)
    // dedo parado segurando a nave: não está girando
    expect(spinSpeed(s, t + FLING_WINDOW_MS + 1)).toBe(0)
    releaseSpin(s, t, false)
    expect(spinSpeed(s, t + 1000)).toBe(Math.abs(s.yawVel))
  })
})

