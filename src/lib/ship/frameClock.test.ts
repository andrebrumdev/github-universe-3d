import { describe, expect, it } from 'vitest'
import { FrameClock } from './frameClock'
import { MAX_FRAME_DT } from './motion'

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

describe('relógio de quadro suavizado (o mesmo para a nave e a câmera)', () => {
  it('tira o tremido do horário do callback: a 60 Hz com ±3 ms de atraso, o passo fica quase constante', () => {
    const rnd = seeded(7)
    const c = new FrameClock()
    let prevJitter = 0
    const outs: number[] = []
    for (let i = 0; i < 600; i++) {
      // o callback roda um pouco depois do vsync, com atraso variável: o dt medido treme em volta de 1/60
      const jitter = (rnd() - 0.5) * 0.006
      outs.push(c.step(i, 1 / 60 + jitter - prevJitter))
      prevJitter = jitter
    }
    const steady = outs.slice(60)
    for (const dt of steady) expect(Math.abs(dt - 1 / 60)).toBeLessThan(0.0012)
  })

  it('não perde tempo: a soma dos passos acompanha a do tempo de verdade (a sobra fica limitada)', () => {
    const rnd = seeded(11)
    const c = new FrameClock()
    let raw = 0
    let out = 0
    for (let i = 0; i < 2000; i++) {
      const dt = i % 97 === 0 ? 0.05 : 1 / 60 + (rnd() - 0.5) * 0.004
      raw += dt
      out += c.step(i, dt)
    }
    expect(Math.abs(raw - out)).toBeLessThan(0.1)
  })

  it('uma vez por quadro: quem pede de novo no mesmo quadro recebe o mesmo passo', () => {
    const c = new FrameClock()
    const a = c.step(1, 0.02)
    expect(c.step(1, 0.5)).toBe(a)
    expect(c.step(2, 1 / 60)).not.toBe(Number.NaN)
  })

  it('quadro longo (aba em segundo plano): no máximo MAX_FRAME_DT, e dt 0 dá 0', () => {
    const c = new FrameClock()
    for (let i = 0; i < 30; i++) c.step(i, 1 / 60)
    expect(c.step(100, 5)).toBeLessThanOrEqual(MAX_FRAME_DT)
    const d = new FrameClock()
    expect(d.step(1, 0)).toBe(0)
  })
})
