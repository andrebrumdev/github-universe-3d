import type { Activity } from '../types'
import { seededRandom } from './random'

export const GRID_WEEKS = 52
export const GRID_DAYS = 7
const DAY_MS = 86_400_000

function dayUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function startOfGrid(end: Date): Date {
  const d = new Date(dayUtc(end))
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() - (GRID_WEEKS - 1) * 7)
  return d
}

export function emptyWeeks(): number[][] {
  return Array.from({ length: GRID_WEEKS }, () => Array<number>(GRID_DAYS).fill(0))
}

export function bucketCommits(dates: string[], end: Date): Activity {
  const start = startOfGrid(end).getTime()
  const weeks = emptyWeeks()
  for (const iso of dates) {
    const idx = Math.floor((dayUtc(new Date(iso)) - start) / DAY_MS)
    if (idx < 0 || idx >= GRID_WEEKS * GRID_DAYS) continue
    weeks[Math.floor(idx / GRID_DAYS)][idx % GRID_DAYS]++
  }
  return { source: 'real', weeks, startDate: isoDate(new Date(start)) }
}

/** Padrão plausível para repos fora do top 10: concentrado perto do último push, mais denso com mais stars. */
export function deriveActivity(seed: { name: string; pushedAt: string; stars: number }, end: Date): Activity {
  const start = startOfGrid(end)
  const rng = seededRandom(seed.name)
  const pushedIdx = Math.floor((dayUtc(new Date(seed.pushedAt)) - start.getTime()) / DAY_MS)
  const base = 0.15 + Math.min(seed.stars, 100) / 400
  const weeks = emptyWeeks()
  for (let i = 0; i < GRID_WEEKS * GRID_DAYS && i <= pushedIdx; i++) {
    const p = base * Math.exp(-(pushedIdx - i) / 140)
    if (rng() < p) weeks[Math.floor(i / GRID_DAYS)][i % GRID_DAYS] = 1 + Math.floor(rng() * 4)
  }
  return { source: 'derived', weeks, startDate: isoDate(start) }
}

export function cellDate(startDate: string, week: number, day: number): string {
  const d = new Date(`${startDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + week * GRID_DAYS + day)
  return isoDate(d)
}

export function maxCount(weeks: number[][]): number {
  let max = 0
  for (const week of weeks) for (const count of week) if (count > max) max = count
  return max
}

/** Commits na janela inteira da grade (as 52 semanas: o último ano). */
export function commitsInWindow(activity: Activity): number {
  let total = 0
  for (const week of activity.weeks) for (const count of week) total += count
  return total
}
