import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { CLOUDS_PER_NOZZLE, FLASH_LIFE, PUFF_LIFE, PUFF_POOL, PuffPool, puffFade, puffGrowth } from './puffParticles'

const nozzle = new THREE.Vector3(0, 0, 0)
const forward = new THREE.Vector3(0, 0, 1)
const shipV = new THREE.Vector3(0, 0, 10)
const center = (p: PuffPool, i: number) => {
  const a = p.geometry.getAttribute('iCenter') as THREE.InstancedBufferAttribute
  return new THREE.Vector3(a.getX(i), a.getY(i), a.getZ(i))
}
const data = (p: PuffPool) => p.geometry.getAttribute('iData') as THREE.InstancedBufferAttribute

describe('puffs de ré', () => {
  it('cada puff: um clarão curto e algumas nuvens por bico', () => {
    const p = new PuffPool()
    p.burst(nozzle, forward, shipV, 1)
    p.update(1 / 60)
    expect(p.count).toBe(1 + CLOUDS_PER_NOZZLE)
    expect(p.geometry.instanceCount).toBe(p.count)
    // o clarão some antes das nuvens
    for (let i = 0; i < 20; i++) p.update(1 / 60)
    expect(FLASH_LIFE).toBeLessThan(0.25)
    expect(p.count).toBe(CLOUDS_PER_NOZZLE)
    // e as nuvens somem entre 0,6 e 0,9 s (mais a folga do sorteio)
    for (let i = 0; i < Math.ceil((PUFF_LIFE * 1.2 * 60)); i++) p.update(1 / 60)
    expect(p.count).toBe(0)
    p.dispose()
  })

  it('as nuvens saem para a frente, mais rápido que a nave, e freiam (a nave passa por elas)', () => {
    const p = new PuffPool()
    p.burst(nozzle, forward, shipV, 1)
    let shipZ = 0
    const dt = 1 / 60
    p.update(dt)
    shipZ += 10 * dt
    const first = center(p, 1).z
    expect(first).toBeGreaterThan(shipZ)
    let passed = false
    // a nave segue a 10 u/s (freando de verdade ela iria mais devagar ainda): as nuvens perdem velocidade
    for (let i = 0; i < 40; i++) {
      p.update(dt)
      shipZ += 10 * dt
      if (p.count > 0 && center(p, p.count - 1).z < shipZ) passed = true
    }
    expect(passed).toBe(true)
    p.dispose()
  })

  it('crescem e somem com a idade; força maior, nuvem maior', () => {
    expect(puffGrowth(0)).toBe(0)
    expect(puffGrowth(1)).toBe(1)
    expect(puffGrowth(0.5)).toBeGreaterThan(0.5)
    expect(puffFade(0)).toBe(0)
    expect(puffFade(1)).toBe(0)
    expect(puffFade(0.1)).toBeGreaterThan(0.7)
    const weak = new PuffPool()
    const strong = new PuffPool()
    weak.burst(nozzle, forward, shipV, 0.4)
    strong.burst(nozzle, forward, shipV, 1.5)
    for (let i = 0; i < 20; i++) {
      weak.update(1 / 60)
      strong.update(1 / 60)
    }
    expect(data(strong).getY(0)).toBeGreaterThan(data(weak).getY(0))
    weak.dispose()
    strong.dispose()
  })

  it('pool fixo: nada alocado por quadro, nunca passa do tamanho, clear esvazia', () => {
    const p = new PuffPool()
    const before = data(p).array
    for (let i = 0; i < 40; i++) p.burst(nozzle, forward, shipV, 1)
    p.update(1 / 60)
    expect(p.count).toBe(PUFF_POOL)
    expect(data(p).array).toBe(before)
    p.clear()
    expect(p.geometry.instanceCount).toBe(0)
    p.dispose()
  })
})
