import { SCHEMA_VERSION, type RepoBase, type Universe } from '../types'
import { deriveActivity } from '../universe/activity'
import { rankRepos } from '../universe/planets'
import { TOP_REAL } from './config'
import { latestCommit, topLanguages } from './normalize'

type L = [name: string, color: string, bytes: number]
const TS: L = ['TypeScript', '#3178c6', 0]
const JS: L = ['JavaScript', '#f1e05a', 0]
const PY: L = ['Python', '#3572A5', 0]
const GO: L = ['Go', '#00ADD8', 0]
const CSS: L = ['CSS', '#663399', 0]
const HTML: L = ['HTML', '#e34c26', 0]
const RS: L = ['Rust', '#dea584', 0]
const SH: L = ['Shell', '#89e051', 0]
const JAVA: L = ['Java', '#b07219', 0]
const KT: L = ['Kotlin', '#A97BFF', 0]
const b = (l: L, bytes: number): L => [l[0], l[1], bytes]

const SAMPLE: [name: string, stars: number, forks: number, langs: L[]][] = [
  ['universe-3d', 320, 41, [b(TS, 90_000), b(CSS, 8_000), b(HTML, 2_000)]],
  ['api-gateway', 210, 30, [b(GO, 120_000), b(SH, 3_000)]],
  ['design-tokens', 150, 12, [b(TS, 40_000), b(CSS, 30_000)]],
  ['ml-notebooks', 95, 20, [b(PY, 200_000), b(SH, 1_000)]],
  ['portfolio', 60, 4, [b(TS, 30_000), b(CSS, 12_000), b(HTML, 6_000), b(JS, 3_000)]],
  ['cli-tools', 44, 6, [b(RS, 70_000), b(SH, 4_000)]],
  ['android-app', 30, 5, [b(KT, 90_000), b(JAVA, 20_000)]],
  ['dotfiles', 25, 3, [b(SH, 9_000)]],
  ['data-pipeline', 18, 2, [b(PY, 60_000), b(GO, 15_000)]],
  ['legacy-site', 12, 1, [b(JS, 50_000), b(HTML, 20_000), b(CSS, 10_000)]],
  ['notes', 3, 0, []],
  ['algorithms', 8, 1, [b(JAVA, 25_000), b(PY, 5_000)]],
  ['game-jam', 5, 0, [b(JS, 15_000)]],
  ['empty-repo', 0, 0, []],
]

export function buildSampleUniverse(now = new Date('2026-10-08T12:00:00Z')): Universe {
  const base: RepoBase[] = SAMPLE.map(([name, stars, forks, langs], i) => {
    const pushedAt = new Date(now.getTime() - i * 9 * 86_400_000).toISOString()
    const isEmpty = name === 'empty-repo'
    return {
      name,
      description: isEmpty ? '' : `Repositório de exemplo: ${name}`,
      url: `https://github.com/octocat/${name}`,
      stars,
      forks,
      watchers: Math.round(stars / 10),
      pushedAt,
      primaryLanguage: langs[0]?.[0] ?? null,
      languages: langs.map(([n, color, bytes]) => ({ name: n, color, bytes })),
      lastCommit: isEmpty ? null : { date: pushedAt, message: `feat: atualiza ${name}` },
      totalCommits: isEmpty ? 0 : 40 + i * 13,
    }
  })
  const repos = rankRepos(base, now).map((repo, i) => {
    const activity = deriveActivity(repo, now)
    // No exemplo, o top 10 finge atividade real para o tooltip funcionar em dev e no e2e.
    return { ...repo, activity: i < TOP_REAL ? { ...activity, source: 'real' as const } : activity }
  })
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    profile: {
      login: 'octocat',
      name: 'Mona Octocat',
      bio: 'Dados de exemplo. Rode pnpm snapshot para usar o seu perfil.',
      avatarUrl: 'https://avatars.githubusercontent.com/u/583231',
      followers: 120,
      totalRepos: repos.length,
      totalStars: repos.reduce((s, r) => s + r.stars, 0),
      totalForks: repos.reduce((s, r) => s + r.forks, 0),
      topLanguages: topLanguages(repos),
      lastCommit: latestCommit(repos),
    },
    repos,
  }
}
