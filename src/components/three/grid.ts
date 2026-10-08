import { GRID_DAYS, GRID_WEEKS, maxCount } from '@/lib/universe/activity'

export const CELL_PX = 16
export const TEX_W = GRID_WEEKS * CELL_PX // 832
/** Equiretangular 2:1: 52 colunas em 360° → ~6,9° por célula, quadrada na esfera. */
export const TEX_H = TEX_W / 2 // 416
export const GRID_Y0 = (TEX_H - GRID_DAYS * CELL_PX) / 2 // 152
/** Azul-ardósia claro o bastante para o planeta destacar do fundo do espaço. */
export const PLANET_BASE = '#3a5288'
export const CELL_COLOR = '#10b981'
/** Dia sem commits: quadradinho escuro, como a célula vazia do GitHub no tema escuro. */
export const EMPTY_CELL = '#161b2e'

export function cellFromUv(u: number, v: number): { week: number; day: number } | null {
  const week = Math.floor((u * TEX_W) / CELL_PX)
  const day = Math.floor(((1 - v) * TEX_H - GRID_Y0) / CELL_PX)
  if (week < 0 || week >= GRID_WEEKS || day < 0 || day >= GRID_DAYS) return null
  return { week, day }
}

export function cellAlpha(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0.08
  return 0.3 + 0.7 * Math.min(1, count / max)
}

export interface GridContext {
  fillStyle: string | CanvasGradient | CanvasPattern
  globalAlpha: number
  fillRect(x: number, y: number, w: number, h: number): void
}

export function drawActivityGrid(ctx: GridContext, weeks: number[][]): void {
  const max = maxCount(weeks)
  ctx.globalAlpha = 1
  ctx.fillStyle = PLANET_BASE
  ctx.fillRect(0, 0, TEX_W, TEX_H)
  for (let w = 0; w < GRID_WEEKS; w++) {
    for (let d = 0; d < GRID_DAYS; d++) {
      const empty = weeks[w][d] <= 0 || max <= 0
      ctx.fillStyle = empty ? EMPTY_CELL : CELL_COLOR
      ctx.globalAlpha = empty ? 0.85 : cellAlpha(weeks[w][d], max)
      ctx.fillRect(w * CELL_PX + 2, GRID_Y0 + d * CELL_PX + 2, CELL_PX - 4, CELL_PX - 4)
    }
  }
  ctx.globalAlpha = 1
}
