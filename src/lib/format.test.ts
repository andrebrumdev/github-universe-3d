import { describe, expect, it } from 'vitest'
import { commitsLabel, formatCount, formatDate, timeAgo } from './format'

describe('format', () => {
  it('formata datas em pt-BR, sem deslocar o dia pelo fuso', () => {
    const text = formatDate('2026-10-08')
    expect(text).toContain('8')
    expect(text).toContain('out')
    expect(text).toContain('2026')
  })

  it('tempo relativo', () => {
    const now = new Date('2026-10-08T12:00:00Z')
    expect(timeAgo('2026-10-05T12:00:00Z', now)).toBe('há 3 dias')
    expect(timeAgo('2026-10-07T11:00:00Z', now)).toBe('ontem')
    expect(timeAgo('2026-10-08T11:59:50Z', now)).toBe('agora mesmo')
  })

  it('números compactos e rótulo de commits', () => {
    expect(formatCount(950)).toBe('950')
    expect(formatCount(1500)).toContain('1,5')
    expect(commitsLabel(1)).toBe('1 commit')
    expect(commitsLabel(0)).toBe('0 commits')
  })
})
