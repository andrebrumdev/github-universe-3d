import { describe, expect, it } from 'vitest'
import { emptyWeeks } from '@/lib/universe/activity'
import {
  CELL_GAP,
  cellAlpha,
  cellFromUv,
  cellRect,
  COL_PX,
  drawActivityGrid,
  drawGlowGrid,
  GLOW_BACKGROUND,
  GLOW_CELL,
  GRID_COLS,
  GRID_ROWS,
  POLAR_CAP_DEG,
  POLAR_CAP_PX,
  rowTop,
  TEX_H,
  TEX_W,
} from './grid'

/** uv do centro da célula desenhada para (semana, dia). */
function uvOf(week: number, day: number): [number, number] {
  const [x, y, w, h] = cellRect(week, day)
  return [(x + w / 2) / TEX_W, 1 - (y + h / 2) / TEX_H]
}
const vOfY = (y: number) => 1 - y / TEX_H

function drawEmpty() {
  const rects: number[][] = []
  const ctx = { fillStyle: '', globalAlpha: 1, fillRect: (...r: number[]) => rects.push(r) }
  drawActivityGrid(ctx, emptyWeeks())
  return { rects, ctx }
}

describe('textura 2:1 com a grade em dois hemisférios (26×14)', () => {
  it('proporção equiretangular 2:1, 26 colunas inteiras', () => {
    expect(GRID_COLS).toBe(26)
    expect(GRID_ROWS).toBe(14)
    expect(COL_PX).toBe(TEX_W / 26)
    expect(Number.isInteger(COL_PX)).toBe(true)
    expect(TEX_H * 2).toBe(TEX_W)
  })

  it('14 faixas de latitude cobrem tudo entre as calotas polares', () => {
    expect(POLAR_CAP_DEG).toBeGreaterThanOrEqual(6)
    expect(POLAR_CAP_DEG).toBeLessThanOrEqual(8)
    expect(rowTop(0)).toBe(POLAR_CAP_PX)
    expect(rowTop(GRID_ROWS)).toBe(TEX_H - POLAR_CAP_PX)
    for (let r = 0; r < GRID_ROWS; r++) {
      expect(Number.isInteger(rowTop(r))).toBe(true)
      expect(Math.abs(rowTop(r + 1) - rowTop(r) - (TEX_H - 2 * POLAR_CAP_PX) / GRID_ROWS)).toBeLessThan(1)
    }
  })

  it('células quase quadradas no equador (em graus na esfera)', () => {
    const lonDeg = (COL_PX / TEX_W) * 360
    const latDeg = ((rowTop(8) - rowTop(7)) / TEX_H) * 180
    expect(lonDeg / latDeg).toBeGreaterThan(0.85)
    expect(lonDeg / latDeg).toBeLessThan(1.25)
  })

  it('hemisfério norte: semanas 0–25; sul: semanas 26–51', () => {
    expect(cellFromUv(...uvOf(0, 0))).toEqual({ week: 0, day: 0 })
    expect(cellFromUv(...uvOf(25, 6))).toEqual({ week: 25, day: 6 })
    expect(cellFromUv(...uvOf(26, 0))).toEqual({ week: 26, day: 0 })
    expect(cellFromUv(...uvOf(51, 6))).toEqual({ week: 51, day: 6 })
    // posição: semana 0 no canto norte-oeste, semana 26 logo abaixo do equador na mesma coluna
    expect(cellRect(0, 0)[0]).toBe(cellRect(26, 0)[0])
    expect(cellRect(0, 0)[1]).toBeLessThan(TEX_H / 2)
    expect(cellRect(26, 0)[1]).toBeGreaterThanOrEqual(TEX_H / 2)
  })

  it('ida e volta: o centro de cada uma das 364 células volta para a mesma semana e dia', () => {
    for (let week = 0; week < 52; week++) {
      for (let day = 0; day < 7; day++) expect(cellFromUv(...uvOf(week, day))).toEqual({ week, day })
    }
  })

  it('colunas da emenda: u ≈ 0 e u ≈ 1 nas colunas 0 e 25, e u = 1 volta para a coluna 0', () => {
    const vNorth = uvOf(0, 3)[1]
    const vSouth = uvOf(26, 3)[1]
    expect(cellFromUv(0.001, vNorth)).toEqual({ week: 0, day: 3 })
    expect(cellFromUv(0.999, vNorth)).toEqual({ week: 25, day: 3 })
    expect(cellFromUv(0.001, vSouth)).toEqual({ week: 26, day: 3 })
    expect(cellFromUv(0.999, vSouth)).toEqual({ week: 51, day: 3 })
    expect(cellFromUv(1, vNorth)).toEqual({ week: 0, day: 3 })
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

  it('sem emenda: a folga entre a última coluna e a primeira (dando a volta) é igual à das outras', () => {
    const first = cellRect(0, 0)
    const second = cellRect(1, 0)
    const last = cellRect(25, 0)
    const gap = second[0] - (first[0] + first[2])
    expect(gap).toBe(CELL_GAP)
    expect(TEX_W - (last[0] + last[2]) + first[0]).toBe(gap)
  })

  it('folga vertical igual à horizontal, inclusive no equador, e grade dentro das calotas', () => {
    const column = [0, 1, 2, 3, 4, 5, 6].map((d) => cellRect(0, d)).concat([0, 1, 2, 3, 4, 5, 6].map((d) => cellRect(26, d)))
    for (let r = 0; r < GRID_ROWS - 1; r++) expect(column[r + 1][1] - (column[r][1] + column[r][3])).toBe(CELL_GAP)
    expect(column[0][1]).toBe(POLAR_CAP_PX + CELL_GAP / 2)
    expect(column[13][1] + column[13][3]).toBe(TEX_H - POLAR_CAP_PX - CELL_GAP / 2)
  })
})

/** Contexto falso que rasteriza (sem antialias) o brilho de cada pixel: 0 no preto, alpha na cor das células. */
function rasterGlow(weeks: number[][]) {
  const lit = new Float32Array(TEX_W * TEX_H)
  const fills: { style: string; alpha: number; rect: number[] }[] = []
  const ctx = {
    fillStyle: '' as string,
    globalAlpha: 1,
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ style: this.fillStyle, alpha: this.globalAlpha, rect: [x, y, w, h] })
      const value = this.fillStyle === GLOW_BACKGROUND ? 0 : this.globalAlpha
      for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) lit[py * TEX_W + px] = value
    },
  }
  drawGlowGrid(ctx, weeks)
  return { lit, fills, ctx }
}

