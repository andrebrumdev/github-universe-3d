import { describe, expect, it } from 'vitest'
import { emptyWeeks } from '@/lib/universe/activity'
import { CELL_PX, cellAlpha, cellFromUv, drawActivityGrid, GRID_Y0, TEX_H, TEX_W } from './grid'

const vOfRow = (row: number) => 1 - (GRID_Y0 + row * CELL_PX + CELL_PX / 2) / TEX_H
const uOfWeek = (week: number) => (week * CELL_PX + CELL_PX / 2) / TEX_W

describe('textura 2:1 com a grade no equador', () => {
  it('proporção equiretangular mantém as células quadradas', () => {
    expect(TEX_W).toBe(832)
    expect(TEX_H).toBe(416)
    expect(GRID_Y0).toBe(152)
  })

  it('cellFromUv acha semana e dia', () => {
    expect(cellFromUv(uOfWeek(0), vOfRow(0))).toEqual({ week: 0, day: 0 })
    expect(cellFromUv(uOfWeek(51), vOfRow(6))).toEqual({ week: 51, day: 6 })
  })

  it('fora da faixa (polos) não tem célula', () => {
    expect(cellFromUv(0.5, 1)).toBeNull()
    expect(cellFromUv(0.5, 0)).toBeNull()
    expect(cellFromUv(1, 0.5)).toBeNull()
  })

  it('opacidade: célula vazia quase invisível, cheia opaca', () => {
    expect(cellAlpha(0, 10)).toBeCloseTo(0.08)
    expect(cellAlpha(10, 10)).toBe(1)
    expect(cellAlpha(5, 10)).toBeGreaterThan(cellAlpha(1, 10))
  })

  it('desenha o fundo e as 364 células', () => {
    const rects: number[][] = []
    const ctx = { fillStyle: '', globalAlpha: 1, fillRect: (...r: number[]) => rects.push(r) }
    drawActivityGrid(ctx, emptyWeeks())
    expect(rects).toHaveLength(1 + 52 * 7)
    expect(rects[0]).toEqual([0, 0, TEX_W, TEX_H])
    expect(ctx.globalAlpha).toBe(1)
  })
})
