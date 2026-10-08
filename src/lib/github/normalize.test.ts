import { describe, expect, it } from 'vitest'
import { rawRepo, rawUser } from './__fixtures__/raw'
import { FALLBACK_LANGUAGE_COLOR, latestCommit, normalizeProfile, normalizeRepo, topLanguages } from './normalize'

describe('normalizeRepo', () => {
  it('mapeia os campos do GraphQL', () => {
    const repo = normalizeRepo(rawRepo({ name: 'alpha', stargazerCount: 5, forkCount: 2, watchers: { totalCount: 3 } }))
    expect(repo).toMatchObject({
      name: 'alpha',
      description: 'desc',
      stars: 5,
      forks: 2,
      watchers: 3,
      primaryLanguage: 'TypeScript',
      totalCommits: 3,
      lastCommit: { date: '2026-09-30T10:00:00Z', message: 'feat: inicial' },
    })
  })

  it('guarda só o resumo do README, tentando as variações de nome', () => {
    const md = '# alpha\n\n![b](x.svg)\n\nUm app **simples** de [notas](https://x.y).'
    expect(normalizeRepo(rawRepo({ name: 'alpha', readme: { text: md } })).readme).toBe('Um app simples de notas.')
    expect(normalizeRepo(rawRepo({ name: 'alpha', readme: null, readmeLower: { text: md } })).readme).toBe('Um app simples de notas.')
    expect(normalizeRepo(rawRepo({ name: 'alpha', readme: null, readmePlain: { text: 'Texto puro.' } })).readme).toBe('Texto puro.')
  })

  it('omite readme quando ausente ou sem conteúdo útil', () => {
    expect('readme' in normalizeRepo(rawRepo({ name: 'a' }))).toBe(false)
    expect('readme' in normalizeRepo(rawRepo({ name: 'a', readme: { text: '# a\n![x](y.svg)' } }))).toBe(false)
    expect('readme' in normalizeRepo(rawRepo({ name: 'a', readme: {} }))).toBe(false)
  })

  it('aguenta repo vazio e campos nulos', () => {
    const repo = normalizeRepo(
      rawRepo({ name: 'vazio', description: null, pushedAt: null, primaryLanguage: null, languages: null, defaultBranchRef: null }),
    )
    expect(repo.description).toBe('')
    expect(repo.pushedAt).toBe('1970-01-01T00:00:00.000Z')
    expect(repo.primaryLanguage).toBeNull()
    expect(repo.languages).toEqual([])
    expect(repo.lastCommit).toBeNull()
    expect(repo.totalCommits).toBe(0)
  })

  it('ordena linguagens por bytes e usa cor padrão quando o GitHub não tem cor', () => {
    const repo = normalizeRepo(
      rawRepo({
        name: 'multi',
        languages: {
          edges: [
            { size: 10, node: { name: 'Shell', color: null } },
            { size: 500, node: { name: 'Go', color: '#00ADD8' } },
          ],
        },
      }),
    )
    expect(repo.languages.map((l) => l.name)).toEqual(['Go', 'Shell'])
    expect(repo.languages[1].color).toBe(FALLBACK_LANGUAGE_COLOR)
  })
})

describe('perfil', () => {
  const repos = [
    normalizeRepo(rawRepo({ name: 'a', stargazerCount: 4, forkCount: 1 })),
    normalizeRepo(
      rawRepo({
        name: 'b',
        stargazerCount: 6,
        forkCount: 2,
        languages: { edges: [{ size: 3000, node: { name: 'Go', color: '#00ADD8' } }] },
        defaultBranchRef: {
          target: { history: { totalCount: 1, nodes: [{ committedDate: '2026-10-05T08:00:00Z', messageHeadline: 'fix: b' }] } },
        },
      }),
    ),
  ]

  it('agrega linguagens de todos os repos', () => {
    expect(topLanguages(repos)).toEqual([
      { name: 'Go', color: '#00ADD8', bytes: 3000 },
      { name: 'TypeScript', color: '#3178c6', bytes: 1000 },
    ])
  })

  it('o último commit do perfil é o mais recente entre os repos', () => {
    expect(latestCommit(repos)).toEqual({ date: '2026-10-05T08:00:00Z', message: 'fix: b' })
    expect(latestCommit([])).toBeNull()
  })

  it('normaliza o perfil com totais e fallback de nome', () => {
    const profile = normalizeProfile(rawUser([], { name: null, bio: null }), repos)
    expect(profile).toMatchObject({ login: 'andre', name: 'andre', bio: '', followers: 10, totalStars: 10, totalForks: 3 })
  })
})
