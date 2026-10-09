import { describe, expect, it } from 'vitest'
import { reservedRects, type Rect } from '../uiLayout'
import { DODGE_TRIGGER, dodgeBounds, fatigue, maxDodges, planDodge, pointerDistance, TIRED_AFTER, type DodgeInput } from './dodge'

const W = 1280
const H = 800
const BTN = { w: 132, h: 32 }
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

const input = (over: Partial<DodgeInput> = {}): DodgeInput => ({
  button: { x: 16, y: H - 16 - BTN.h, ...BTN },
  pointer: { x: 60, y: H - 70 },
  viewport: { width: W, height: H },
  reserved: reservedRects(W, H),
  dodges: 0,
  round: 0,
  ...over,
})

describe('pointerDistance', () => {
  it('é zero dentro do botão e a distância até a borda fora', () => {
    const b = { x: 100, y: 100, w: 50, h: 20 }
    expect(pointerDistance(b, { x: 120, y: 110 })).toBe(0)
    expect(pointerDistance(b, { x: 160, y: 110 })).toBe(10)
    expect(pointerDistance(b, { x: 153, y: 124 })).toBe(5)
  })
})

describe('planDodge', () => {
  it('longe do ponteiro, fica', () => {
    expect(planDodge(input({ pointer: { x: 600, y: 300 } })).kind).toBe('stay')
  })

  it('perto (≤ ~90 px), foge para longe do ponteiro e sai do raio dele', () => {
    const plan = planDodge(input())
    expect(plan.kind).toBe('move')
    const moved = { x: plan.x, y: plan.y, ...BTN }
    expect(pointerDistance(moved, input().pointer)).toBeGreaterThan(DODGE_TRIGGER * 0.9)
    expect(DODGE_TRIGGER).toBeGreaterThanOrEqual(80)
    expect(DODGE_TRIGGER).toBeLessThanOrEqual(100)
  })

  it('fica sempre dentro da tela e fora dos botões e cartões reservados, de qualquer lado que venha o ponteiro', () => {
    const screens: [number, number][] = [
      [1280, 800],
      [390, 844],
      [844, 390],
    ]
    for (const [w, h] of screens) {
      const reserved = reservedRects(w, h, { tutorial: true })
      const bounds = dodgeBounds({ width: w, height: h })
      for (let bx = 20; bx < w - 150; bx += 97) {
        for (let by = 20; by < h - 50; by += 83) {
          const button = { x: bx, y: by, ...BTN }
          if (reserved.some((r) => overlaps(r, button))) continue
          for (let a = 0; a < 8; a++) {
            const pointer = { x: bx + 66 + Math.cos(a) * 60, y: by + 16 + Math.sin(a) * 40 }
            for (let dodges = 0; dodges < 8; dodges++) {
              const plan = planDodge({ button, pointer, viewport: { width: w, height: h }, reserved, dodges, round: dodges % 3 })
              const r = { x: plan.x, y: plan.y, ...BTN }
              expect(r.x).toBeGreaterThanOrEqual(bounds.x - 1e-9)
              expect(r.y).toBeGreaterThanOrEqual(bounds.y - 1e-9)
              expect(r.x + r.w).toBeLessThanOrEqual(bounds.x + bounds.w + 1e-9)
              expect(r.y + r.h).toBeLessThanOrEqual(bounds.y + bounds.h + 1e-9)
              if (plan.kind === 'move') for (const z of reserved) expect(overlaps(r, z)).toBe(false)
            }
          }
        }
      }
    }
  })

  it('cansa: depois de TIRED_AFTER fugas, foge mais perto e mais devagar', () => {
    const fresh = planDodge(input({ dodges: 0 }))
    const tired = planDodge(input({ dodges: TIRED_AFTER + 1 }))
    expect(tired.kind).toBe('move')
    expect(tired.duration).toBeGreaterThan(fresh.duration)
    const start = input().button
    const hop = (p: { x: number; y: number }) => Math.hypot(p.x - start.x, p.y - start.y)
    expect(hop(tired)).toBeLessThan(hop(fresh))
    expect(fatigue(0, 0)).toBe(1)
    expect(fatigue(TIRED_AFTER + 1, 0)).toBeLessThan(1)
  })

  it('depois de maxDodges, desiste: fica parado e dá para pegar', () => {
    const plan = planDodge(input({ dodges: maxDodges(0) }))
    expect(plan.kind).toBe('give-up')
    expect({ x: plan.x, y: plan.y }).toEqual({ x: input().button.x, y: input().button.y })
    expect(maxDodges(0)).toBeGreaterThanOrEqual(3)
    expect(maxDodges(0)).toBeLessThanOrEqual(6)
  })

  it('encurralado (sem saída fora do raio): fica no lugar e se espreme', () => {
    // tela minúscula: não há lugar a mais de 90 px do ponteiro
    const plan = planDodge(input({ viewport: { width: 200, height: 120 }, reserved: [], button: { x: 30, y: 40, ...BTN }, pointer: { x: 100, y: 60 } }))
    expect(plan.kind).toBe('cornered')
    expect({ x: plan.x, y: plan.y }).toEqual({ x: 30, y: 40 })
  })

  it('na rodada seguinte foge mais vezes, e mais longe', () => {
    expect(maxDodges(1)).toBeGreaterThan(maxDodges(0))
    expect(fatigue(TIRED_AFTER + 1, 1)).toBeGreaterThan(fatigue(TIRED_AFTER + 1, 0))
  })

  it('a rodada esperta foge para o espaço aberto, não para o canto', () => {
    // botão no meio da borda de baixo, ponteiro vindo de cima: a esperta não cola na borda
    const base = input({ button: { x: 500, y: H - 60, ...BTN }, pointer: { x: 566, y: H - 110 } })
    const dumb = planDodge({ ...base, round: 0 })
    const smart = planDodge({ ...base, round: 2 })
    const edge = (p: { x: number; y: number }) => Math.min(p.x, W - p.x - BTN.w, p.y, H - p.y - BTN.h)
    expect(edge(smart)).toBeGreaterThanOrEqual(edge(dumb))
  })
})
