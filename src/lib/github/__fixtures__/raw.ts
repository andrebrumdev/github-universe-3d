import type { RawRepo, RawUser } from '../normalize'

export function rawRepo(overrides: Partial<RawRepo> & { name: string }): RawRepo {
  return {
    description: 'desc',
    url: `https://github.com/andre/${overrides.name}`,
    stargazerCount: 0,
    forkCount: 0,
    watchers: { totalCount: 0 },
    pushedAt: '2026-10-01T00:00:00Z',
    primaryLanguage: { name: 'TypeScript' },
    languages: { edges: [{ size: 1000, node: { name: 'TypeScript', color: '#3178c6' } }] },
    defaultBranchRef: {
      target: {
        history: {
          totalCount: 3,
          nodes: [{ committedDate: '2026-09-30T10:00:00Z', messageHeadline: 'feat: inicial' }],
        },
      },
    },
    ...overrides,
  }
}

export function rawUser(repos: RawRepo[], overrides: Partial<RawUser> = {}): RawUser {
  return {
    id: 'U_1',
    login: 'andre',
    name: 'André Brum',
    bio: 'Dev front-end',
    avatarUrl: 'https://avatars.githubusercontent.com/u/1',
    followers: { totalCount: 10 },
    repositories: { totalCount: repos.length, nodes: repos },
    ...overrides,
  }
}
