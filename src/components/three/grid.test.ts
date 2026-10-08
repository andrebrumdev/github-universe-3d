import { describe, expect, it } from 'vitest'
import { emptyWeeks } from '@/lib/universe/activity'
import {
  CELL_GAP,
  CELL_PX,
  cellAlpha,
  cellFromUv,
  drawActivityGrid,
  POLAR_CAP_DEG,
  POLAR_CAP_PX,
  rowTop,
  TEX_H,
  TEX_W,
} from './grid'

const vOfY = (y: number) => 1 - y / TEX_H
const vOfRow = (row: number) => vOfY((rowTop(row) + rowTop(row + 1)) / 2)
const uOfWeek = (week: number) => (week * CELL_PX + CELL_PX / 2) / TEX_W

function drawEmpty() {
  const rects: number[][] = []
  const ctx = { fillStyle: '', globalAlpha: 1, fillRect: (...r: number[]) => rects.push(r) }
  drawActivityGrid(ctx, emptyWeeks())
  return { rects, ctx }
}

describe('textura 2:1 com a grade de polo a polo', () => {
  it('proporção equiretangular 2:1, 52 colunas inteiras', () => {
    expect(TEX_W).toBe(52 * CELL_PX)
    expect(TEX_H * 2).toBe(TEX_W)
  })

  it('7 faixas de latitude cobrem tudo entre as calotas polares', () => {
    expect(POLAR_CAP_DEG).toBeGreaterThanOrEqual(6)
    expect(POLAR_CAP_DEG).toBeLessThanOrEqual(8)
    expect(rowTop(0)).toBe(POLAR_CAP_PX)
    expect(rowTop(7)).toBe(TEX_H - POLAR_CAP_PX)
    for (let d = 0; d < 7; d++) {
      const h = rowTop(d + 1) - rowTop(d)
      expect(Number.isInteger(rowTop(d))).toBe(true)
      expect(Math.abs(h - (TEX_H - 2 * POLAR_CAP_PX) / 7)).toBeLessThan(1)
    }
  })

  it('cellFromUv acha semana e dia nas linhas junto às calotas', () => {
    expect(cellFromUv(uOfWeek(10), vOfRow(0))).toEqual({ week: 10, day: 0 })
    expect(cellFromUv(uOfWeek(10), vOfRow(6))).toEqual({ week: 10, day: 6 })
    // logo abaixo da calota norte e logo acima da calota sul
    expect(cellFromUv(0.5, vOfY(POLAR_CAP_PX + 0.5))).toEqual({ week: 26, day: 0 })
    expect(cellFromUv(0.5, vOfY(TEX_H - POLAR_CAP_PX - 0.5))).toEqual({ week: 26, day: 6 })
  })

  it('colunas da emenda: 0 e 51 nas pontas de u, e u = 1 volta para a coluna 0', () => {
    expect(cellFromUv(uOfWeek(0), vOfRow(3))).toEqual({ week: 0, day: 3 })
    expect(cellFromUv(uOfWeek(51), vOfRow(3))).toEqual({ week: 51, day: 3 })
    expect(cellFromUv(0.001, vOfRow(3))).toEqual({ week: 0, day: 3 })
    expect(cellFromUv(0.999, vOfRow(3))).toEqual({ week: 51, day: 3 })
    expect(cellFromUv(1, vOfRow(3))).toEqual({ week: 0, day: 3 })
  })

  it('dentro de uma calota polar não tem célula', () => {
    expect(cellFromUv(0.5, 1)).toBeNull()
    expect(cellFromUv(0.5, 0)).toBeNull()
    expect(cellFromUv(0.5, vOfY(POLAR_CAP_PX / 2))).toBeNull()
    expect(cellFromUv(0.5, vOfY(TEX_H - POLAR_CAP_PX / 2))).toBeNull()
  })

  it('opacidade: célula vazia quase invisível, cheia opaca', () => {
    expect(cellAlpha(0, 10)).toBeCloseTo(0.08)
    expect(cellAlpha(10, 10)).toBe(1)
    expect(cellAlpha(5, 10)).toBeGreaterThan(cellAlpha(1, 10))
  })

  it('desenha o fundo e as 364 células em pixels inteiros', () => {
    const { rects, ctx } = drawEmpty()
    expect(rects).toHaveLength(1 + 52 * 7)
    expect(rects[0]).toEqual([0, 0, TEX_W, TEX_H])
    expect(ctx.globalAlpha).toBe(1)
    for (const r of rects) for (const n of r) expect(Number.isInteger(n)).toBe(true)
  })

  it('sem emenda: a folga entre a coluna 51 e a 0 (dando a volta) é igual à das outras', () => {
    const cells = drawEmpty().rects.slice(1)
    const first = cells[0] // semana 0, dia 0
    const second = cells[7] // semana 1, dia 0
    const last = cells[51 * 7] // semana 51, dia 0
    const gap = second[0] - (first[0] + first[2])
    expect(gap).toBe(CELL_GAP)
    expect(TEX_W - (last[0] + last[2]) + first[0]).toBe(gap)
  })

  it('folga vertical igual à horizontal e grade dentro das calotas', () => {
    const cells = drawEmpty().rects.slice(1)
    for (let d = 0; d < 6; d++) expect(cells[d + 1][1] - (cells[d][1] + cells[d][3])).toBe(CELL_GAP)
    expect(cells[0][1]).toBe(POLAR_CAP_PX + CELL_GAP / 2)
    expect(cells[6][1] + cells[6][3]).toBe(TEX_H - POLAR_CAP_PX - CELL_GAP / 2)
  })
})
