import { describe, expect, it } from 'vitest'
import { COUNT_UP_MAX_MS, COUNT_UP_MIN_MS, countUpDuration, countUpValue } from './countUp'

describe('duração da contagem', () => {
  it('fica entre 700 e 1100 ms e cresce um pouco com a grandeza', () => {
    expect(COUNT_UP_MIN_MS).toBe(700)
    expect(COUNT_UP_MAX_MS).toBe(1100)
    expect(countUpDuration(1)).toBe(COUNT_UP_MIN_MS)
    expect(countUpDuration(10)).toBeGreaterThan(countUpDuration(1))
    expect(countUpDuration(1_000)).toBeGreaterThan(countUpDuration(10))
    expect(countUpDuration(1_000_000)).toBe(COUNT_UP_MAX_MS)
    expect(countUpDuration(5_000_000_000)).toBe(COUNT_UP_MAX_MS)
    for (const n of [1, 7, 42, 999, 12_345, 3_000_000]) {
      expect(countUpDuration(n)).toBeGreaterThanOrEqual(COUNT_UP_MIN_MS)
      expect(countUpDuration(n)).toBeLessThanOrEqual(COUNT_UP_MAX_MS)
    }
  })

  it('zero (ou valor inválido) não conta: aparece na hora', () => {
    expect(countUpDuration(0)).toBe(0)
    expect(countUpDuration(-3)).toBe(0)
    expect(countUpDuration(Number.NaN)).toBe(0)
  })
})

describe('valor da contagem no instante t', () => {
  it('começa em 0 e termina exatamente no valor', () => {
    const d = countUpDuration(1234)
    expect(countUpValue(1234, 0, d)).toBe(0)
    expect(countUpValue(1234, -50, d)).toBe(0)
    expect(countUpValue(1234, d, d)).toBe(1234)
    expect(countUpValue(1234, d + 500, d)).toBe(1234)
  })

  it('só inteiros, sem passar do valor nem voltar', () => {
    const target = 987
    const d = countUpDuration(target)
    let last = 0
    for (let t = 0; t <= d; t += 7) {
      const v = countUpValue(target, t, d)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(last)
      expect(v).toBeLessThanOrEqual(target)
      last = v
    }
  })

  it('desacelera: a primeira metade do tempo leva bem mais da metade do caminho', () => {
    const d = 1000
    expect(countUpValue(1000, 500, d)).toBeGreaterThan(800)
    expect(countUpValue(1000, 100, d)).toBeGreaterThan(200)
    // e ainda não chegou antes do fim
    expect(countUpValue(1000, 900, d)).toBeLessThan(1000)
  })

  it('zero fica zero; números grandes terminam exatos', () => {
    expect(countUpValue(0, 300, 0)).toBe(0)
    expect(countUpValue(0, 300, 900)).toBe(0)
    const big = 2_147_483_647
    const d = countUpDuration(big)
    expect(countUpValue(big, d, d)).toBe(big)
    const mid = countUpValue(big, d / 2, d)
    expect(Number.isInteger(mid)).toBe(true)
    expect(mid).toBeLessThan(big)
  })

  it('sem duração (movimento reduzido ou zero): o valor final na hora', () => {
    expect(countUpValue(52, 0, 0)).toBe(52)
  })
})
