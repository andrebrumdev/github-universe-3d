import { describe, expect, it } from 'vitest'
import {
  BARREL_ROLL_SECONDS,
  barrelRollAngle,
  CLAWD_HOP_SECONDS,
  clawdHop,
  FIDGET_AFTER,
  newFidget,
  reactionFor,
  stepFidget,
} from './play'

describe('pulinho do Clawd', () => {
  it('parado fora do pulo, e de volta ao chão no fim', () => {
    for (const t of [-1, 0, CLAWD_HOP_SECONDS, CLAWD_HOP_SECONDS + 1]) expect(clawdHop(t)).toEqual({ lift: 0, squash: 1 })
  })

  it('agacha antes de pular, sobe esticado e amassa ao pousar', () => {
    const crouch = clawdHop(CLAWD_HOP_SECONDS * 0.12)
    expect(crouch.lift).toBe(0)
    expect(crouch.squash).toBeLessThan(0.9)
    let top = 0
    let stretched = false
    for (let t = 0; t < CLAWD_HOP_SECONDS; t += 0.01) {
      const h = clawdHop(t)
      top = Math.max(top, h.lift)
      if (h.lift > 0 && h.squash > 1) stretched = true
    }
    expect(top).toBeGreaterThan(0.2)
    expect(stretched).toBe(true)
    expect(clawdHop(CLAWD_HOP_SECONDS * 0.82).squash).toBeLessThan(1)
  })
})

describe('parafuso (toque duplo)', () => {
  it('dá uma volta inteira, começando e terminando parado', () => {
    expect(barrelRollAngle(0)).toBe(0)
    expect(barrelRollAngle(BARREL_ROLL_SECONDS)).toBeCloseTo(2 * Math.PI, 9)
    expect(barrelRollAngle(BARREL_ROLL_SECONDS * 3)).toBe(0)
    const early = barrelRollAngle(0.02) - barrelRollAngle(0.01)
    const mid = barrelRollAngle(BARREL_ROLL_SECONDS / 2 + 0.01) - barrelRollAngle(BARREL_ROLL_SECONDS / 2)
    expect(mid).toBeGreaterThan(early * 3)
  })
})

describe('reação a cada peça', () => {
  it('cabeça: sorteia uma expressão (feliz, piscadela, surpreso) e acena', () => {
    const seen = new Set(Array.from({ length: 30 }, (_, i) => reactionFor('head', false, () => i / 30).expression))
    expect([...seen].sort()).toEqual(['happy', 'surprised', 'wink'])
    expect(reactionFor('head', false, () => 0)).toMatchObject({ wave: true, lines: 'play' })
  })

  it('Clawd pula e o Octocat olha para cima; tentáculo balança e ele ri; bocal solta a chama', () => {
    expect(reactionFor('clawd', false, Math.random)).toMatchObject({ hop: true, lookUp: true })
    expect(reactionFor('tentacle:3', false, Math.random)).toMatchObject({ wiggle: 3, expression: 'happy', lines: 'giggle' })
    expect(reactionFor('nozzle', false, Math.random)).toMatchObject({ burst: true })
  })

  it('movimento reduzido: só expressão e fala, sem pulo, balanço, aceno nem chama', () => {
    for (const part of ['head', 'clawd', 'tentacle:1', 'nozzle', 'hull'] as const) {
      const r = reactionFor(part, true, () => 0.5)
      expect(r).toMatchObject({ hop: false, wiggle: null, burst: false, wave: false })
      expect(r.lines).not.toBeNull()
    }
  })
})

describe('parado no modo: olha para quem vê e se mexe um pouco', () => {
  it('antes de FIDGET_AFTER s sem entrada, nada', () => {
    const f = newFidget()
    stepFidget(f, FIDGET_AFTER - 0.1, 0.1, () => 0.5)
    expect(f.active).toBe(false)
  })

  it('depois, olha para a câmera e de vez em quando dá uma olhada em volta, voltando para a câmera', () => {
    const f = newFidget()
    const looks = new Set<string>()
    let idle = FIDGET_AFTER
    for (let i = 0; i < 1200; i++) {
      idle += 1 / 60
      stepFidget(f, idle, 1 / 60, () => (i % 7) / 7)
      looks.add(f.look === 'camera' ? 'camera' : 'around')
      if (f.look !== 'camera') {
        expect(Math.abs(f.look.x)).toBeLessThanOrEqual(1)
        expect(Math.abs(f.look.y)).toBeLessThanOrEqual(1)
      }
    }
    expect(f.active).toBe(true)
    expect(looks).toEqual(new Set(['camera', 'around']))
    stepFidget(f, 0, 1 / 60, () => 0.5)
    expect(f.active).toBe(false)
  })
})
