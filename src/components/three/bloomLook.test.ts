import { describe, expect, it } from 'vitest'
import { BLOOM_LOOK, bloomLook, useBloom } from '@/store/bloom'
import { applyBloomLook } from './bloomLook'
import { DUST_MATERIAL, ION_MATERIAL } from './cometLook'
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

  it('com bloom o que é transparente fica mais fraco (menos o brilho e a névoa do sol: ver sunMaterial.test); o objeto é constante (nada alocado por frame)', () => {
    expect(BLOOM_LOOK.bloom.orbit).toBeLessThan(BLOOM_LOOK.plain.orbit)
    expect(BLOOM_LOOK.bloom.atmosphere).toBeLessThan(BLOOM_LOOK.plain.atmosphere)
    expect(BLOOM_LOOK.bloom.ionTail).toBeLessThan(BLOOM_LOOK.plain.ionTail)
    expect(BLOOM_LOOK.bloom.dustTail).toBeLessThan(BLOOM_LOOK.plain.dustTail)
    expect(BLOOM_LOOK.bloom.coma).toBeLessThan(BLOOM_LOOK.plain.coma)
    expect(bloomLook(true)).toBe(bloomLook(true))
  })

  it('caudas dos cometas (materiais compartilhados) seguem o mesmo interruptor', () => {
    expect(ION_MATERIAL.opacity).toBe(BLOOM_LOOK.plain.ionTail)
    expect(DUST_MATERIAL.opacity).toBe(BLOOM_LOOK.plain.dustTail)
    applyBloomLook(true)
    expect(ION_MATERIAL.opacity).toBe(BLOOM_LOOK.bloom.ionTail)
    expect(DUST_MATERIAL.opacity).toBe(BLOOM_LOOK.bloom.dustTail)
    applyBloomLook(false)
    expect(ION_MATERIAL.opacity).toBe(BLOOM_LOOK.plain.ionTail)
    expect(DUST_MATERIAL.opacity).toBe(BLOOM_LOOK.plain.dustTail)
  })

  it('rastro da nave (aditivo): sem bloom fica como desenhado (1); com bloom, mais fraco', () => {
    expect(BLOOM_LOOK.plain.trail).toBe(1)
    expect(BLOOM_LOOK.bloom.trail).toBeLessThan(BLOOM_LOOK.plain.trail)
    expect(BLOOM_LOOK.bloom.trail).toBeGreaterThan(0)
    expect(bloomLook(true).trail).toBe(BLOOM_LOOK.bloom.trail)
    expect(bloomLook(false).trail).toBe(BLOOM_LOOK.plain.trail)
  })

  it('sem bloom, o cometa fica como foi aprovado (íons 0,9, poeira 0,55, coma 0,6)', () => {
    expect([BLOOM_LOOK.plain.ionTail, BLOOM_LOOK.plain.dustTail, BLOOM_LOOK.plain.coma]).toEqual([0.9, 0.55, 0.6])
  })
})
