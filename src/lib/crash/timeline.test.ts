import { describe, expect, it } from 'vitest'
import {
  CRASH_LINE_AT,
  crackHeal,
  crashFlash,
  crashShake,
  dazedStars,
  DAZED_FADE,
  DAZED_SPIN,
  FLASH_PEAK,
  FLASH_SECONDS,
  HEAL_END,
  HEAL_START,
  SHAKE_AMPLITUDE,
  SHAKE_SECONDS,
} from './timeline'

describe('linha do tempo da trombada (s desde o impacto)', () => {
  it('um clarão só, curto (~60 ms) e fraco', () => {
    expect(FLASH_SECONDS).toBeCloseTo(0.06)
    expect(FLASH_PEAK).toBeLessThanOrEqual(0.4)
    expect(crashFlash(-0.01)).toBe(0)
    expect(crashFlash(0)).toBeCloseTo(FLASH_PEAK)
    expect(crashFlash(0.03)).toBeLessThan(FLASH_PEAK)
    expect(crashFlash(FLASH_SECONDS)).toBe(0)
    // nunca acende de novo (menos de 3 clarões por segundo: só um)
    for (let t = FLASH_SECONDS; t < 5; t += 0.01) expect(crashFlash(t)).toBe(0)
  })

  it('a tela treme 250–350 ms, começando em 6–10 px e caindo exponencialmente', () => {
    expect(SHAKE_SECONDS).toBeGreaterThanOrEqual(0.25)
    expect(SHAKE_SECONDS).toBeLessThanOrEqual(0.35)
    expect(SHAKE_AMPLITUDE).toBeGreaterThanOrEqual(6)
    expect(SHAKE_AMPLITUDE).toBeLessThanOrEqual(10)
    const peak = (a: number, b: number) => {
      let m = 0
      for (let t = a; t < b; t += 0.001) {
        const s = crashShake(t)
        m = Math.max(m, Math.hypot(s.x, s.y))
      }
      return m
    }
    expect(peak(0, 0.05)).toBeGreaterThan(5)
    expect(peak(0, SHAKE_SECONDS)).toBeLessThanOrEqual(SHAKE_AMPLITUDE * Math.SQRT2 + 1e-9)
    expect(peak(0.15, 0.2)).toBeLessThan(peak(0, 0.05) / 3)
    expect(crashShake(-0.01)).toEqual({ x: 0, y: 0 })
    expect(crashShake(SHAKE_SECONDS)).toEqual({ x: 0, y: 0 })
    // escreve no `out` sem alocar
    const out = { x: 9, y: 9 }
    expect(crashShake(0.01, out)).toBe(out)
  })

  it('as rachaduras ficam um instante e somem aos poucos em ~1,5–2,5 s', () => {
    expect(HEAL_END - HEAL_START).toBeGreaterThanOrEqual(1.5)
    expect(HEAL_END).toBeLessThanOrEqual(2.5)
    expect(crackHeal(0)).toBe(0)
    expect(crackHeal(HEAL_START)).toBe(0)
    const mid = crackHeal((HEAL_START + HEAL_END) / 2)
    expect(mid).toBeGreaterThan(0.3)
    expect(mid).toBeLessThan(0.7)
    expect(crackHeal(HEAL_END)).toBe(1)
    let last = 0
    for (let t = 0; t <= HEAL_END; t += 0.05) {
      expect(crackHeal(t)).toBeGreaterThanOrEqual(last)
      last = crackHeal(t)
    }
  })

  it('estrelinhas giram ~2,5 s e depois somem', () => {
    expect(DAZED_SPIN).toBeCloseTo(2.5)
    expect(dazedStars(0).opacity).toBe(1)
    expect(dazedStars(DAZED_SPIN - 0.01).opacity).toBe(1)
    expect(dazedStars(DAZED_SPIN + DAZED_FADE / 2).opacity).toBeGreaterThan(0)
    expect(dazedStars(DAZED_SPIN + DAZED_FADE / 2).opacity).toBeLessThan(1)
    expect(dazedStars(DAZED_SPIN + DAZED_FADE).opacity).toBe(0)
    expect(dazedStars(1).angle).toBeGreaterThan(dazedStars(0.5).angle)
  })

  it('a fala vem depois que as estrelas somem (e depois das rachaduras)', () => {
    expect(CRASH_LINE_AT).toBeGreaterThanOrEqual(DAZED_SPIN + DAZED_FADE)
    expect(CRASH_LINE_AT).toBeGreaterThanOrEqual(HEAL_END)
  })
})
