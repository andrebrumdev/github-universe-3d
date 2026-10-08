import { summarizeReadme } from './readme'
import type { CommitRef, Language, Profile, RepoBase } from '../types'

export interface RawHistory {
  totalCount: number
  nodes: { committedDate: string; messageHeadline: string }[]
}

/** `object(expression:)` devolve {} quando não é Blob, ou null quando não existe. */
export type RawBlob = { text?: string | null } | null

export interface RawRepo {
  name: string
  description: string | null
  url: string
  stargazerCount: number
  forkCount: number
  watchers: { totalCount: number }
  pushedAt: string | null
  primaryLanguage: { name: string } | null
  languages: { edges: { size: number; node: { name: string; color: string | null } }[] } | null
  readme?: RawBlob
  readmeLower?: RawBlob
  readmePlain?: RawBlob
  defaultBranchRef: { target: { history?: RawHistory } | null } | null
}

export interface RawUser {
  id: string
  login: string
  name: string | null
  bio: string | null
  avatarUrl: string
  followers: { totalCount: number }
  repositories: { totalCount: number; nodes: RawRepo[] }
}

export const FALLBACK_LANGUAGE_COLOR = '#8b949e'

export function normalizeRepo(raw: RawRepo): RepoBase {
  const languages = (raw.languages?.edges ?? [])
    .map((e) => ({ name: e.node.name, color: e.node.color ?? FALLBACK_LANGUAGE_COLOR, bytes: e.size }))
    .sort((a, b) => b.bytes - a.bytes)
  const history = raw.defaultBranchRef?.target?.history
  const head = history?.nodes[0]
  const readme = summarizeReadme(raw.readme?.text || raw.readmeLower?.text || raw.readmePlain?.text || '', 280, raw.name)
  return {
    name: raw.name,
    description: raw.description ?? '',
    url: raw.url,
    stars: raw.stargazerCount,
    forks: raw.forkCount,
    watchers: raw.watchers.totalCount,
    pushedAt: raw.pushedAt ?? new Date(0).toISOString(),
    primaryLanguage: raw.primaryLanguage?.name ?? null,
    languages,
    lastCommit: head ? { date: head.committedDate, message: head.messageHeadline } : null,
    totalCommits: history?.totalCount ?? 0,
    ...(readme ? { readme } : {}),
  }
}

export function topLanguages(repos: Pick<RepoBase, 'languages'>[], limit = 5): Language[] {
  const totals = new Map<string, Language>()
  for (const repo of repos) {
    for (const lang of repo.languages) {
      const current = totals.get(lang.name)
      if (current) current.bytes += lang.bytes
      else totals.set(lang.name, { ...lang })
    }
  }
  return [...totals.values()].sort((a, b) => b.bytes - a.bytes).slice(0, limit)
}

export function latestCommit(repos: Pick<RepoBase, 'lastCommit'>[]): CommitRef | null {
  let latest: CommitRef | null = null
  for (const repo of repos) {
    if (repo.lastCommit && (!latest || repo.lastCommit.date > latest.date)) latest = repo.lastCommit
  }
  return latest
}

export function normalizeProfile(raw: RawUser, repos: RepoBase[]): Profile {
  return {
    login: raw.login,
    name: raw.name ?? raw.login,
    bio: raw.bio ?? '',
    avatarUrl: raw.avatarUrl,
    followers: raw.followers.totalCount,
    totalRepos: raw.repositories.totalCount,
    totalStars: repos.reduce((sum, r) => sum + r.stars, 0),
    totalForks: repos.reduce((sum, r) => sum + r.forks, 0),
    topLanguages: topLanguages(repos),
    lastCommit: latestCommit(repos),
  }
}