describe('mapa de brilho (emissiveMap): só os quadrados verdes acendem', () => {
  it('sem atividade: tudo preto, nenhuma célula desenhada', () => {
    const { lit, fills, ctx } = rasterGlow(emptyWeeks())
    expect(fills).toEqual([{ style: GLOW_BACKGROUND, alpha: 1, rect: [0, 0, TEX_W, TEX_H] }])
    expect(lit.every((v) => v === 0)).toBe(true)
    expect(ctx.globalAlpha).toBe(1)
  })

  it('só os pixels das células ativas são não pretos, com o brilho de cellAlpha', () => {
    const weeks = emptyWeeks()
    weeks[0][0] = 1
    weeks[25][6] = 4
    weeks[26][3] = 10
    weeks[51][0] = 7
    const { lit, fills } = rasterGlow(weeks)
    const expected = new Float32Array(TEX_W * TEX_H)
    const active: [number, number][] = [
      [0, 0],
      [25, 6],
      [26, 3],
      [51, 0],
    ]
    for (const [w, d] of active) {
      const [x, y, cw, ch] = cellRect(w, d)
      for (let py = y; py < y + ch; py++) for (let px = x; px < x + cw; px++) expected[py * TEX_W + px] = cellAlpha(weeks[w][d], 10)
    }
    expect(Array.from(lit)).toEqual(Array.from(expected))
    // fundo + uma célula por dia com commit, todas na cor de brilho
    expect(fills).toHaveLength(1 + active.length)
    for (const f of fills.slice(1)) expect(f.style).toBe(GLOW_CELL)
  })

  it('dia mais movimentado brilha mais; mesmas células (e mesma grade) da textura de cor', () => {
    const weeks = emptyWeeks()
    weeks[3][2] = 2
    weeks[40][5] = 8
    const { fills } = rasterGlow(weeks)
    const byRect = new Map(fills.slice(1).map((f) => [f.rect.join(','), f.alpha]))
    expect(byRect.get(cellRect(40, 5).join(','))).toBeGreaterThan(byRect.get(cellRect(3, 2).join(','))!)
    expect(byRect.get(cellRect(40, 5).join(','))).toBe(1)
  })
})
