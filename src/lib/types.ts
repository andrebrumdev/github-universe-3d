export const SCHEMA_VERSION = 1

export interface Language {
  name: string
  color: string
  bytes: number
}

export interface Activity {
  source: 'real' | 'derived'
  /** weeks[w][d]: commits na semana w (0 = mais antiga) e dia d (0 = domingo). Sempre 52 × 7. */
  weeks: number[][]
  /** Data ISO (YYYY-MM-DD, UTC) de weeks[0][0]. */
  startDate: string
}

export interface CommitRef {
  date: string
  message: string
}

export interface RepoBase {
  name: string
  description: string
  url: string
  stars: number
  forks: number
  watchers: number
  pushedAt: string
  primaryLanguage: string | null
  /** Ordenadas por bytes, decrescente. */
  languages: Language[]
  lastCommit: CommitRef | null
  totalCommits: number
  /** Resumo do README em texto simples (nunca o README bruto). Opcional: schemaVersion 1 segue compatível. */
  readme?: string
}

export interface Repo extends RepoBase {
  activity: Activity
}

export interface Profile {
  login: string
  name: string
  bio: string
  avatarUrl: string
  followers: number
  totalRepos: number
  totalStars: number
  totalForks: number
  topLanguages: Language[]
  lastCommit: CommitRef | null
}

export interface Universe {
  schemaVersion: number
  generatedAt: string
  profile: Profile
  /** Já ranqueados: índice 0 = mais relevante (anel interno). */
  repos: Repo[]
}
