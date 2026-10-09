import { describe, expect, it } from 'vitest'
import { seededRandom } from '../universe/random'
import { METEOR_CAP, meteorFade, newMeteorPool, spawnMeteor, stepMeteors } from './meteors'

describe('chuva de estrelas: pool de meteoros', () => {
  it('nasce vazio, com capacidade fixa', () => {
    const pool = newMeteorPool()
    expect(pool.cap).toBe(METEOR_CAP)
    expect(METEOR_CAP).toBeLessThanOrEqual(60)
    expect(pool.count).toBe(0)
  })

  it('spawn ocupa uma vaga livre até o teto; cheio, devolve −1', () => {
    const pool = newMeteorPool(4)
    const rng = seededRandom('m')
    expect([0, 1, 2, 3].map(() => spawnMeteor(pool, rng))).toEqual([0, 1, 2, 3])
    expect(pool.count).toBe(4)
    expect(spawnMeteor(pool, rng)).toBe(-1)
    expect(pool.count).toBe(4)
  })

  it('cada meteoro cruza o céu de cima para baixo, com vida e rastro positivos', () => {
    const pool = newMeteorPool(30)
    const rng = seededRandom('m')
    for (let i = 0; i < 30; i++) {
      const k = spawnMeteor(pool, rng)
      expect(pool.vy[k]).toBeLessThan(0)
      expect(pool.life[k]).toBeGreaterThan(0)
      expect(pool.length[k]).toBeGreaterThan(0)
    }
  })

  it('aposenta quem passou da vida e recicla a vaga', () => {
    const pool = newMeteorPool(2)
    const rng = seededRandom('m')
    spawnMeteor(pool, rng)
    spawnMeteor(pool, rng)
    for (let i = 0; i < 30; i++) stepMeteors(pool, 0.1, 0, rng)
    expect(pool.count).toBe(0)
    expect(pool.active[0]).toBe(0)
    expect(spawnMeteor(pool, rng)).toBe(0)
  })

  it('o ritmo de nascimento segue a taxa, e nunca passa do teto', () => {
    const pool = newMeteorPool()
    const rng = seededRandom('m')
    let peak = 0
    for (let i = 0; i < 600; i++) {
      stepMeteors(pool, 1 / 60, 500, rng)
      peak = Math.max(peak, pool.count)
    }
    expect(peak).toBe(METEOR_CAP)
    const calm = newMeteorPool()
    for (let i = 0; i < 600; i++) stepMeteors(calm, 1 / 60, 0, rng)
    expect(calm.spawned).toBe(0)
    const steady = newMeteorPool()
    for (let i = 0; i < 600; i++) stepMeteors(steady, 1 / 60, 10, rng)
    expect(steady.spawned).toBeGreaterThanOrEqual(98)
    expect(steady.spawned).toBeLessThanOrEqual(101)
  })

  it('um quadro enorme (aba voltando) não despeja uma rajada', () => {
    const pool = newMeteorPool()
    stepMeteors(pool, 30, 20, seededRandom('m'))
    expect(pool.count).toBeLessThanOrEqual(3)
  })

  it('não aloca: os mesmos arrays a vida toda', () => {
    const pool = newMeteorPool()
    const arrays = [pool.active, pool.age, pool.life, pool.x, pool.y, pool.vx, pool.vy, pool.length, pool.depth]
    const rng = seededRandom('m')
    for (let i = 0; i < 300; i++) stepMeteors(pool, 1 / 60, 40, rng)
    expect([pool.active, pool.age, pool.life, pool.x, pool.y, pool.vx, pool.vy, pool.length, pool.depth]).toEqual(arrays)
    arrays.forEach((a, i) => expect(a).toBe([pool.active, pool.age, pool.life, pool.x, pool.y, pool.vx, pool.vy, pool.length, pool.depth][i]))
  })

  it('o brilho acende rápido e apaga no fim da vida', () => {
    expect(meteorFade(0, 1)).toBe(0)
    expect(meteorFade(0.1, 1)).toBeGreaterThan(0.6)
    expect(meteorFade(0.5, 1)).toBe(1)
    expect(meteorFade(1, 1)).toBe(0)
    expect(meteorFade(2, 1)).toBe(0)
  })
})
