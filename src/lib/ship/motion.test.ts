import { describe, expect, it } from 'vitest'
import { BLINK_EVERY, hoverOffset, isBlinking, thrusterScale, WAVE_AMPLITUDE, waveAngle } from './motion'

const times = Array.from({ length: 400 }, (_, i) => i * 0.037)

describe('movimento do Octocat', () => {
  it('flutua pouco', () => {
    for (const t of times) {
      const { y, roll } = hoverOffset(t)
      expect(Math.abs(y)).toBeLessThanOrEqual(0.06)
      expect(Math.abs(roll)).toBeLessThanOrEqual(0.03)
    }
  })

  it('o aceno fica dentro da amplitude', () => {
    for (const t of times) expect(Math.abs(waveAngle(t))).toBeLessThanOrEqual(WAVE_AMPLITUDE)
  })

  it('o propulsor apaga no nível 0 e tremula em volta do nível', () => {
    expect(thrusterScale(1.23, 0)).toBe(0)
    for (const t of times) {
      const s = thrusterScale(t, 1)
      expect(s).toBeGreaterThan(0.75)
      expect(s).toBeLessThan(1.25)
    }
  })

  it('pisca por um instante a cada BLINK_EVERY segundos', () => {
    expect(isBlinking(0.1)).toBe(true)
    expect(isBlinking(1)).toBe(false)
    expect(isBlinking(BLINK_EVERY + 0.05)).toBe(true)
    expect(times.filter(isBlinking).length / times.length).toBeLessThan(0.1)
  })
})
