import { describe, expect, it } from 'vitest'
import { kickSquash, MAX_SQUASH, SQUASH_AT_REST, SQUASH_TARGET, squashScale, stepSquash, type Squash } from './squash'
import type { SunMode } from './sunMachine'

function run(s: Squash, mode: SunMode, seconds: number, dt: number): Squash[] {
  const trace: Squash[] = []
  let state = s
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    state = stepSquash(state, SQUASH_TARGET[mode], dt)
    trace.push(state)
  }
  return trace
}

const at = (trace: Squash[], dt: number, t: number) => trace[Math.round(t / dt) - 1]

describe('squash & stretch do sol', () => {
  it('parado no idle: nada muda e a escala é 1', () => {
    const last = run(SQUASH_AT_REST, 'idle', 1, 1 / 60).at(-1)!
    expect(last).toEqual(SQUASH_AT_REST)
    expect(squashScale(SQUASH_AT_REST)).toEqual([1, 1, 1])
  })

  it('clique: achata, passa do ponto (estica) e assenta', () => {
    const dt = 1 / 60
    const trace = run(kickSquash(SQUASH_AT_REST, 'click'), 'click', 2, dt)
    const stretch = trace.map((s) => s.stretch)
    const minAt = stretch.indexOf(Math.min(...stretch))
    const maxAt = stretch.indexOf(Math.max(...stretch))
    expect(stretch[minAt]).toBeLessThan(-0.08) // achata primeiro
    expect(stretch[maxAt]).toBeGreaterThan(0.02) // depois estica além do repouso
    expect(minAt).toBeLessThan(maxAt)
    expect(Math.abs(at(trace, dt, 1.5).stretch)).toBeLessThan(0.01) // assenta em ~1,5 s
    expect(Math.abs(trace.at(-1)!.vStretch)).toBeLessThan(0.05)
  })

  it('hover: um "puff" que incha e volta para um pouco maior que o repouso', () => {
    const dt = 1 / 60
    const trace = run(kickSquash(SQUASH_AT_REST, 'hover'), 'hover', 2, dt)
    const peak = Math.max(...trace.map((s) => s.puff))
    expect(peak).toBeGreaterThan(SQUASH_TARGET.hover.puff + 0.02)
    expect(trace.at(-1)!.puff).toBeCloseTo(SQUASH_TARGET.hover.puff, 2)
    expect(Math.abs(trace.at(-1)!.stretch)).toBeLessThan(1e-3)
  })

  it('away: murcha um pouco (mais baixo e mais largo)', () => {
    const last = run(kickSquash(SQUASH_AT_REST, 'away'), 'away', 3, 1 / 60).at(-1)!
    const [x, y, z] = squashScale(last)
    expect(y).toBeLessThan(1)
    expect(x).toBeGreaterThan(y)
    expect(z).toBe(x)
    expect(y).toBeGreaterThan(0.9)
  })

  it('limitado: cliques seguidos e passos enormes não explodem', () => {
    let s = SQUASH_AT_REST
    for (let i = 0; i < 20; i++) {
      s = kickSquash(s, 'click')
      s = stepSquash(s, SQUASH_TARGET.click, 0.02)
      expect(Math.abs(s.stretch)).toBeLessThanOrEqual(MAX_SQUASH)
      expect(Math.abs(s.puff)).toBeLessThanOrEqual(MAX_SQUASH)
    }
    s = stepSquash(kickSquash(SQUASH_AT_REST, 'click'), SQUASH_TARGET.idle, 10)
    expect(Number.isFinite(s.stretch)).toBe(true)
    expect(Math.abs(s.stretch)).toBeLessThanOrEqual(MAX_SQUASH)
  })

  it('independe da taxa de quadros: 30, 60 e 144 fps dão a mesma curva', () => {
    const ref = run(kickSquash(SQUASH_AT_REST, 'click'), 'click', 1.2, 1 / 240)
    for (const fps of [30, 60, 144]) {
      const dt = 1 / fps
      const trace = run(kickSquash(SQUASH_AT_REST, 'click'), 'click', 1.2, dt)
      for (const t of [0.1, 0.2, 0.4, 0.8, 1.2]) {
        expect(Math.abs(at(trace, dt, t).stretch - at(ref, 1 / 240, t).stretch)).toBeLessThan(0.01)
      }
    }
  })

  it('preserva o volume no stretch: x·y·z = (1 + puff)³', () => {
    const s: Squash = { puff: 0.03, vPuff: 0, stretch: -0.12, vStretch: 0 }
    const [x, y, z] = squashScale(s)
    expect(x * y * z).toBeCloseTo(1.03 ** 3, 10)
  })

  it('escreve no vetor de saída (nada alocado por quadro)', () => {
    const out: [number, number, number] = [0, 0, 0]
    expect(squashScale(SQUASH_AT_REST, out)).toBe(out)
  })
})
