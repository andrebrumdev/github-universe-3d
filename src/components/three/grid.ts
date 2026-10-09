import { GRID_DAYS, GRID_WEEKS, maxCount } from '@/lib/universe/activity'

/**
 * Dois hemisférios, cada um meio ano do gráfico de contribuições do GitHub:
 * norte = semanas 0–25 (linhas 0–6 = dias 0–6), sul = semanas 26–51 (linhas 7–13 = dias 0–6).
 * 26 colunas × 14 linhas entre as calotas → células quase quadradas no equador (~13,8° × ~11,9°).
 */
export const GRID_COLS = GRID_WEEKS / 2 // 26
export const GRID_ROWS = GRID_DAYS * 2 // 14
/** Equiretangular 2:1 (360° × 180°). */
export const TEX_W = 832
export const TEX_H = TEX_W / 2 // 416
/** Largura de uma coluna (semana), em px inteiros. */
export const COL_PX = TEX_W / GRID_COLS // 32
/** Folga entre células, igual na horizontal, na vertical, no equador e na emenda u = 0/1. */
export const CELL_GAP = 4
/** Calotas polares na cor do planeta, onde sai o eixo: as células não viram fiapos no polo. */
export const POLAR_CAP_DEG = 7
export const POLAR_CAP_PX = Math.round((TEX_H * POLAR_CAP_DEG) / 180) // 16
/** Altura de cada uma das 14 faixas de latitude, em px (fracionária; as bordas são arredondadas). */
export const ROW_H = (TEX_H - 2 * POLAR_CAP_PX) / GRID_ROWS

/** Borda superior (px inteiro) da linha `r`; rowTop(14) é o início da calota sul. */
export function rowTop(r: number): number {
  return POLAR_CAP_PX + Math.round(r * ROW_H)
}

/** Retângulo [x, y, w, h] (px inteiros, já sem a folga) da célula de (semana, dia). */
export function cellRect(week: number, day: number): [number, number, number, number] {
  const south = week >= GRID_COLS
  const col = south ? week - GRID_COLS : week
  const row = south ? GRID_DAYS + day : day
  const half = CELL_GAP / 2
  const top = rowTop(row)
  return [col * COL_PX + half, top + half, COL_PX - CELL_GAP, rowTop(row + 1) - top - CELL_GAP]
}

/** Azul-aço claro: grade e calotas leem como um corpo iluminado contra o fundo quase preto. */
export const PLANET_BASE = '#5b7bc0'
export const CELL_COLOR = '#10b981'
/** Dia sem commits: quadradinho escuro (mas não preto), como a célula vazia do GitHub no tema escuro. */
export const EMPTY_CELL = '#1f2a4a'

export function cellFromUv(u: number, v: number): { week: number; day: number } | null {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null
  // A textura repete em u (a esfera dá a volta): u = 1 é o mesmo meridiano de u = 0.
  const col = ((Math.floor((u * TEX_W) / COL_PX) % GRID_COLS) + GRID_COLS) % GRID_COLS
  const y = (1 - v) * TEX_H
  if (y < rowTop(0) || y >= rowTop(GRID_ROWS)) return null
  let row = Math.min(GRID_ROWS - 1, Math.floor((y - POLAR_CAP_PX) / ROW_H))
  // acerta o arredondamento das bordas, para bater com o desenho
  while (row > 0 && y < rowTop(row)) row--
  while (row < GRID_ROWS - 1 && y >= rowTop(row + 1)) row++
  return row < GRID_DAYS ? { week: col, day: row } : { week: GRID_COLS + col, day: row - GRID_DAYS }
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
 * Grade de polo a polo em dois hemisférios (ver GRID_COLS), com calotas polares lisas.
 * Tudo em pixels inteiros e com a mesma folga, inclusive no equador e na emenda.
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
      ctx.fillRect(...cellRect(w, d))
    }
  }
  ctx.globalAlpha = 1
}
