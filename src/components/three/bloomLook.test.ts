import { describe, expect, it } from 'vitest'
import { BLOOM_LOOK, bloomLook, useBloom } from '@/store/bloom'
import { applyBloomLook } from './bloomLook'
import { ATMOSPHERE_MATERIAL } from './geometries'

describe('visual com bloom: um só interruptor', () => {
  it('liga: atmosfera e store mudam juntos; desliga: volta ao visual sem bloom', () => {
    expect(ATMOSPHERE_MATERIAL.opacity).toBe(BLOOM_LOOK.plain.atmosphere)
    applyBloomLook(true)
    expect(useBloom.getState().active).toBe(true)
    expect(ATMOSPHERE_MATERIAL.opacity).toBe(BLOOM_LOOK.bloom.atmosphere)
    applyBloomLook(false)
    expect(useBloom.getState().active).toBe(false)
    expect(ATMOSPHERE_MATERIAL.opacity).toBe(BLOOM_LOOK.plain.atmosphere)
  })

  it('com bloom tudo que é transparente fica mais fraco; o objeto é constante (nada alocado por frame)', () => {
    expect(BLOOM_LOOK.bloom.orbit).toBeLessThan(BLOOM_LOOK.plain.orbit)
    expect(BLOOM_LOOK.bloom.atmosphere).toBeLessThan(BLOOM_LOOK.plain.atmosphere)
    expect(BLOOM_LOOK.bloom.halo).toBeLessThan(BLOOM_LOOK.plain.halo)
    expect(bloomLook(true)).toBe(bloomLook(true))
  })
})
