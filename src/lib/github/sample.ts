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

const SAMPLE_README: Record<string, string> = {
  'universe-3d': 'Transforma o seu perfil do GitHub em uma galáxia 3D: cada repositório vira um planeta, cada linguagem uma lua e a atividade vira a superfície.',
  'api-gateway': 'Gateway de APIs em Go para microsserviços, com roteamento dinâmico, autenticação por token, limite de requisições e métricas prontas para Prometheus.',
  'design-tokens': 'Tokens de design compartilhados entre web e mobile: cores, espaçamentos e tipografia gerados a partir de uma única fonte em JSON.',
  'ml-notebooks': 'Coleção de notebooks de aprendizado de máquina com experimentos de classificação, séries temporais e visualização de dados em Python.',
  'portfolio': 'Meu portfólio pessoal, feito com TypeScript e CSS puro, com projetos, artigos e um formulário de contato leve e acessível.',
  'cli-tools': 'Ferramentas de linha de comando em Rust para o dia a dia: renomear arquivos em lote, buscar duplicatas e limpar pastas temporárias.',
  'android-app': 'Aplicativo Android em Kotlin para acompanhar hábitos diários, com lembretes, gráficos de progresso e sincronização offline.',
  'dotfiles': 'Meus arquivos de configuração do terminal, editor e shell, com um script de instalação para montar uma máquina nova em minutos.',
  'data-pipeline': 'Pipeline de dados em Python e Go que coleta, limpa e carrega eventos em lote, com reprocessamento e alertas de falha.',
  'legacy-site': 'Site antigo em HTML, CSS e JavaScript mantido apenas como arquivo histórico. Não recebe mais novidades.',
  'notes': 'Anotações de estudo e ideias soltas.',
  'algorithms': 'Implementações de algoritmos e estruturas de dados em Java e Python, com testes e explicações passo a passo.',
  'game-jam': 'Protótipo de jogo feito em 48 horas durante uma game jam, em JavaScript puro e canvas.',
}

/** Fixados no perfil: o primeiro é o xodó do Octocat (de propósito, não o de mais stars). */
const SAMPLE_PINNED = ['design-tokens', 'universe-3d', 'api-gateway']
const SAMPLE_TOPICS: Record<string, string[]> = { notes: ['notes', 'til'] }
/** O último commit do game-jam foi de madrugada (03:12 em São Paulo): o "commit das 3 da manhã" é verdade no exemplo. */
const NIGHT_COMMIT = 'game-jam'

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
  // muitos commits e nenhuma star: o "mas o conteúdo é ouro" do Octocat
  ['game-jam', 0, 0, [b(JS, 15_000)]],
  ['empty-repo', 0, 0, []],
]

export function buildSampleUniverse(now = new Date('2026-10-08T12:00:00Z')): Universe {
  const base: RepoBase[] = SAMPLE.map(([name, stars, forks, langs], i) => {
    const pushedAt = new Date(now.getTime() - i * 9 * 86_400_000).toISOString()
    const isEmpty = name === 'empty-repo'
    const committedAt = name === NIGHT_COMMIT ? `${pushedAt.slice(0, 10)}T06:12:00.000Z` : pushedAt
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
      lastCommit: isEmpty ? null : { date: committedAt, message: `feat: atualiza ${name}` },
      totalCommits: isEmpty ? 0 : 40 + i * 13,
      ...(SAMPLE_README[name] ? { readme: SAMPLE_README[name] } : {}),
      ...(SAMPLE_TOPICS[name] ? { topics: SAMPLE_TOPICS[name] } : {}),
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
      pinned: SAMPLE_PINNED,
    },
    repos,
  }
}
