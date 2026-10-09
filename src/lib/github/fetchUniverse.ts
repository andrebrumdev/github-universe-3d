import { SCHEMA_VERSION, type Repo, type Universe } from '../types'
import { bucketCommits, deriveActivity, startOfGrid } from '../universe/activity'
import { rankRepos } from '../universe/planets'
import { gql } from './client'
import { MAX_HISTORY_PAGES, MAX_PLANETS, TOP_REAL } from './config'
import { normalizeProfile, normalizeRepo, type RawUser } from './normalize'
import { HISTORY_QUERY, readmesQuery, USER_QUERY } from './queries'

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

/** Repos por consulta de README: mantém cada consulta pequena. */
const README_CHUNK = 20

type ReadmeData = Record<string, { object: { text?: string | null } | null } | null>

/**
 * Texto bruto dos READMEs (nome → texto). Tenta README.md e, só para quem veio nulo, readme.md.
 * Qualquer falha avisa e segue sem README para os repos afetados.
 */
export async function fetchReadmes(
  fetchImpl: typeof fetch,
  token: string,
  owner: string,
  names: string[],
  warn: (message: string) => void,
): Promise<Map<string, string>> {
  const texts = new Map<string, string>()
  for (const path of ['HEAD:README.md', 'HEAD:readme.md']) {
    const pending = names.filter((n) => !texts.has(n))
    for (let i = 0; i < pending.length; i += README_CHUNK) {
      const chunk = pending.slice(i, i + README_CHUNK)
      const variables: Record<string, unknown> = { owner, path }
      chunk.forEach((name, j) => (variables[`n${j}`] = name))
      try {
        const data = await gql<ReadmeData>(fetchImpl, token, readmesQuery(chunk.length), variables)
        chunk.forEach((name, j) => {
          const text = data[`r${j}`]?.object?.text
          if (text) texts.set(name, text)
        })
      } catch (e) {
        warn(`READMEs não carregados (${reasonOf(e)}); seguindo sem eles`)
        return texts
      }
    }
  }
  return texts
}

const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Datas dos commits do autor no repo. Falha na primeira página é propagada (o chamador usa o padrão
 * derivado). Falha numa página posterior mantém as datas já lidas e avisa. Corte no limite de páginas avisa.
 */
export async function fetchCommitDates(
  fetchImpl: typeof fetch,
  token: string,
  vars: { owner: string; name: string; authorId: string; since: string },
  warn: (message: string) => void = () => {},
): Promise<string[]> {
  const dates: string[] = []
  let after: string | null = null
  let more = false
  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    let data: HistoryResponse
    try {
      data = await gql<HistoryResponse>(fetchImpl, token, HISTORY_QUERY, { ...vars, after })
    } catch (e) {
      if (page === 0) throw e
      warn(`histórico de ${vars.name} parcial (${reasonOf(e)}); usando ${dates.length} commits já lidos`)
      return dates
    }
    const history = data.repository?.defaultBranchRef?.target?.history
    if (!history) {
      more = false
      break
    }
    for (const node of history.nodes) dates.push(node.committedDate)
    more = history.pageInfo.hasNextPage
    if (!more) return dates
    after = history.pageInfo.endCursor
  }
  if (more) warn(`histórico de ${vars.name} truncado em ${MAX_HISTORY_PAGES} páginas (${dates.length} commits)`)
  return dates
}

export async function fetchUniverse(login: string, deps: FetchDeps): Promise<Universe> {
  const now = deps.now ?? new Date()
  const f = deps.fetchImpl ?? fetch
  const warn = deps.onWarning ?? ((m: string) => console.warn(m))

  const { user } = await gql<{ user: RawUser | null }>(f, deps.token, USER_QUERY, { login })
  if (!user) throw new Error(`Usuário GitHub "${login}" não encontrado`)

  const all = user.repositories.nodes.map((raw) => normalizeRepo(raw))
  const top = rankRepos(all, now).slice(0, MAX_PLANETS)
  const readmes = await fetchReadmes(f, deps.token, user.login, top.map((r) => r.name), warn)
  const rawByName = new Map(user.repositories.nodes.map((r) => [r.name, r]))
  const ranked = top.map((repo) => {
    const raw = rawByName.get(repo.name)
    return raw ? normalizeRepo(raw, readmes.get(repo.name)) : repo
  })
  const since = startOfGrid(now).toISOString()

  // Sequencial de propósito: disparar as 10 em paralelo estoura os limites secundários do GitHub.
  const histories: (string[] | { error: unknown })[] = []
  for (const repo of ranked.slice(0, TOP_REAL)) {
    try {
      histories.push(await fetchCommitDates(f, deps.token, { owner: user.login, name: repo.name, authorId: user.id, since }, warn))
    } catch (error) {
      histories.push({ error })
    }
  }

  const repos: Repo[] = ranked.map((repo, i) => {
    const history = histories[i]
    if (history === undefined) return { ...repo, activity: deriveActivity(repo, now) }
    if (Array.isArray(history)) return { ...repo, activity: bucketCommits(history, now) }
    warn(`histórico de ${repo.name} falhou (${reasonOf(history.error)}); usando padrão derivado`)
    return { ...repo, activity: deriveActivity(repo, now) }
  })

  return { schemaVersion: SCHEMA_VERSION, generatedAt: now.toISOString(), profile: normalizeProfile(user, all), repos }
}
