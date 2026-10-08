import { SCHEMA_VERSION, type Repo, type Universe } from '../types'
import { bucketCommits, deriveActivity, startOfGrid } from '../universe/activity'
import { rankRepos } from '../universe/planets'
import { gql } from './client'
import { MAX_HISTORY_PAGES, MAX_PLANETS, TOP_REAL } from './config'
import { normalizeProfile, normalizeRepo, type RawUser } from './normalize'
import { HISTORY_QUERY, USER_QUERY } from './queries'

export interface FetchDeps {
  token: string
  fetchImpl?: typeof fetch
  now?: Date
  onWarning?: (message: string) => void
}

interface HistoryResponse {
  repository: {
    defaultBranchRef: {
      target: {
        history?: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { committedDate: string }[] }
      } | null
    } | null
  } | null
}

export async function fetchCommitDates(
  fetchImpl: typeof fetch,
  token: string,
  vars: { owner: string; name: string; authorId: string; since: string },
): Promise<string[]> {
  const dates: string[] = []
  let after: string | null = null
  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    const data: HistoryResponse = await gql<HistoryResponse>(fetchImpl, token, HISTORY_QUERY, { ...vars, after })
    const history = data.repository?.defaultBranchRef?.target?.history
    if (!history) break
    for (const node of history.nodes) dates.push(node.committedDate)
    if (!history.pageInfo.hasNextPage) break
    after = history.pageInfo.endCursor
  }
  return dates
}

export async function fetchUniverse(login: string, deps: FetchDeps): Promise<Universe> {
  const now = deps.now ?? new Date()
  const f = deps.fetchImpl ?? fetch
  const warn = deps.onWarning ?? ((m: string) => console.warn(m))

  const { user } = await gql<{ user: RawUser | null }>(f, deps.token, USER_QUERY, { login })
  if (!user) throw new Error(`Usuário GitHub "${login}" não encontrado`)

  const all = user.repositories.nodes.map(normalizeRepo)
  const ranked = rankRepos(all, now).slice(0, MAX_PLANETS)
  const since = startOfGrid(now).toISOString()
  const histories = await Promise.allSettled(
    ranked
      .slice(0, TOP_REAL)
      .map((r) => fetchCommitDates(f, deps.token, { owner: user.login, name: r.name, authorId: user.id, since })),
  )

  const repos: Repo[] = ranked.map((repo, i) => {
    const history = histories[i]
    if (history?.status === 'fulfilled') return { ...repo, activity: bucketCommits(history.value, now) }
    if (history?.status === 'rejected') warn(`histórico de ${repo.name} falhou (${String(history.reason)}); usando padrão derivado`)
    return { ...repo, activity: deriveActivity(repo, now) }
  })

  return { schemaVersion: SCHEMA_VERSION, generatedAt: now.toISOString(), profile: normalizeProfile(user, all), repos }
}
