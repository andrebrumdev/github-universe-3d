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
})
