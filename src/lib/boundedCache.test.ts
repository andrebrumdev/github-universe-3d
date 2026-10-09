import { describe, expect, it } from 'vitest'
import { BoundedCache } from './boundedCache'

describe('BoundedCache', () => {
  it('guarda no máximo `limit` entradas, por mais chaves que cheguem', () => {
    const cache = new BoundedCache<string, number>(4)
    for (let i = 0; i < 1000; i++) cache.set(`k${i}`, i)
    expect(cache.size).toBe(4)
    expect(cache.get('k999')).toBe(999)
    expect(cache.get('k0')).toBeUndefined()
  })

  it('a menos usada recentemente sai primeiro: ler uma chave a mantém', () => {
    const cache = new BoundedCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    expect(cache.get('a')).toBe(1)
    cache.set('c', 3)
    expect(cache.get('a')).toBe(1)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBe(3)
  })

  it('regravar uma chave troca o valor sem ocupar outra vaga', () => {
    const cache = new BoundedCache<string, number>(2)
    cache.set('a', 1)
    cache.set('a', 2)
    cache.set('b', 3)
    expect(cache.size).toBe(2)
    expect(cache.get('a')).toBe(2)
  })
})
