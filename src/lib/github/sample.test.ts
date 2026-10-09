import { describe, expect, it } from 'vitest'
import { buildSampleUniverse } from './sample'

describe('buildSampleUniverse', () => {
  it('gera um universo válido, determinístico, com casos de borda', () => {
    const u = buildSampleUniverse()
    expect(u).toEqual(buildSampleUniverse())
    expect(u.schemaVersion).toBe(1)
    expect(u.repos.length).toBeGreaterThanOrEqual(14)
    expect(u.repos.some((r) => r.languages.length === 0)).toBe(true)
    expect(u.repos.some((r) => r.lastCommit === null)).toBe(true)
    expect(u.repos.slice(0, 10).every((r) => r.activity.source === 'real')).toBe(true)
  })

  it('inclui resumo de README nos repos de exemplo, com um sem README', () => {
    const u = buildSampleUniverse()
    expect(u.repos.filter((r) => r.readme).length).toBeGreaterThanOrEqual(10)
    expect(u.repos.every((r) => (r.readme ?? '').length <= 280)).toBe(true)
    expect(u.repos.some((r) => r.readme === undefined)).toBe(true)
  })

  it('cobre o roteiro do Octocat: favorito fixado, caderno, muitos commits sem star, vazio e um commit de madrugada', () => {
    const u = buildSampleUniverse()
    const names = new Set(u.repos.map((r) => r.name))
    expect(u.profile.pinned?.length).toBeGreaterThan(0)
    expect(u.profile.pinned?.every((n) => names.has(n))).toBe(true)
    // o favorito fixado não é o de mais stars (mostra que o fixado manda)
    const mostStars = [...u.repos].sort((a, b) => b.stars - a.stars)[0].name
    expect(u.profile.pinned?.[0]).not.toBe(mostStars)
    expect(u.repos.some((r) => r.name === 'notes')).toBe(true)
    expect(u.repos.some((r) => r.totalCommits >= 50 && r.stars === 0)).toBe(true)
    expect(u.repos.some((r) => r.totalCommits <= 1)).toBe(true)
    // 06:12 UTC = 03:12 em São Paulo
    expect(u.repos.some((r) => r.lastCommit?.date.endsWith('T06:12:00.000Z'))).toBe(true)
  })
})
