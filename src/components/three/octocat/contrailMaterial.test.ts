import { describe, expect, it } from 'vitest'
import { CONTRAIL_CAPACITY, CONTRAIL_HALF_WIDTH, CONTRAIL_SAMPLE_INTERVAL, CONTRAIL_SECONDS, contrailHalfWidth, easeContrail } from './contrailMaterial'
import { TRAIL_HALF_WIDTH } from './trailMaterial'

describe('rastro de vapor das asas', () => {
  it('dura entre 1,5 e 2 s e cabe no anel com folga', () => {
    expect(CONTRAIL_SECONDS).toBeGreaterThanOrEqual(1.5)
    expect(CONTRAIL_SECONDS).toBeLessThanOrEqual(2)
    expect(CONTRAIL_CAPACITY).toBeGreaterThan(CONTRAIL_SECONDS / CONTRAIL_SAMPLE_INTERVAL)
  })

  it('fino (bem mais que o fogo) e alargando um pouco com a idade', () => {
    expect(contrailHalfWidth(0)).toBe(CONTRAIL_HALF_WIDTH)
    expect(CONTRAIL_HALF_WIDTH).toBeLessThan(0.3 * TRAIL_HALF_WIDTH)
    let prev = 0
    for (let i = 0; i <= 20; i++) {
      const w = contrailHalfWidth(i / 20)
      expect(w).toBeGreaterThan(prev)
      prev = w
    }
    expect(contrailHalfWidth(1)).toBeLessThan(3 * CONTRAIL_HALF_WIDTH)
    expect(contrailHalfWidth(5)).toBe(contrailHalfWidth(1))
    expect(contrailHalfWidth(Number.NaN)).toBe(CONTRAIL_HALF_WIDTH)
  })

  it('emissão: acende devagar na planagem, corta rápido na queima de chegada', () => {
    let e = 0
    let t = 0
    while (e < 0.95) {
      e = easeContrail(e, true, 1 / 60)
      t += 1 / 60
    }
    expect(t).toBeGreaterThan(0.4)
    expect(t).toBeLessThan(1)
    let off = 0
    while (e > 0) {
      e = easeContrail(e, false, 1 / 60)
      off += 1 / 60
    }
    expect(off).toBeLessThan(0.5)
    expect(easeContrail(0.4, true, 0)).toBe(0.4)
    expect(easeContrail(0, false, 1 / 60)).toBe(0)
  })
})
