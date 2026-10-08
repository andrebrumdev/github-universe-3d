import { GRID_DAYS, GRID_WEEKS, maxCount } from '@/lib/universe/activity'

/** Largura de uma coluna (semana): 52 meridianos dando a volta inteira, ~6,9° cada. */
export const CELL_PX = 16
export const TEX_W = GRID_WEEKS * CELL_PX // 832
/** Equiretangular 2:1 (360° × 180°). */
export const TEX_H = TEX_W / 2 // 416
/** Folga entre células, igual na horizontal, na vertical e na emenda u = 0/1. */
export const CELL_GAP = 4
/** Calotas polares na cor do planeta, onde sai o eixo: as células não viram fiapos no polo. */
export const POLAR_CAP_DEG = 7
export const POLAR_CAP_PX = Math.round((TEX_H * POLAR_CAP_DEG) / 180) // 16
/** Altura de cada uma das 7 faixas de latitude (dias), em px (fracionária; as bordas são arredondadas). */
export const ROW_H = (TEX_H - 2 * POLAR_CAP_PX) / GRID_DAYS

/** Borda superior (px inteiro) da faixa do dia `d`; rowTop(7) é o início da calota sul. */
export function rowTop(d: number): number {
  return POLAR_CAP_PX + Math.round(d * ROW_H)
}
/** Azul-ardósia claro o bastante para o planeta destacar do fundo do espaço. */
export const PLANET_BASE = '#3a5288'
export const CELL_COLOR = '#10b981'
/** Dia sem commits: quadradinho escuro, como a célula vazia do GitHub no tema escuro. */
export const EMPTY_CELL = '#161b2e'

export function cellFromUv(u: number, v: number): { week: number; day: number } | null {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null
  // A textura repete em u (a esfera dá a volta): u = 1 é o mesmo meridiano de u = 0.
  const week = ((Math.floor((u * TEX_W) / CELL_PX) % GRID_WEEKS) + GRID_WEEKS) % GRID_WEEKS
  const y = (1 - v) * TEX_H
  if (y < rowTop(0) || y >= rowTop(GRID_DAYS)) return null
  let day = Math.min(GRID_DAYS - 1, Math.floor((y - POLAR_CAP_PX) / ROW_H))
  // acerta o arredondamento das bordas, para bater com o desenho
  while (day > 0 && y < rowTop(day)) day--
  while (day < GRID_DAYS - 1 && y >= rowTop(day + 1)) day++
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

/**
 * Grade 52×7 de polo a polo: colunas = semanas (meridianos), linhas = dias (faixas de latitude),
 * com calotas polares lisas. Tudo em pixels inteiros e com a mesma folga, inclusive na emenda.
 */
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
      const top = rowTop(d)
      const half = CELL_GAP / 2
      ctx.fillRect(w * CELL_PX + half, top + half, CELL_PX - CELL_GAP, rowTop(d + 1) - top - CELL_GAP)
    }
  }
  ctx.globalAlpha = 1
}
