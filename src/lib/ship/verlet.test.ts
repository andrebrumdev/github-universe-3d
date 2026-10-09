import { describe, expect, it } from 'vitest'
import {
  applyImpulse,
  createChain,
  maxRestDistance,
  resetChain,
  rotateChain,
  segmentLength,
  setRest,
  stepChain,
  type VerletChain,
  type VerletInput,
} from './verlet'

/** Arco de 6 nós no plano xy, raiz na origem: parecido com um tentáculo do piloto. */
const ARC: [number, number, number][] = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 5) * (Math.PI / 2)
  return [Math.sin(a), 1 - Math.cos(a), 0]
})

const still = (): VerletInput => ({ linear: [0, 0, 0], angular: [0, 0, 0] })
const restLengths = (chain: VerletChain) => Array.from({ length: chain.count - 1 }, (_, i) => segmentLength(chain, i, chain.rest))
const run = (chain: VerletChain, seconds: number, input = still(), dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) stepChain(chain, dt, input)
}
const finite = (chain: VerletChain) => chain.pos.every(Number.isFinite) && chain.prev.every(Number.isFinite)

describe('cadeia de Verlet', () => {
  it('nasce parada na pose de descanso', () => {
    const chain = createChain(ARC)
    expect(maxRestDistance(chain)).toBe(0)
    run(chain, 1)
    expect(maxRestDistance(chain)).toBeLessThan(1e-6)
  })

  it('mantém o comprimento dos segmentos sob aceleração forte', () => {
    const chain = createChain(ARC, { stiffness: 40 })
    const lengths = restLengths(chain)
    const input: VerletInput = { linear: [30, -20, 15], angular: [0, 0, 8] }
    for (let k = 0; k < 120; k++) {
      stepChain(chain, 1 / 60, input)
      lengths.forEach((l, i) => expect(Math.abs(segmentLength(chain, i) - l) / l).toBeLessThan(0.02))
    }
    // e a cadeia de fato se mexeu (não é o teste passando por ficar parada)
    expect(maxRestDistance(chain)).toBeGreaterThan(0.1)
  })

  it('volta ao descanso depois de um impulso', () => {
    const chain = createChain(ARC)
    applyImpulse(chain, 3, 2, -1)
    run(chain, 0.1)
    expect(maxRestDistance(chain)).toBeGreaterThan(0.05)
    run(chain, 4)
    expect(maxRestDistance(chain)).toBeLessThan(1e-3)
  })

  it('a raiz presa não sai do lugar', () => {
    const chain = createChain(ARC)
    applyImpulse(chain, 5, 5, 5)
    for (let k = 0; k < 200; k++) {
      stepChain(chain, 1 / 60, { linear: [Math.sin(k) * 40, 25, -10], angular: [3, 0, -2] })
      expect([chain.pos[0], chain.pos[1], chain.pos[2]]).toEqual([ARC[0][0], ARC[0][1], ARC[0][2]].map(Math.fround))
    }
  })

  it('outros nós presos (a ponta no manche) também ficam', () => {
    const chain = createChain(ARC, { pinned: [0, 4, 5] })
    applyImpulse(chain, 2, 2, 2)
    run(chain, 1, { linear: [20, 0, 0], angular: [0, 0, 0] })
    for (const i of [4, 5]) for (let k = 0; k < 3; k++) expect(chain.pos[i * 3 + k]).toBeCloseTo(ARC[i][k], 6)
  })

  it('fica estável com dt = 0,25 (aba que volta do segundo plano)', () => {
    const chain = createChain(ARC, { stiffness: 400 })
    applyImpulse(chain, 4, -3, 2)
    const lengths = restLengths(chain)
    for (let k = 0; k < 40; k++) {
      expect(stepChain(chain, 0.25, { linear: [10, 0, 0], angular: [0, 0, 0] })).toBeLessThanOrEqual(chain.maxSubsteps)
      // o tempo descartado não vira dívida (sem espiral de recuperação nos quadros seguintes)
      expect(chain.accumulator).toBeLessThanOrEqual(chain.step)
      expect(finite(chain)).toBe(true)
    }
    lengths.forEach((l, i) => expect(Math.abs(segmentLength(chain, i) - l) / l).toBeLessThan(0.02))
    run(chain, 5, still(), 0.25)
    expect(maxRestDistance(chain)).toBeLessThan(1e-3)
  })

  it('não depende da taxa de quadros: 1/30 ≈ 2 × 1/60', () => {
    const a = createChain(ARC)
    const b = createChain(ARC)
    applyImpulse(a, 2, 1, 0)
    applyImpulse(b, 2, 1, 0)
    const input: VerletInput = { linear: [3, -2, 1], angular: [0, 1, 0] }
    for (let k = 0; k < 45; k++) {
      stepChain(a, 1 / 30, input)
      stepChain(b, 1 / 60, input)
      stepChain(b, 1 / 60, input)
    }
    for (let i = 0; i < a.pos.length; i++) expect(a.pos[i]).toBeCloseTo(b.pos[i], 4)
  })

  it('a aceleração de fora empurra a cadeia ao contrário e a mola segura', () => {
    const chain = createChain(ARC, { stiffness: 100 })
    run(chain, 3, { linear: [0, -10, 0], angular: [0, 0, 0] })
    const tip = 5 * 3 + 1
    expect(chain.pos[tip]).toBeLessThan(chain.rest[tip])
    // deflexão limitada: a mola de descanso mantém a forma
    expect(maxRestDistance(chain)).toBeLessThan(0.3)
  })

  it('a gravidade opcional pendura a cadeia sem mola', () => {
    const chain = createChain(ARC, { stiffness: 0, gravity: [0, -9.8, 0], damping: 6 })
    run(chain, 6)
    // a ponta fica pendurada embaixo da raiz, a ~ comprimento total
    const total = restLengths(chain).reduce((s, l) => s + l, 0)
    expect(chain.pos[5 * 3 + 1]).toBeLessThan(-total * 0.9)
  })

  it('a pose de descanso pode andar (o aceno) e a cadeia segue com atraso', () => {
    const chain = createChain(ARC, { stiffness: 200 })
    // gira a pose de descanso 0,5 rad em z em torno da raiz
    const [c, s] = [Math.cos(0.5), Math.sin(0.5)]
    ARC.forEach(([x, y, z], i) => setRest(chain, i, c * x - s * y, s * x + c * y, z))
    stepChain(chain, 1 / 60, still())
    expect(maxRestDistance(chain)).toBeGreaterThan(0.1) // ainda atrás
    run(chain, 3)
    expect(maxRestDistance(chain)).toBeLessThan(1e-3)
  })

  it('girar o referencial deixa os nós para trás, e eles voltam', () => {
    const chain = createChain(ARC)
    const [c, s] = [Math.cos(0.2), Math.sin(0.2)]
    rotateChain(chain, [c, s, 0, -s, c, 0, 0, 0, 1])
    expect(maxRestDistance(chain)).toBeGreaterThan(0.1)
    expect(chain.pos[0]).toBe(chain.rest[0]) // a raiz presa não gira
    run(chain, 4)
    expect(maxRestDistance(chain)).toBeLessThan(1e-3)
  })

  it('resetChain volta ao descanso parado', () => {
    const chain = createChain(ARC)
    applyImpulse(chain, 3, 3, 3)
    run(chain, 0.2)
    resetChain(chain)
    expect(maxRestDistance(chain)).toBe(0)
    run(chain, 1)
    expect(maxRestDistance(chain)).toBeLessThan(1e-6)
  })
})
