import { describe, expect, it } from 'vitest'
import { bucketCommits, cellDate, deriveActivity, GRID_DAYS, GRID_WEEKS, maxCount, startOfGrid } from './activity'

const END = new Date('2026-10-08T12:00:00Z') // quinta-feira

const total = (weeks: number[][]) => weeks.flat().reduce((a, b) => a + b, 0)

describe('startOfGrid', () => {
  it('começa no domingo 51 semanas antes da semana atual', () => {
    expect(startOfGrid(END).toISOString().slice(0, 10)).toBe('2025-10-12')
  })
})

describe('bucketCommits', () => {
  it('agrupa por dia UTC numa grade 52×7 e ignora datas fora da janela', () => {
    const activity = bucketCommits(
      ['2026-10-08T10:00:00Z', '2026-10-08T23:59:59Z', '2025-10-12T00:00:00Z', '2025-10-11T23:00:00Z'],
      END,
    )
    expect(activity.source).toBe('real')
    expect(activity.startDate).toBe('2025-10-12')
    expect(activity.weeks).toHaveLength(GRID_WEEKS)
    expect(activity.weeks.every((w) => w.length === GRID_DAYS)).toBe(true)
    expect(activity.weeks[51][4]).toBe(2)
    expect(activity.weeks[0][0]).toBe(1)
    expect(total(activity.weeks)).toBe(3)
  })

  it('sem commits devolve grade zerada', () => {
    expect(total(bucketCommits([], END).weeks)).toBe(0)
  })
})

describe('deriveActivity', () => {
  const seed = { name: 'alpha', pushedAt: '2026-06-01T00:00:00Z', stars: 50 }

  it('é determinística', () => {
    expect(deriveActivity(seed, END)).toEqual(deriveActivity(seed, END))
  })

  it('muda com o nome do repo', () => {
    expect(deriveActivity(seed, END).weeks).not.toEqual(deriveActivity({ ...seed, name: 'beta' }, END).weeks)
  })

  it('não tem commits depois do último push e tem algum antes', () => {
    const activity = deriveActivity(seed, END)
    const pushedIdx = Math.floor((Date.UTC(2026, 5, 1) - Date.UTC(2025, 9, 12)) / 86_400_000)
    activity.weeks.forEach((week, w) =>
      week.forEach((count, d) => {
        if (w * 7 + d > pushedIdx) expect(count).toBe(0)
      }),
    )
    expect(activity.source).toBe('derived')
    expect(total(activity.weeks)).toBeGreaterThan(0)
  })
})

describe('helpers', () => {
  it('cellDate converte semana e dia para data ISO', () => {
    expect(cellDate('2025-10-12', 0, 0)).toBe('2025-10-12')
    expect(cellDate('2025-10-12', 51, 4)).toBe('2026-10-08')
  })

  it('maxCount devolve o maior valor', () => {
    expect(maxCount([[0, 3], [7, 1]])).toBe(7)
    expect(maxCount([[0]])).toBe(0)
  })
})
