import { describe, expect, it } from 'vitest'
import { rawRepo, rawUser } from './__fixtures__/raw'
import { MAX_HISTORY_PAGES, MAX_PLANETS, TOP_REAL } from './config'
import { fetchUniverse } from './fetchUniverse'
import type { RawRepo, RawUser } from './normalize'

const NOW = new Date('2026-10-08T12:00:00Z')

type Reply = { status?: number; body?: unknown }
type Handler = (query: string, vars: Record<string, unknown>) => Reply

function fakeFetch(handler: Handler) {
  const calls: Record<string, unknown>[] = []
  const impl = (async (_url: unknown, init?: RequestInit) => {
    const { query, variables } = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> }
    calls.push(variables)
    const { status = 200, body = {} } = handler(query, variables)
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch
  return { impl, calls }
}

const historyPage = (dates: string[], next: string | null = null): Reply => ({
  body: {
    data: {
      repository: {
        defaultBranchRef: {
          target: {
            history: { pageInfo: { hasNextPage: next !== null, endCursor: next }, nodes: dates.map((d) => ({ committedDate: d })) },
          },
        },
      },
    },
  },
})

function setup(user: RawUser | null, history: (vars: Record<string, unknown>) => Reply) {
  return fakeFetch((query, vars) => (query.includes('repositories(') ? { body: { data: { user } } } : history(vars)))
}

const repos = (n: number, extra: (i: number) => Partial<RawRepo> = () => ({})) =>
  Array.from({ length: n }, (_, i) => rawRepo({ name: `r${i}`, stargazerCount: 2000 - i * 10, ...extra(i) }))

describe('fetchUniverse', () => {
  it('top 10 com atividade real, resto derivado, na ordem do ranking', async () => {
    const { impl, calls } = setup(rawUser(repos(12)), () => historyPage(['2026-10-07T10:00:00Z']))
    const u = await fetchUniverse('andre', { token: 't', fetchImpl: impl, now: NOW })
    expect(u.schemaVersion).toBe(1)
    expect(u.repos.map((r) => r.name)).toEqual(repos(12).map((r) => r.name))
    expect(u.repos.slice(0, TOP_REAL).every((r) => r.activity.source === 'real')).toBe(true)
    expect(u.repos.slice(TOP_REAL).every((r) => r.activity.source === 'derived')).toBe(true)
    expect(u.repos[0].activity.weeks.flat().reduce((a, b) => a + b, 0)).toBe(1)
    expect(calls.filter((v) => 'authorId' in v)).toHaveLength(TOP_REAL)
    expect(calls.find((v) => 'authorId' in v)).toMatchObject({ owner: 'andre', authorId: 'U_1' })
  })

  it('limita a MAX_PLANETS, mas os totais do perfil contam todos os repos', async () => {
    const { impl } = setup(rawUser(repos(45)), () => historyPage([]))
    const u = await fetchUniverse('andre', { token: 't', fetchImpl: impl, now: NOW })
    expect(u.repos).toHaveLength(MAX_PLANETS)
    expect(u.profile.totalStars).toBe(repos(45).reduce((s, r) => s + r.stargazerCount, 0))
  })

  it('perfil com poucos repos', async () => {
    const { impl } = setup(rawUser(repos(2)), () => historyPage([]))
    const u = await fetchUniverse('andre', { token: 't', fetchImpl: impl, now: NOW })
    expect(u.repos).toHaveLength(2)
    expect(u.repos.every((r) => r.activity.source === 'real')).toBe(true)
  })

  it('histórico com erro vira atividade derivada e gera aviso', async () => {
    const warnings: string[] = []
    const { impl } = setup(rawUser(repos(3)), (vars) => (vars.name === 'r1' ? { status: 502 } : historyPage([])))
    const u = await fetchUniverse('andre', { token: 't', fetchImpl: impl, now: NOW, onWarning: (m) => warnings.push(m) })
    expect(u.repos.find((r) => r.name === 'r1')?.activity.source).toBe('derived')
    expect(u.repos.find((r) => r.name === 'r0')?.activity.source).toBe('real')
    expect(warnings).toEqual([expect.stringContaining('r1')])
  })

  it('repo vazio vira grade real zerada', async () => {
    const user = rawUser([rawRepo({ name: 'vazio', pushedAt: null, defaultBranchRef: null })])
    const { impl } = setup(user, () => ({ body: { data: { repository: { defaultBranchRef: null } } } }))
    const u = await fetchUniverse('andre', { token: 't', fetchImpl: impl, now: NOW })
    expect(u.repos[0].activity.source).toBe('real')
    expect(u.repos[0].activity.weeks.flat().every((c) => c === 0)).toBe(true)
    expect(u.repos[0].lastCommit).toBeNull()
  })

  it('pagina o histórico', async () => {
    const { impl } = setup(rawUser(repos(1)), (vars) =>
      vars.after ? historyPage(['2026-10-06T10:00:00Z']) : historyPage(['2026-10-07T10:00:00Z'], 'cursor-1'),
    )
    const u = await fetchUniverse('andre', { token: 't', fetchImpl: impl, now: NOW })
    expect(u.repos[0].activity.weeks.flat().reduce((a, b) => a + b, 0)).toBe(2)
  })

  it('usuário inexistente lança erro', async () => {
    const { impl } = setup(null, () => historyPage([]))
    await expect(fetchUniverse('ninguem', { token: 't', fetchImpl: impl, now: NOW })).rejects.toThrow(/não encontrado/)
  })

  it('erro do GraphQL lança erro', async () => {
    const { impl } = fakeFetch(() => ({ body: { errors: [{ message: 'Bad credentials' }] } }))
    await expect(fetchUniverse('andre', { token: 't', fetchImpl: impl, now: NOW })).rejects.toThrow('Bad credentials')
  })
})

describe('fetchUniverse: limites e truncamento', () => {
  it('busca os históricos em sequência, não em paralelo', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const impl = (async (_url: unknown, init?: RequestInit) => {
      const { query } = JSON.parse(String(init?.body)) as { query: string }
      if (query.includes('repositories(')) return new Response(JSON.stringify({ data: { user: rawUser(repos(4)) } }))
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return new Response(JSON.stringify(historyPage([]).body))
    }) as typeof fetch
    await fetchUniverse('andre', { token: 't', fetchImpl: impl, now: NOW })
    expect(maxInFlight).toBe(1)
  })

  it('limite de taxa no histórico: aviso com o nome do repo e o motivo, repo derivado', async () => {
    const warnings: string[] = []
    const { impl } = setup(rawUser(repos(2)), (vars) => (vars.name === 'r1' ? { status: 403 } : historyPage([])))
    const u = await fetchUniverse('andre', { token: 't', fetchImpl: impl, now: NOW, onWarning: (m) => warnings.push(m) })
    expect(u.repos.find((r) => r.name === 'r1')?.activity.source).toBe('derived')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('r1')
    expect(warnings[0]).toMatch(/limite de taxa/i)
  })

  it('histórico cortado em MAX_HISTORY_PAGES: continua real e avisa', async () => {
    const warnings: string[] = []
    const { impl, calls } = setup(rawUser(repos(1)), (vars) =>
      historyPage(['2026-10-07T10:00:00Z'], `c-${String(vars.after ?? 'start')}`),
    )
    const u = await fetchUniverse('andre', { token: 't', fetchImpl: impl, now: NOW, onWarning: (m) => warnings.push(m) })
    const historyCalls = calls.filter((v) => 'authorId' in v)
    expect(historyCalls).toHaveLength(MAX_HISTORY_PAGES)
    expect(u.repos[0].activity.source).toBe('real')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('r0')
    expect(warnings[0]).toMatch(/truncad/)
  })

  it('falha numa página posterior mantém as datas já lidas como reais e avisa', async () => {
    const warnings: string[] = []
    const { impl } = setup(rawUser(repos(1)), (vars) =>
      vars.after ? { status: 502 } : historyPage(['2026-10-07T10:00:00Z', '2026-10-06T10:00:00Z'], 'cursor-1'),
    )
    const u = await fetchUniverse('andre', { token: 't', fetchImpl: impl, now: NOW, onWarning: (m) => warnings.push(m) })
    expect(u.repos[0].activity.source).toBe('real')
    expect(u.repos[0].activity.weeks.flat().reduce((a, b) => a + b, 0)).toBe(2)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('r0')
    expect(warnings[0]).toContain('502')
  })
})

describe('fetchUniverse: READMEs', () => {
  const readmeReply = (vars: Record<string, unknown>, texts: Record<string, Record<string, string>>): Reply => {
    const data: Record<string, unknown> = {}
    for (let j = 0; vars[`n${j}`] !== undefined; j++) {
      const text = texts[String(vars.path)]?.[String(vars[`n${j}`])]
      data[`r${j}`] = { object: text ? { text } : null }
    }
    return { body: { data } }
  }

  function withReadmes(texts: Record<string, Record<string, string>>, fail = false) {
    const queries: string[] = []
    const { impl, calls } = fakeFetch((query, vars) => {
      if (query.includes('repositories(')) return { body: { data: { user: rawUser(repos(3)) } } }
      if (query.includes('Readmes')) {
        queries.push(query)
        return fail ? { status: 502 } : readmeReply(vars, texts)
      }
      return historyPage([])
    })
    return { impl, calls, queries }
  }

  it('resume README.md e cai para readme.md só nos repos que vieram nulos', async () => {
    const { impl, calls } = withReadmes({
      'HEAD:README.md': { r0: '# r0\n\nPrimeiro projeto.' },
      'HEAD:readme.md': { r1: 'Segundo projeto.' },
    })
    const u = await fetchUniverse('andre', { token: 't', fetchImpl: impl, now: NOW })
    expect(u.repos.map((r) => r.readme)).toEqual(['Primeiro projeto.', 'Segundo projeto.', undefined])
    const second = calls.filter((v) => v.path === 'HEAD:readme.md')
    expect(second).toHaveLength(1)
    expect(second[0]).toMatchObject({ n0: 'r1', n1: 'r2' })
  })

  it('USER_QUERY não busca README e só o top MAX_PLANETS é consultado, em lotes', async () => {
    const seen: string[] = []
    const { impl, calls } = fakeFetch((query, vars) => {
      if (query.includes('repositories(')) {
        seen.push(query)
        return { body: { data: { user: rawUser(repos(45)) } } }
      }
      if (query.includes('Readmes')) return readmeReply(vars, {})
      return historyPage([])
    })
    await fetchUniverse('andre', { token: 't', fetchImpl: impl, now: NOW })
    expect(seen[0]).not.toContain('Blob')
    const readmeCalls = calls.filter((v) => 'path' in v && v.path === 'HEAD:README.md')
    expect(readmeCalls).toHaveLength(2)
    const asked = readmeCalls.flatMap((v) => Object.keys(v).filter((k) => /^n\d+$/.test(k)))
    expect(asked).toHaveLength(MAX_PLANETS)
  })

  it('falha na consulta de README avisa e segue sem READMEs', async () => {
    const warnings: string[] = []
    const { impl } = withReadmes({}, true)
    const u = await fetchUniverse('andre', { token: 't', fetchImpl: impl, now: NOW, onWarning: (m) => warnings.push(m) })
    expect(u.repos).toHaveLength(3)
    expect(u.repos.every((r) => r.readme === undefined)).toBe(true)
    expect(warnings).toEqual([expect.stringContaining('READMEs')])
  })
})

