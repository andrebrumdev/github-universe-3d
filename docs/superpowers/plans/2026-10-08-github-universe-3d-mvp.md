# GitHub Universe 3D — MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar no GitHub Pages um site estático em React que transforma o perfil do GitHub do autor numa galáxia 3D interativa (planetas = repos em órbitas de Kepler, luas = linguagens, grade de commits na superfície, sol com rosto, Octocat guia e tutorial).

**Architecture:** Um script Node (`scripts/snapshot.ts`) consulta o GitHub GraphQL no build (GitHub Action) e grava `public/universe.json`. O app Vite + React lê esse JSON e renderiza a cena com React Three Fiber. Toda a lógica (atividade, ranking, órbitas, poses de câmera, máquinas de estado) fica em funções puras em `src/lib/`, testadas com Vitest; os componentes só ligam essas funções ao Three.js e ao DOM.

**Tech Stack:** Node 22, pnpm 10, Vite, React 19, TypeScript (strict), three, @react-three/fiber 9, @react-three/drei 10, Tailwind CSS v4 (`@tailwindcss/vite`), Framer Motion, Zustand 5, Vitest, Playwright, tsx, GitHub Actions + GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-08-github-universe-3d-design.md`

## Global Constraints

- Node 22 e pnpm 10. Todos os comandos rodam na raiz do repositório.
- Vite com `base: '/github-universe-3d/'`; o app busca dados em `${import.meta.env.BASE_URL}universe.json`.
- O token (`UNIVERSE_TOKEN`) só existe no script de snapshot e no Action. Nunca use prefixo `VITE_` em variáveis com segredo e nunca importe `src/lib/github/` a partir de `src/components/`, `src/store/` ou `src/hooks/`.
- Imports: dentro de `src/lib/**` e `src/data/**`, use caminhos **relativos** (esses arquivos também rodam no Node via `tsx`). Em componentes, hooks e store, use o alias `@/`.
- Constantes: `SCHEMA_VERSION = 1`, `TOP_REAL = 10`, `MAX_PLANETS = 40`, `MAX_MOONS = 6`, `SUN_RADIUS = 2.5`, `INNER_PERIOD = 60` (s).
- Cores: fundo `#0a0e27`, quadradinhos `#10b981`, destaque ciano `#22d3ee`, painel `#0f1535`; nave do Octocat `#C4B5FD`; demais cores do Octocat de `design/Octocat.dc.html`.
- Todo texto de UI em português do Brasil.
- Todo componente animado respeita `prefers-reduced-motion` (`useReducedMotion` do Framer Motion).
- Orçamento: 60 fps em notebook comum, 30 fps em celular médio, bundle inicial < 400 KB gzip (a cena entra via `React.lazy`).
- Commits terminam com as linhas de atribuição da sessão (Co-Authored-By / Claude-Session).

## Desvios conscientes da spec

- **Câmera no foco:** a spec diz "a câmera acompanha o planeta a cada frame". Como o tempo de simulação desacelera até parar ao focar, o plano calcula **onde o planeta vai parar** (`predictStopTime`) e anima a câmera direto para lá, uma única vez. O resultado visual é o mesmo, sem brigar com o arrasto do usuário.
- **Ordem de execução (decidida com o usuário):** 1 → 2 → 3 → **12 (modelo do Octocat 3D, aprovado parte por parte no navegador)** → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 13 (comportamento do Octocat 3D) → 14.
- **Octocat 3D (revisão da spec):** o Octocat deixou de ser SVG 2D no canto e virou modelo 3D na cena, que viaja entre planetas com câmera de perseguição. O SVG 2D sobra só no loader.

## Review Focus

1. **Repo vazio** (sem commits: `defaultBranchRef: null`, `pushedAt: null`) → vira planeta com grade zerada, `lastCommit: null`, `totalCommits: 0`, sem crash. Testes na Task 2 e na Task 6.
2. **Repo sem linguagens** → planeta sem luas; o painel mostra "Sem linguagens detectadas.". Teste na Task 4.
3. **Perfil com 0 ou 1 repo** → `buildOrbits` devolve sistemas vazios ou de um anel e `overviewPose` continua válida. Testes nas Tasks 5 e 9.
4. **Aba em segundo plano** (o `dt` do primeiro frame após voltar chega a dezenas de segundos) → relógio e mola do rosto limitam o passo, sem saltos nem explosão numérica. Testes nas Tasks 5 e 10.
5. **JSON publicado incompatível ou corrompido** (deploy antigo em cache, `schemaVersion` diferente, corpo que não é JSON) → mensagem clara com "tentar de novo", não uma cena quebrada. Teste na Task 7.

---

## File Structure

```
.github/workflows/ci.yml            # lint, typecheck, test, build, e2e (Task 13)
.github/workflows/deploy.yml        # snapshot + build + Pages (Task 13)
e2e/smoke.spec.ts                   # Playwright (Task 13)
playwright.config.ts                # (Task 13)
scripts/snapshot.ts                 # GitHub → public/universe.json (Task 6)
scripts/sample.ts                   # dados de exemplo → public/universe.json (Task 6)
public/universe.json                # dado de exemplo commitado (Task 6)
src/main.tsx, src/App.tsx, src/index.css
src/lib/types.ts                    # tipos de domínio + SCHEMA_VERSION (Task 2)
src/lib/interaction.ts              # seleção e eventos do guia (Task 2)
src/lib/format.ts                   # datas e números pt-BR (Task 7)
src/lib/cameraPoses.ts              # poses de câmera (Tasks 9 e 11)
src/lib/tutorial.ts                 # passos e textos do tutorial (Task 11)
src/lib/github/{config,client,queries,normalize,fetchUniverse,sample}.ts
src/lib/universe/{random,activity,planets,orbits,clock}.ts
src/lib/sun/{sunMachine,faceSpring}.ts
src/lib/octocat/lines.ts
src/data/loadUniverse.ts
src/hooks/{useUniverseData,useMediaQuery,useIdle}.ts, src/hooks/webgl.ts
src/store/{universe,tutorial,simClock}.ts
src/components/three/{Scene,SimClockDriver,Planet,Moon,OrbitLines,CameraRig,Sun}.tsx
src/components/three/{geometries,grid,usePlanetTexture,sunFace}.ts
src/components/ui/{Loader,LoadError,StaticFallback,ActivityTooltip,SidePanel,PlanetPanel,ProfilePanel,BackButton,Tutorial}.tsx
src/components/ui/octocat/OctocatArt.tsx               # SVG 2D do loader (Task 13)
src/components/ui/{OctocatSpeech,TutorialButton}.tsx    # (Task 13)
src/lib/octocat/expression.ts                           # (Task 12)
src/lib/ship/{geometry,motion,vec,travel,escort,shipMachine}.ts
src/store/shipPose.ts
src/components/three/octocat/{Ship,Pilot,ClawdHat,OctocatShip,ShipRig}.tsx, octocatFace.ts
src/preview/OctocatPreview.tsx                          # ?preview=octocat, só em dev (Task 12)
```

---

### Task 1: Scaffold Vite + React + Tailwind + Vitest

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `.env.example`, `.gitignore` (via create-vite)
- Delete: `src/App.css`, `src/assets/` (template)

**Interfaces:**
- Produces: alias `@/` → `src/`; scripts `dev`, `build`, `preview`, `lint`, `test`, `typecheck`, `snapshot`, `sample`, `e2e`; classes Tailwind `bg-space`, `text-neon`, `bg-panel`, `text-grid`.

- [ ] **Step 1: Gerar o template num diretório temporário e copiar para a raiz**

O repositório já tem `README.md`, `docs/`, `demo/` e `design/`, então o template é gerado à parte. Se o create-vite fizer perguntas extras (rolldown, "install and start now"), responda **No**.

```bash
pnpm create vite@latest .scaffold --template react-ts
rsync -a --exclude README.md .scaffold/ ./
rm -rf .scaffold src/App.css src/assets public/vite.svg
pnpm install
```

- [ ] **Step 2: Instalar as dependências**

```bash
pnpm add three @react-three/fiber @react-three/drei zustand framer-motion
pnpm add -D @types/three @types/node vitest tsx tailwindcss @tailwindcss/vite @playwright/test
```

- [ ] **Step 3: Configurar Vite, alias e Vitest**

Substitua `vite.config.ts` por:

```ts
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/github-universe-3d/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
```

Em `tsconfig.app.json`, dentro de `compilerOptions`, acrescente:

```json
"paths": { "@/*": ["./src/*"] }
```

Em `tsconfig.node.json`, troque `include` por `["vite.config.ts", "playwright.config.ts", "scripts", "e2e"]` e acrescente em `compilerOptions` o mesmo `"paths": { "@/*": ["./src/*"] }`.

Em `package.json`, deixe `scripts` assim (mantenha o `lint` que o template criou se ele já for `eslint .`):

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "lint": "eslint .",
  "test": "vitest run",
  "typecheck": "tsc -b",
  "snapshot": "tsx scripts/snapshot.ts",
  "sample": "tsx scripts/sample.ts",
  "e2e": "playwright test"
}
```

Acrescente também `"engines": { "node": ">=22" }`.

- [ ] **Step 4: Tokens de tema, HTML e app placeholder**

`src/index.css`:

```css
@import "tailwindcss";

@theme {
  --color-space: #0a0e27;
  --color-neon: #22d3ee;
  --color-grid: #10b981;
  --color-panel: #0f1535;
}

html,
body,
#root {
  height: 100%;
  background: #0a0e27;
  color: #f1f5f9;
}
```

`src/App.tsx`:

```tsx
export function App() {
  return <main className="grid h-full place-items-center text-neon">GitHub Universe 3D</main>
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Em `index.html`, troque `<html lang="en">` por `<html lang="pt-BR">`, o `<title>` por `GitHub Universe 3D`, e remova o `<link rel="icon" …vite.svg>`.

`.env.example`:

```bash
# Token fine-grained, só leitura de repositórios públicos. Nunca use prefixo VITE_.
UNIVERSE_TOKEN=
UNIVERSE_LOGIN=andrebrumdev
```

Confirme que o `.gitignore` gerado contém `*.local` (protege o `.env.local`).

- [ ] **Step 5: Verificar**

Run: `pnpm typecheck && pnpm vitest run --passWithNoTests && pnpm build`
Expected: os três terminam sem erro; `dist/index.html` referencia assets em `/github-universe-3d/assets/`.

Run: `pnpm dev` e abra `http://localhost:5173/github-universe-3d/`
Expected: texto ciano "GitHub Universe 3D" em fundo `#0a0e27`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + R3F + Tailwind + Vitest"
```

---

### Task 2: Tipos de domínio, interação e normalização do GraphQL

**Files:**
- Create: `src/lib/types.ts`, `src/lib/interaction.ts`, `src/lib/github/normalize.ts`, `src/lib/github/__fixtures__/raw.ts`
- Test: `src/lib/interaction.test.ts`, `src/lib/github/normalize.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `SCHEMA_VERSION`, `Language`, `Activity`, `CommitRef`, `RepoBase`, `Repo`, `Profile`, `Universe`.
  - `interaction.ts`: `UniverseSelection`, `selectedPlanet(sel): string | null`, `GuideEvent`, `guideEventFor(sel, zoomedOnce): GuideEvent | null`.
  - `normalize.ts`: `RawRepo`, `RawUser`, `FALLBACK_LANGUAGE_COLOR`, `normalizeRepo(raw): RepoBase`, `topLanguages(repos, limit?): Language[]`, `latestCommit(repos): CommitRef | null`, `normalizeProfile(raw, repos): Profile`.
  - `__fixtures__/raw.ts`: `rawRepo(overrides)`, `rawUser(repos, overrides?)`.

- [ ] **Step 1: Escrever os tipos**

`src/lib/types.ts`:

```ts
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
```

- [ ] **Step 2: Teste de interação (falha)**

`src/lib/interaction.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { guideEventFor, selectedPlanet } from './interaction'

describe('selectedPlanet', () => {
  it('devolve o planeta de uma seleção de planeta ou de lua', () => {
    expect(selectedPlanet({ kind: 'planet', name: 'alpha' })).toBe('alpha')
    expect(selectedPlanet({ kind: 'moon', planet: 'alpha', language: 'Go' })).toBe('alpha')
  })

  it('devolve null para perfil e nada selecionado', () => {
    expect(selectedPlanet({ kind: 'profile' })).toBeNull()
    expect(selectedPlanet({ kind: 'none' })).toBeNull()
  })
})

describe('guideEventFor', () => {
  it('mapeia seleção para o evento do guia', () => {
    expect(guideEventFor({ kind: 'profile' }, false)).toBe('sun')
    expect(guideEventFor({ kind: 'moon', planet: 'a', language: 'Go' }, true)).toBe('moon')
    expect(guideEventFor({ kind: 'none' }, false)).toBeNull()
  })

  it('o primeiro planeta focado dispara firstZoom, os seguintes disparam planet', () => {
    expect(guideEventFor({ kind: 'planet', name: 'a' }, false)).toBe('firstZoom')
    expect(guideEventFor({ kind: 'planet', name: 'a' }, true)).toBe('planet')
  })
})
```

Run: `pnpm test src/lib/interaction.test.ts`
Expected: FAIL ("Failed to resolve import './interaction'").

- [ ] **Step 3: Implementar a interação**

`src/lib/interaction.ts`:

```ts
export type UniverseSelection =
  | { kind: 'none' }
  | { kind: 'profile' }
  | { kind: 'planet'; name: string }
  | { kind: 'moon'; planet: string; language: string }

export type GuideEvent = 'sun' | 'planet' | 'moon' | 'firstZoom' | 'idle' | 'longIdle'

export function selectedPlanet(sel: UniverseSelection): string | null {
  if (sel.kind === 'planet') return sel.name
  if (sel.kind === 'moon') return sel.planet
  return null
}

export function guideEventFor(sel: UniverseSelection, zoomedOnce: boolean): GuideEvent | null {
  switch (sel.kind) {
    case 'profile':
      return 'sun'
    case 'planet':
      return zoomedOnce ? 'planet' : 'firstZoom'
    case 'moon':
      return 'moon'
    default:
      return null
  }
}
```

Run: `pnpm test src/lib/interaction.test.ts`
Expected: PASS.

- [ ] **Step 4: Fixtures do GraphQL**

`src/lib/github/__fixtures__/raw.ts`:

```ts
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
```

- [ ] **Step 5: Teste de normalização (falha)**

`src/lib/github/normalize.test.ts`:

```ts
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
```

Run: `pnpm test src/lib/github/normalize.test.ts`
Expected: FAIL (módulo `./normalize` não existe).

- [ ] **Step 6: Implementar a normalização**

`src/lib/github/normalize.ts`:

```ts
import type { CommitRef, Language, Profile, RepoBase } from '../types'

export interface RawHistory {
  totalCount: number
  nodes: { committedDate: string; messageHeadline: string }[]
}

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
```

Run: `pnpm test src/lib`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib
git commit -m "feat: tipos de domínio, seleção e normalização do GraphQL"
```

---

### Task 3: Atividade (grade 52×7 real e derivada)

**Files:**
- Create: `src/lib/universe/random.ts`, `src/lib/universe/activity.ts`
- Test: `src/lib/universe/activity.test.ts`

**Interfaces:**
- Consumes: `Activity` (Task 2).
- Produces:
  - `random.ts`: `hashString(s): number`, `mulberry32(seed): () => number`, `seededRandom(key: string): () => number`.
  - `activity.ts`: `GRID_WEEKS = 52`, `GRID_DAYS = 7`, `isoDate(d): string`, `startOfGrid(end: Date): Date`, `emptyWeeks(): number[][]`, `bucketCommits(dates: string[], end: Date): Activity`, `deriveActivity(seed: { name: string; pushedAt: string; stars: number }, end: Date): Activity`, `cellDate(startDate, week, day): string`, `maxCount(weeks): number`.

- [ ] **Step 1: Teste (falha)**

`src/lib/universe/activity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { bucketCommits, cellDate, deriveActivity, GRID_DAYS, GRID_WEEKS, maxCount, startOfGrid } from './activity'

const END = new Date('2026-10-08T12:00:00Z') // quinta-feira

const total = (weeks: number[][]) => weeks.flat().reduce((a, b) => a + b, 0)

describe('startOfGrid', () => {
  it('começa no domingo 51 semanas antes da semana atual', () => {
    expect(startOfGrid(END).toISOString().slice(0, 10)).toBe('2025-10-12')
  })
})

describe('bucketCommits', () => {
  it('agrupa por dia UTC numa grade 52×7 e ignora datas fora da janela', () => {
    const activity = bucketCommits(
      ['2026-10-08T10:00:00Z', '2026-10-08T23:59:59Z', '2025-10-12T00:00:00Z', '2025-10-11T23:00:00Z'],
      END,
    )
    expect(activity.source).toBe('real')
    expect(activity.startDate).toBe('2025-10-12')
    expect(activity.weeks).toHaveLength(GRID_WEEKS)
    expect(activity.weeks.every((w) => w.length === GRID_DAYS)).toBe(true)
    expect(activity.weeks[51][4]).toBe(2)
    expect(activity.weeks[0][0]).toBe(1)
    expect(total(activity.weeks)).toBe(3)
  })

  it('sem commits devolve grade zerada', () => {
    expect(total(bucketCommits([], END).weeks)).toBe(0)
  })
})

describe('deriveActivity', () => {
  const seed = { name: 'alpha', pushedAt: '2026-06-01T00:00:00Z', stars: 50 }

  it('é determinística', () => {
    expect(deriveActivity(seed, END)).toEqual(deriveActivity(seed, END))
  })

  it('muda com o nome do repo', () => {
    expect(deriveActivity(seed, END).weeks).not.toEqual(deriveActivity({ ...seed, name: 'beta' }, END).weeks)
  })

  it('não tem commits depois do último push e tem algum antes', () => {
    const activity = deriveActivity(seed, END)
    const pushedIdx = Math.floor((Date.UTC(2026, 5, 1) - Date.UTC(2025, 9, 12)) / 86_400_000)
    activity.weeks.forEach((week, w) =>
      week.forEach((count, d) => {
        if (w * 7 + d > pushedIdx) expect(count).toBe(0)
      }),
    )
    expect(activity.source).toBe('derived')
    expect(total(activity.weeks)).toBeGreaterThan(0)
  })
})

describe('helpers', () => {
  it('cellDate converte semana e dia para data ISO', () => {
    expect(cellDate('2025-10-12', 0, 0)).toBe('2025-10-12')
    expect(cellDate('2025-10-12', 51, 4)).toBe('2026-10-08')
  })

  it('maxCount devolve o maior valor', () => {
    expect(maxCount([[0, 3], [7, 1]])).toBe(7)
    expect(maxCount([[0]])).toBe(0)
  })
})
```

Run: `pnpm test src/lib/universe/activity.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 2: Implementar**

`src/lib/universe/random.ts`:

```ts
/** FNV-1a de 32 bits. */
export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** PRNG pequeno e determinístico, valores em [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededRandom(key: string): () => number {
  return mulberry32(hashString(key))
}
```

`src/lib/universe/activity.ts`:

```ts
import type { Activity } from '../types'
import { seededRandom } from './random'

export const GRID_WEEKS = 52
export const GRID_DAYS = 7
const DAY_MS = 86_400_000

function dayUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function startOfGrid(end: Date): Date {
  const d = new Date(dayUtc(end))
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() - (GRID_WEEKS - 1) * 7)
  return d
}

export function emptyWeeks(): number[][] {
  return Array.from({ length: GRID_WEEKS }, () => Array<number>(GRID_DAYS).fill(0))
}

export function bucketCommits(dates: string[], end: Date): Activity {
  const start = startOfGrid(end).getTime()
  const weeks = emptyWeeks()
  for (const iso of dates) {
    const idx = Math.floor((dayUtc(new Date(iso)) - start) / DAY_MS)
    if (idx < 0 || idx >= GRID_WEEKS * GRID_DAYS) continue
    weeks[Math.floor(idx / GRID_DAYS)][idx % GRID_DAYS]++
  }
  return { source: 'real', weeks, startDate: isoDate(new Date(start)) }
}

/** Padrão plausível para repos fora do top 10: concentrado perto do último push, mais denso com mais stars. */
export function deriveActivity(seed: { name: string; pushedAt: string; stars: number }, end: Date): Activity {
  const start = startOfGrid(end)
  const rng = seededRandom(seed.name)
  const pushedIdx = Math.floor((dayUtc(new Date(seed.pushedAt)) - start.getTime()) / DAY_MS)
  const base = 0.15 + Math.min(seed.stars, 100) / 400
  const weeks = emptyWeeks()
  for (let i = 0; i < GRID_WEEKS * GRID_DAYS && i <= pushedIdx; i++) {
    const p = base * Math.exp(-(pushedIdx - i) / 140)
    if (rng() < p) weeks[Math.floor(i / GRID_DAYS)][i % GRID_DAYS] = 1 + Math.floor(rng() * 4)
  }
  return { source: 'derived', weeks, startDate: isoDate(start) }
}

export function cellDate(startDate: string, week: number, day: number): string {
  const d = new Date(`${startDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + week * GRID_DAYS + day)
  return isoDate(d)
}

export function maxCount(weeks: number[][]): number {
  let max = 0
  for (const week of weeks) for (const count of week) if (count > max) max = count
  return max
}
```

Run: `pnpm test src/lib/universe/activity.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/universe
git commit -m "feat: grade de atividade real e derivada"
```

---

### Task 4: Planetas — raio, ranking, luas, eixo inclinado

**Files:**
- Create: `src/lib/universe/planets.ts`
- Test: `src/lib/universe/planets.test.ts`

**Interfaces:**
- Consumes: `Language`, `RepoBase` (Task 2); `seededRandom` (Task 3).
- Produces: `MIN_PLANET_RADIUS = 0.6`, `MAX_PLANET_RADIUS = 2.2`, `MAX_MOONS = 6`, `planetRadius(stars, forks)`, `planetScore(repo, now)`, `rankRepos<T>(repos, now): T[]`, `MoonSpec`, `moonOrbits(planetR, languages): MoonSpec[]`, `languageShares(langs): (Language & { share: number })[]`, `PlanetSpin`, `planetSpin(name): PlanetSpin`.

- [ ] **Step 1: Teste (falha)**

`src/lib/universe/planets.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  languageShares,
  MAX_MOONS,
  MAX_PLANET_RADIUS,
  MIN_PLANET_RADIUS,
  moonOrbits,
  planetRadius,
  planetSpin,
  rankRepos,
} from './planets'

const NOW = new Date('2026-10-08T00:00:00Z')
const lang = (name: string, bytes: number) => ({ name, color: '#fff', bytes })

describe('planetRadius', () => {
  it('fica entre o mínimo e o máximo e cresce com a popularidade', () => {
    expect(planetRadius(0, 0)).toBe(MIN_PLANET_RADIUS)
    expect(planetRadius(1_000_000, 0)).toBe(MAX_PLANET_RADIUS)
    expect(planetRadius(50, 5)).toBeGreaterThan(planetRadius(5, 0))
  })
})

describe('rankRepos', () => {
  it('ordena por stars e recência, com desempate por nome', () => {
    const repos = [
      { name: 'antigo', stars: 10, pushedAt: '2023-01-01T00:00:00Z' },
      { name: 'popular', stars: 500, pushedAt: '2025-01-01T00:00:00Z' },
      { name: 'recente', stars: 10, pushedAt: '2026-10-07T00:00:00Z' },
      { name: 'b-empate', stars: 0, pushedAt: '2020-01-01T00:00:00Z' },
      { name: 'a-empate', stars: 0, pushedAt: '2020-01-01T00:00:00Z' },
    ]
    expect(rankRepos(repos, NOW).map((r) => r.name)).toEqual(['popular', 'recente', 'antigo', 'a-empate', 'b-empate'])
  })
})

describe('moonOrbits', () => {
  it('repo sem linguagens não tem luas', () => {
    expect(moonOrbits(1, [])).toEqual([])
  })

  it('limita a MAX_MOONS e mantém luas maiores para mais bytes', () => {
    const langs = Array.from({ length: 9 }, (_, i) => lang(`L${i}`, 1000 - i * 100))
    const moons = moonOrbits(1, langs)
    expect(moons).toHaveLength(MAX_MOONS)
    for (let i = 1; i < moons.length; i++) expect(moons[i].radius).toBeLessThanOrEqual(moons[i - 1].radius)
  })

  it('órbitas crescem e não encostam no planeta nem entre si', () => {
    const moons = moonOrbits(2, [lang('a', 900), lang('b', 900), lang('c', 900)])
    expect(moons[0].orbitRadius - moons[0].radius).toBeGreaterThan(2)
    for (let i = 1; i < moons.length; i++) {
      expect(moons[i].orbitRadius - moons[i - 1].orbitRadius).toBeGreaterThan(moons[i].radius + moons[i - 1].radius)
    }
  })
})

describe('languageShares', () => {
  it('soma 100% e lida com lista vazia', () => {
    const shares = languageShares([lang('a', 300), lang('b', 100)])
    expect(shares.map((s) => s.share)).toEqual([75, 25])
    expect(languageShares([])).toEqual([])
  })
})

describe('planetSpin', () => {
  it('é determinístico e tem obliquidade entre 0 e 30°', () => {
    expect(planetSpin('alpha')).toEqual(planetSpin('alpha'))
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      const { obliquity } = planetSpin(name)
      expect(obliquity).toBeGreaterThanOrEqual(0)
      expect(obliquity).toBeLessThanOrEqual((30 * Math.PI) / 180)
    }
  })
})
```

Run: `pnpm test src/lib/universe/planets.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implementar**

`src/lib/universe/planets.ts`:

```ts
import type { Language, RepoBase } from '../types'
import { seededRandom } from './random'

export const MIN_PLANET_RADIUS = 0.6
export const MAX_PLANET_RADIUS = 2.2
export const MAX_MOONS = 6
const DAY_MS = 86_400_000

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function planetRadius(stars: number, forks: number): number {
  return clamp(MIN_PLANET_RADIUS + 0.55 * Math.log10(1 + stars + 2 * forks), MIN_PLANET_RADIUS, MAX_PLANET_RADIUS)
}

export function planetScore(repo: Pick<RepoBase, 'stars' | 'pushedAt'>, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - new Date(repo.pushedAt).getTime()) / DAY_MS)
  return Math.log10(1 + repo.stars) + 1.5 * Math.exp(-ageDays / 180)
}

export function rankRepos<T extends Pick<RepoBase, 'name' | 'stars' | 'pushedAt'>>(repos: T[], now: Date): T[] {
  return [...repos].sort((a, b) => planetScore(b, now) - planetScore(a, now) || a.name.localeCompare(b.name))
}

export interface MoonSpec {
  language: string
  color: string
  radius: number
  orbitRadius: number
  /** rad por segundo de simulação */
  speed: number
  inclination: number
  phase: number
}

/** `languages` deve vir ordenado por bytes (decrescente), como sai do normalize. */
export function moonOrbits(planetR: number, languages: Language[]): MoonSpec[] {
  const langs = languages.slice(0, MAX_MOONS)
  if (langs.length === 0) return []
  const maxBytes = Math.max(...langs.map((l) => l.bytes), 1)
  return langs.map((l, i) => ({
    language: l.name,
    color: l.color,
    radius: 0.12 + 0.23 * Math.sqrt(l.bytes / maxBytes),
    orbitRadius: planetR + 0.6 + i * 0.8,
    speed: 0.8 / (1 + i * 0.5),
    inclination: ((i % 3) - 1) * 0.12,
    phase: i * 2.399,
  }))
}

export function languageShares(langs: Language[]): (Language & { share: number })[] {
  const total = langs.reduce((sum, l) => sum + l.bytes, 0)
  if (total === 0) return []
  return langs.map((l) => ({ ...l, share: (l.bytes / total) * 100 }))
}

export interface PlanetSpin {
  /** Inclinação do eixo (ângulo de Euler em torno de z), rad. */
  obliquity: number
  /** Rotação própria, rad por segundo de simulação. */
  spinSpeed: number
  /** Precessão do eixo em torno de y, rad por segundo de simulação. */
  precessionSpeed: number
}

export function planetSpin(name: string): PlanetSpin {
  const rng = seededRandom(`spin-${name}`)
  return {
    obliquity: rng() * ((30 * Math.PI) / 180),
    spinSpeed: (0.15 + rng() * 0.25) * (rng() < 0.15 ? -1 : 1),
    precessionSpeed: 0.01 + rng() * 0.02,
  }
}
```

Run: `pnpm test src/lib/universe/planets.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/universe
git commit -m "feat: raio, ranking, luas e eixo inclinado dos planetas"
```

---

### Task 5: Órbitas de Kepler em anéis e relógio de simulação

**Files:**
- Create: `src/lib/universe/orbits.ts`, `src/lib/universe/clock.ts`
- Test: `src/lib/universe/orbits.test.ts`, `src/lib/universe/clock.test.ts`

**Interfaces:**
- Consumes: `seededRandom` (Task 3); `MIN_PLANET_RADIUS`, `MAX_PLANET_RADIUS` (Task 4, só nos testes).
- Produces:
  - `orbits.ts`: `Vec3 = [number, number, number]`, `Ring`, `PlanetOrbit`, `OrbitSystem`, `SUN_RADIUS = 2.5`, `INNER_PERIOD = 60`, `MAX_INCLINATION`, `ringCapacity(k)`, `buildOrbits(planets: { name: string; radius: number }[]): OrbitSystem`, `solveKepler(M, e): number`, `positionFromE(ring, E): Vec3`, `orbitPosition(ring, M): Vec3`, `planetPosition(ring, orbit, t): Vec3`, `orbitPath(ring, segments?): Vec3[]`.
  - `clock.ts`: `ClockState { time; scale }`, `SCALE_RATE = 3`, `MAX_DT = 0.1`, `advanceClock(s, dt, target): ClockState`, `predictStopTime(s): number`, `clockTarget({ reducedMotion, focused, tutorialFocus }): 0 | 1`.

- [ ] **Step 1: Teste das órbitas (falha)**

`src/lib/universe/orbits.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MAX_PLANET_RADIUS, MIN_PLANET_RADIUS } from './planets'
import {
  buildOrbits,
  MAX_INCLINATION,
  orbitPosition,
  planetPosition,
  type Ring,
  solveKepler,
  SUN_RADIUS,
  type Vec3,
} from './orbits'

const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

const ring = (over: Partial<Ring> = {}): Ring => ({
  index: 0,
  a: 10,
  e: 0.08,
  inclination: 0.1,
  node: 0.7,
  periapsis: 1.3,
  period: 60,
  maxRadius: 1,
  ...over,
})

describe('solveKepler', () => {
  it('resolve M = E − e·sin E com erro desprezível', () => {
    for (const e of [0, 0.02, 0.08, 0.1]) {
      for (let M = -Math.PI; M <= Math.PI; M += 0.37) {
        const E = solveKepler(M, e)
        expect(Math.abs(E - e * Math.sin(E) - M)).toBeLessThan(1e-9)
      }
    }
  })
})

describe('posição na órbita', () => {
  it('periélio a(1−e) em M=0 e afélio a(1+e) em M=π', () => {
    const r = ring()
    expect(len(orbitPosition(r, 0))).toBeCloseTo(r.a * (1 - r.e), 9)
    expect(len(orbitPosition(r, Math.PI))).toBeCloseTo(r.a * (1 + r.e), 9)
  })

  it('volta ao mesmo ponto depois de um período', () => {
    const r = ring()
    const orbit = { name: 'p', ring: 0, radius: 1, phase: 0.4 }
    const p0 = planetPosition(r, orbit, 12.3)
    const p1 = planetPosition(r, orbit, 12.3 + r.period)
    expect(dist(p0, p1)).toBeLessThan(1e-9)
  })

  it('órbita sem inclinação fica no plano y = 0', () => {
    const r = ring({ inclination: 0 })
    for (let M = 0; M < 6; M += 0.5) expect(Math.abs(orbitPosition(r, M)[1])).toBeLessThan(1e-12)
  })
})

describe('buildOrbits', () => {
  it('sistema vazio e sistema com um planeta', () => {
    expect(buildOrbits([])).toEqual({ rings: [], orbits: [] })
    const one = buildOrbits([{ name: 'solo', radius: 1 }])
    expect(one.rings).toHaveLength(1)
    expect(one.orbits[0]).toMatchObject({ name: 'solo', ring: 0 })
  })

  it('preenche anéis com 3 + 2k planetas, na ordem do ranking', () => {
    const planets = Array.from({ length: 40 }, (_, i) => ({ name: `p${i}`, radius: 1 }))
    const { rings, orbits } = buildOrbits(planets)
    const sizes = rings.map((r) => orbits.filter((o) => o.ring === r.index).length)
    expect(sizes).toEqual([3, 5, 7, 9, 11, 5])
    expect(orbits.map((o) => o.name)).toEqual(planets.map((p) => p.name))
  })

  it('segue a 3ª lei de Kepler e os limites de e e inclinação', () => {
    const { rings } = buildOrbits(Array.from({ length: 20 }, (_, i) => ({ name: `p${i}`, radius: 1.5 })))
    for (const r of rings) {
      expect(r.period / rings[0].period).toBeCloseTo(Math.pow(r.a / rings[0].a, 1.5), 9)
      expect(r.e).toBeGreaterThanOrEqual(0.02)
      expect(r.e).toBeLessThanOrEqual(0.08)
      expect(Math.abs(r.inclination)).toBeLessThanOrEqual(MAX_INCLINATION)
    }
  })

  it.each([
    ['raios mistos', (i: number) => (i % 2 ? MAX_PLANET_RADIUS : MIN_PLANET_RADIUS)],
    ['todos máximos', () => MAX_PLANET_RADIUS],
  ])('nenhuma colisão ao longo de um período do anel externo (%s)', (_, radiusOf) => {
    const planets = Array.from({ length: 40 }, (_, i) => ({ name: `p${i}`, radius: radiusOf(i) }))
    const { rings, orbits } = buildOrbits(planets)
    const outer = rings[rings.length - 1]
    for (let s = 0; s < 400; s++) {
      const t = (s / 400) * outer.period
      const pos = orbits.map((o) => planetPosition(rings[o.ring], o, t))
      for (let i = 0; i < orbits.length; i++) {
        expect(len(pos[i])).toBeGreaterThan(SUN_RADIUS + orbits[i].radius)
        for (let j = i + 1; j < orbits.length; j++) {
          expect(dist(pos[i], pos[j])).toBeGreaterThan(orbits[i].radius + orbits[j].radius)
        }
      }
    }
  })
})
```

Run: `pnpm test src/lib/universe/orbits.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implementar as órbitas**

`src/lib/universe/orbits.ts`:

```ts
import { seededRandom } from './random'

export type Vec3 = [number, number, number]

export interface Ring {
  index: number
  /** semieixo maior */
  a: number
  /** excentricidade */
  e: number
  /** inclinação i (Euler) */
  inclination: number
  /** longitude do nó ascendente Ω (Euler) */
  node: number
  /** argumento do periélio ω (Euler) */
  periapsis: number
  /** segundos de simulação por volta */
  period: number
  /** maior raio de planeta no anel */
  maxRadius: number
}

export interface PlanetOrbit {
  name: string
  ring: number
  radius: number
  /** anomalia média em t = 0 */
  phase: number
}

export interface OrbitSystem {
  rings: Ring[]
  /** Mesma ordem dos planetas recebidos. */
  orbits: PlanetOrbit[]
}

export const SUN_RADIUS = 2.5
export const INNER_PERIOD = 60
export const MAX_INCLINATION = (6 * Math.PI) / 180
const SUN_CLEARANCE = 3
const RING_GAP = 1.2

export function ringCapacity(k: number): number {
  return 3 + 2 * k
}

export function buildOrbits(planets: { name: string; radius: number }[]): OrbitSystem {
  const rings: Ring[] = []
  const orbits: PlanetOrbit[] = []
  let start = 0
  for (let k = 0; start < planets.length; k++) {
    const members = planets.slice(start, start + ringCapacity(k))
    const n = members.length
    const maxRadius = Math.max(...members.map((m) => m.radius))
    const rng = seededRandom(`ring-${k}`)
    const e = 0.02 + rng() * 0.06
    const inclination = (rng() * 2 - 1) * MAX_INCLINATION
    const node = rng() * Math.PI * 2
    const periapsis = rng() * Math.PI * 2

    const prev = rings[k - 1]
    // O periélio deste anel fica além do afélio do anterior (ou do sol), com folga.
    const minPeri = prev
      ? prev.a * (1 + prev.e) + prev.maxRadius + maxRadius + RING_GAP
      : SUN_RADIUS + SUN_CLEARANCE + maxRadius
    // Vizinhos no mesmo anel: a separação em anomalia verdadeira encolhe no afélio (fator ≥ 0,8 para e ≤ 0,08).
    const sameRing = n > 1 ? (2 * maxRadius + RING_GAP) / (2 * Math.sin((0.8 * Math.PI) / n)) : 0
    const a = Math.max(minPeri, sameRing) / (1 - e)
    const period = rings.length ? INNER_PERIOD * Math.pow(a / rings[0].a, 1.5) : INNER_PERIOD

    rings.push({ index: k, a, e, inclination, node, periapsis, period, maxRadius })
    members.forEach((m, i) => orbits.push({ name: m.name, ring: k, radius: m.radius, phase: (i / n) * Math.PI * 2 + k * 0.7 }))
    start += n
  }
  return { rings, orbits }
}

/** Equação de Kepler M = E − e·sin E, por Newton (converge em poucas iterações para e ≤ 0,1). */
export function solveKepler(M: number, e: number): number {
  let E = M
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  return E
}

export function positionFromE(ring: Ring, E: number): Vec3 {
  const { a, e, node, inclination, periapsis } = ring
  const xp = a * (Math.cos(E) - e)
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const cO = Math.cos(node), sO = Math.sin(node)
  const ci = Math.cos(inclination), si = Math.sin(inclination)
  const cw = Math.cos(periapsis), sw = Math.sin(periapsis)
  // Rotação 3-1-3 (Ω, i, ω) do plano orbital para o referencial do sol.
  const X = (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp
  const Y = (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp
  const Z = sw * si * xp + cw * si * yp
  // Astronomia usa Z para cima; Three.js usa Y para cima.
  return [X, Z, -Y]
}

export function orbitPosition(ring: Ring, M: number): Vec3 {
  return positionFromE(ring, solveKepler(M, ring.e))
}

export function planetPosition(ring: Ring, orbit: PlanetOrbit, t: number): Vec3 {
  return orbitPosition(ring, orbit.phase + (2 * Math.PI * t) / ring.period)
}

export function orbitPath(ring: Ring, segments = 160): Vec3[] {
  return Array.from({ length: segments + 1 }, (_, i) => positionFromE(ring, (i / segments) * Math.PI * 2))
}
```

Run: `pnpm test src/lib/universe/orbits.test.ts`
Expected: PASS.

- [ ] **Step 3: Teste do relógio (falha)**

`src/lib/universe/clock.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { advanceClock, clockTarget, MAX_DT, predictStopTime, type ClockState } from './clock'

const run = (s: ClockState, seconds: number, target: number, dt = 1 / 60) => {
  let state = s
  for (let i = 0; i < Math.round(seconds / dt); i++) state = advanceClock(state, dt, target)
  return state
}

describe('advanceClock', () => {
  it('desacelera até quase parar em ~1 s', () => {
    expect(run({ time: 0, scale: 1 }, 1, 0).scale).toBeLessThan(0.06)
    expect(run({ time: 0, scale: 1 }, 3, 0).scale).toBe(0)
  })

  it('acelera de volta', () => {
    expect(run({ time: 0, scale: 0 }, 3, 1).scale).toBe(1)
  })

  it('o tempo avança proporcional à escala', () => {
    expect(run({ time: 5, scale: 1 }, 2, 1).time).toBeCloseTo(7, 6)
  })

  it('limita dt enorme (aba em segundo plano)', () => {
    expect(advanceClock({ time: 0, scale: 1 }, 30, 1).time).toBeLessThanOrEqual(MAX_DT)
  })
})

describe('predictStopTime', () => {
  it('prevê onde a simulação para', () => {
    const start = { time: 10, scale: 1 }
    expect(run(start, 5, 0).time).toBeCloseTo(predictStopTime(start), 1)
  })
})

describe('clockTarget', () => {
  it('para com foco, tutorial focado ou movimento reduzido', () => {
    expect(clockTarget({ reducedMotion: false, focused: false, tutorialFocus: false })).toBe(1)
    expect(clockTarget({ reducedMotion: true, focused: false, tutorialFocus: false })).toBe(0)
    expect(clockTarget({ reducedMotion: false, focused: true, tutorialFocus: false })).toBe(0)
    expect(clockTarget({ reducedMotion: false, focused: false, tutorialFocus: true })).toBe(0)
  })
})
```

Run: `pnpm test src/lib/universe/clock.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar o relógio**

`src/lib/universe/clock.ts`:

```ts
export interface ClockState {
  /** segundos de simulação */
  time: number
  /** 0 = parado, 1 = velocidade normal */
  scale: number
}

/** Taxa (1/s) com que a escala persegue o alvo: ~95% em 1 s. */
export const SCALE_RATE = 3
/** Maior passo aceito; protege contra o dt gigante de uma aba que volta do segundo plano. */
export const MAX_DT = 0.1

export function advanceClock(s: ClockState, dt: number, target: number): ClockState {
  const step = Math.min(Math.max(dt, 0), MAX_DT)
  const k = 1 - Math.exp(-SCALE_RATE * step)
  let scale = s.scale + (target - s.scale) * k
  if (Math.abs(scale - target) < 1e-3) scale = target
  return { time: s.time + step * scale, scale }
}

/** Tempo em que a simulação para se o alvo virar 0 agora (integral do decaimento exponencial). */
export function predictStopTime(s: ClockState): number {
  return s.time + s.scale / SCALE_RATE
}

export function clockTarget(o: { reducedMotion: boolean; focused: boolean; tutorialFocus: boolean }): 0 | 1 {
  return o.reducedMotion || o.focused || o.tutorialFocus ? 0 : 1
}
```

Run: `pnpm test src/lib/universe`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/universe
git commit -m "feat: órbitas de Kepler em anéis e relógio de simulação"
```

---

### Task 6: Cliente GitHub, snapshot e dado de exemplo

**Files:**
- Create: `src/lib/github/config.ts`, `src/lib/github/client.ts`, `src/lib/github/queries.ts`, `src/lib/github/fetchUniverse.ts`, `src/lib/github/sample.ts`, `scripts/snapshot.ts`, `scripts/sample.ts`, `public/universe.json`
- Test: `src/lib/github/fetchUniverse.test.ts`, `src/lib/github/sample.test.ts`

**Interfaces:**
- Consumes: `normalizeRepo`, `normalizeProfile`, `topLanguages`, `latestCommit`, `RawUser` (Task 2); `bucketCommits`, `deriveActivity`, `startOfGrid` (Task 3); `rankRepos` (Task 4); `SCHEMA_VERSION`, `Universe` (Task 2).
- Produces: `TOP_REAL`, `MAX_PLANETS`, `MAX_HISTORY_PAGES`, `GITHUB_GRAPHQL_URL`; `GitHubError`, `gql<T>(fetchImpl, token, query, variables)`; `USER_QUERY`, `HISTORY_QUERY`; `FetchDeps { token; fetchImpl?; now?; onWarning? }`, `fetchUniverse(login, deps): Promise<Universe>`, `fetchCommitDates(...)`; `buildSampleUniverse(now?): Universe`.

- [ ] **Step 1: Configuração, cliente e queries**

`src/lib/github/config.ts`:

```ts
export const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql'
/** Repos com atividade real (histórico paginado). */
export const TOP_REAL = 10
/** Planetas renderizados. */
export const MAX_PLANETS = 40
/** 100 commits por página → até 1000 commits por repo no ano. */
export const MAX_HISTORY_PAGES = 10
```

`src/lib/github/client.ts`:

```ts
import { GITHUB_GRAPHQL_URL } from './config'

export class GitHubError extends Error {}

export async function gql<T>(
  fetchImpl: typeof fetch,
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetchImpl(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new GitHubError(`GitHub respondeu ${res.status}`)
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] }
  if (json.errors?.length) throw new GitHubError(json.errors[0].message)
  if (!json.data) throw new GitHubError('Resposta do GitHub sem dados')
  return json.data
}
```

`src/lib/github/queries.ts`:

```ts
export const USER_QUERY = /* GraphQL */ `
  query Universe($login: String!) {
    user(login: $login) {
      id
      login
      name
      bio
      avatarUrl
      followers { totalCount }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, orderBy: { field: PUSHED_AT, direction: DESC }) {
        totalCount
        nodes {
          name
          description
          url
          stargazerCount
          forkCount
          pushedAt
          watchers { totalCount }
          primaryLanguage { name }
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name color } }
          }
          defaultBranchRef {
            target {
              ... on Commit {
                history(first: 1) { totalCount nodes { committedDate messageHeadline } }
              }
            }
          }
        }
      }
    }
  }
`

export const HISTORY_QUERY = /* GraphQL */ `
  query History($owner: String!, $name: String!, $authorId: ID!, $since: GitTimestamp!, $after: String) {
    repository(owner: $owner, name: $name) {
      defaultBranchRef {
        target {
          ... on Commit {
            history(first: 100, after: $after, since: $since, author: { id: $authorId }) {
              pageInfo { hasNextPage endCursor }
              nodes { committedDate }
            }
          }
        }
      }
    }
  }
`
```

- [ ] **Step 2: Teste do `fetchUniverse` (falha)**

`src/lib/github/fetchUniverse.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rawRepo, rawUser } from './__fixtures__/raw'
import { MAX_PLANETS, TOP_REAL } from './config'
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
```

Run: `pnpm test src/lib/github/fetchUniverse.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar o `fetchUniverse`**

`src/lib/github/fetchUniverse.ts`:

```ts
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
```

Run: `pnpm test src/lib/github`
Expected: PASS.

- [ ] **Step 4: Dado de exemplo (teste, falha)**

`src/lib/github/sample.test.ts`:

```ts
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
})
```

Run: `pnpm test src/lib/github/sample.test.ts`
Expected: FAIL.

- [ ] **Step 5: Implementar o exemplo e os scripts**

`src/lib/github/sample.ts`:

```ts
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
```

`scripts/sample.ts`:

```ts
import { writeFile } from 'node:fs/promises'
import { buildSampleUniverse } from '../src/lib/github/sample'

const universe = buildSampleUniverse()
await writeFile('public/universe.json', JSON.stringify(universe) + '\n')
console.log(`universe.json de exemplo: ${universe.repos.length} planetas`)
```

`scripts/snapshot.ts`:

```ts
import { writeFile } from 'node:fs/promises'
import { fetchUniverse } from '../src/lib/github/fetchUniverse'

try {
  process.loadEnvFile('.env.local')
} catch {
  // Sem .env.local: usa as variáveis do ambiente (GitHub Action).
}

const token = process.env.UNIVERSE_TOKEN
const login = process.env.UNIVERSE_LOGIN
if (!token) {
  console.error('Defina UNIVERSE_TOKEN em Settings → Secrets (Action) ou em .env.local (local).')
  process.exit(1)
}
if (!login) {
  console.error('Defina UNIVERSE_LOGIN com o usuário do GitHub.')
  process.exit(1)
}

const warn = (m: string) => console.log(process.env.GITHUB_ACTIONS ? `::warning::${m}` : `aviso: ${m}`)
const universe = await fetchUniverse(login, { token, onWarning: warn })
await writeFile('public/universe.json', JSON.stringify(universe) + '\n')
console.log(`universe.json: ${universe.repos.length} planetas de ${login}, gerado em ${universe.generatedAt}`)
```

- [ ] **Step 6: Gerar e conferir o exemplo**

Run: `pnpm test src/lib/github && pnpm sample && pnpm typecheck`
Expected: testes PASS; "universe.json de exemplo: 14 planetas"; typecheck sem erro.

Opcional (precisa de token): crie `.env.local` a partir de `.env.example` com um token fine-grained de leitura de repos públicos e rode `pnpm snapshot`. Se não houver token, **não peça um ao usuário nesta task**: o exemplo basta para o desenvolvimento e o e2e. **Não commite** um `universe.json` real gerado localmente; o commitado é sempre o de `pnpm sample`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/github scripts public/universe.json
git commit -m "feat: snapshot do GitHub e universo de exemplo"
```

---

### Task 7: Store, falas do guia, carregamento de dados e casca do app

**Files:**
- Create: `src/lib/format.ts`, `src/lib/octocat/lines.ts`, `src/data/loadUniverse.ts`, `src/store/universe.ts`, `src/hooks/useUniverseData.ts`, `src/hooks/webgl.ts`, `src/hooks/useMediaQuery.ts`, `src/components/ui/Loader.tsx`, `src/components/ui/LoadError.tsx`, `src/components/ui/StaticFallback.tsx`
- Modify: `src/App.tsx`
- Test: `src/lib/format.test.ts`, `src/lib/octocat/lines.test.ts`, `src/data/loadUniverse.test.ts`, `src/store/universe.test.ts`

**Interfaces:**
- Consumes: `UniverseSelection`, `GuideEvent`, `guideEventFor`, `SCHEMA_VERSION`, `Universe` (Task 2).
- Produces:
  - `format.ts`: `formatDate(iso)`, `formatCount(n)`, `timeAgo(iso, now?)`, `commitsLabel(n)`.
  - `lines.ts`: reexporta `OctocatExpression` de `src/lib/octocat/expression.ts` (criado na Task 12), `OctocatLine`, `LINES`, `LINE_DURATION_MS = 4000`, `IDLE_MS = 20000`, `LONG_IDLE_MS = 60000`, `pickLine(event, seen)`, `firstName(full)`, `formatLine(text, name)`.
  - `loadUniverse.ts`: `UniverseLoadError`, `loadUniverse(fetchImpl?, base?): Promise<Universe>`.
  - `store/universe.ts`: `useUniverse` com `selection`, `hoveredCell: HoveredCell | null`, `zoomedOnce`, `bubble: Bubble | null`, `select(s)`, `clearSelection()`, `setHoveredCell(c)`, `emitGuide(t)`, `dismissBubble(seq)`.
  - Hooks: `useUniverseData(): { state: DataState; retry(): void }`, `supportsWebGL(): boolean`, `useMediaQuery(q): boolean`, `MOBILE_QUERY`.

- [ ] **Step 1: Testes de formatação e falas (falham)**

`src/lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { commitsLabel, formatCount, formatDate, timeAgo } from './format'

describe('format', () => {
  it('formata datas em pt-BR, sem deslocar o dia pelo fuso', () => {
    const text = formatDate('2026-10-08')
    expect(text).toContain('8')
    expect(text).toContain('out')
    expect(text).toContain('2026')
  })

  it('tempo relativo', () => {
    const now = new Date('2026-10-08T12:00:00Z')
    expect(timeAgo('2026-10-05T12:00:00Z', now)).toBe('há 3 dias')
    expect(timeAgo('2026-10-07T11:00:00Z', now)).toBe('ontem')
    expect(timeAgo('2026-10-08T11:59:50Z', now)).toBe('agora mesmo')
  })

  it('números compactos e rótulo de commits', () => {
    expect(formatCount(950)).toBe('950')
    expect(formatCount(1500)).toContain('1,5')
    expect(commitsLabel(1)).toBe('1 commit')
    expect(commitsLabel(0)).toBe('0 commits')
  })
})
```

`src/lib/octocat/lines.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { firstName, formatLine, LINES, pickLine } from './lines'

describe('falas do Octocat', () => {
  it('toda fala tem texto', () => {
    for (const line of Object.values(LINES)) expect(line.text.length).toBeGreaterThan(0)
  })

  it('falas de primeira vez aparecem uma vez', () => {
    expect(pickLine('firstZoom', new Set())).not.toBeNull()
    expect(pickLine('firstZoom', new Set(['firstZoom']))).toBeNull()
    expect(pickLine('planet', new Set(['planet']))).not.toBeNull()
  })

  it('a fala do sol fala do perfil, não do visitante', () => {
    expect(formatLine(LINES.sun.text, 'André Brum')).toBe('Esse é o perfil GitHub de André!')
  })

  it('primeiro nome', () => {
    expect(firstName('  Mona   Octocat ')).toBe('Mona')
    expect(firstName('')).toBe('')
  })
})
```

Run: `pnpm test src/lib/format.test.ts src/lib/octocat`
Expected: FAIL.

- [ ] **Step 2: Implementar formatação e falas**

`src/lib/format.ts`:

```ts
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const countFmt = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const relFmt = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso))
}

export function formatCount(n: number): string {
  return countFmt.format(n)
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
]

export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relFmt.format(-Math.floor(seconds / size), unit)
  }
  return 'agora mesmo'
}

export function commitsLabel(n: number): string {
  return n === 1 ? '1 commit' : `${n} commits`
}
```

`src/lib/octocat/lines.ts`:

```ts
import type { GuideEvent } from '../interaction'
import type { OctocatExpression } from './expression'

export type { OctocatExpression }

export interface OctocatLine {
  id: GuideEvent
  /** `{name}` vira o primeiro nome do perfil. */
  text: string
  once: boolean
  expression: OctocatExpression
}

export const LINES: Record<GuideEvent, OctocatLine> = {
  sun: { id: 'sun', text: 'Esse é o perfil GitHub de {name}!', once: false, expression: 'happy' },
  planet: { id: 'planet', text: 'Olha que legal esse repo aqui!', once: false, expression: 'surprised' },
  moon: { id: 'moon', text: 'Essa linguagem é importante nesse projeto!', once: false, expression: 'happy' },
  firstZoom: { id: 'firstZoom', text: 'Uau, dá pra ver bem mais de perto!', once: true, expression: 'surprised' },
  idle: { id: 'idle', text: 'Oi, tá aí?', once: true, expression: 'wink' },
  longIdle: { id: 'longIdle', text: 'Ei, se precisar de ajuda, é comigo!', once: true, expression: 'happy' },
}

export const LINE_DURATION_MS = 4000
export const IDLE_MS = 20_000
export const LONG_IDLE_MS = 60_000

export function pickLine(event: GuideEvent, seen: ReadonlySet<string>): OctocatLine | null {
  const line = LINES[event]
  return line.once && seen.has(line.id) ? null : line
}

export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? ''
}

export function formatLine(text: string, name: string): string {
  return text.replaceAll('{name}', firstName(name))
}
```

Run: `pnpm test src/lib/format.test.ts src/lib/octocat`
Expected: PASS.

- [ ] **Step 3: Teste do carregamento (falha)**

`src/data/loadUniverse.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildSampleUniverse } from '../lib/github/sample'
import { loadUniverse, UniverseLoadError } from './loadUniverse'

const respond = (body: string, status = 200) => (async () => new Response(body, { status })) as typeof fetch

describe('loadUniverse', () => {
  it('carrega o JSON publicado', async () => {
    const sample = buildSampleUniverse()
    let url = ''
    const impl = (async (input: RequestInfo | URL) => {
      url = String(input)
      return new Response(JSON.stringify(sample))
    }) as typeof fetch
    await expect(loadUniverse(impl, '/github-universe-3d/')).resolves.toEqual(sample)
    expect(url).toBe('/github-universe-3d/universe.json')
  })

  it('HTTP com erro vira UniverseLoadError', async () => {
    await expect(loadUniverse(respond('nope', 404), '/')).rejects.toThrow(UniverseLoadError)
  })

  it('schemaVersion diferente vira UniverseLoadError com mensagem clara', async () => {
    const old = JSON.stringify({ ...buildSampleUniverse(), schemaVersion: 0 })
    await expect(loadUniverse(respond(old), '/')).rejects.toThrow(/versão diferente/)
  })

  it('corpo que não é JSON vira UniverseLoadError', async () => {
    await expect(loadUniverse(respond('<html>'), '/')).rejects.toThrow(UniverseLoadError)
  })
})
```

Run: `pnpm test src/data`
Expected: FAIL.

- [ ] **Step 4: Implementar o carregamento**

`src/data/loadUniverse.ts`:

```ts
import { SCHEMA_VERSION, type Universe } from '../lib/types'

export class UniverseLoadError extends Error {}

export async function loadUniverse(fetchImpl: typeof fetch = fetch, base: string = import.meta.env.BASE_URL): Promise<Universe> {
  const res = await fetchImpl(`${base}universe.json`, { cache: 'no-cache' })
  if (!res.ok) throw new UniverseLoadError(`Não foi possível carregar os dados (HTTP ${res.status}).`)
  let data: Partial<Universe>
  try {
    data = (await res.json()) as Partial<Universe>
  } catch {
    throw new UniverseLoadError('Os dados publicados estão corrompidos.')
  }
  if (data.schemaVersion !== SCHEMA_VERSION) {
    throw new UniverseLoadError('Os dados publicados são de uma versão diferente do site. Recarregue a página em instantes.')
  }
  return data as Universe
}
```

Run: `pnpm test src/data`
Expected: PASS.

- [ ] **Step 5: Teste do store (falha)**

`src/store/universe.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useUniverse } from './universe'

const s = () => useUniverse.getState()

beforeEach(() => useUniverse.setState(useUniverse.getInitialState(), true))

describe('store do universo', () => {
  it('selecionar o sol mostra a fala do perfil', () => {
    s().select({ kind: 'profile' })
    expect(s().selection).toEqual({ kind: 'profile' })
    expect(s().bubble?.line.id).toBe('sun')
  })

  it('primeiro planeta: firstZoom; depois: planet; firstZoom não repete', () => {
    s().select({ kind: 'planet', name: 'a' })
    expect(s().bubble?.line.id).toBe('firstZoom')
    s().select({ kind: 'planet', name: 'b' })
    expect(s().bubble?.line.id).toBe('planet')
    s().emitGuide('firstZoom')
    expect(s().bubble?.line.id).toBe('planet')
  })

  it('selecionar limpa o hover e clearSelection volta ao nada', () => {
    s().setHoveredCell({ planet: 'a', week: 1, day: 2, count: 3, date: '2026-01-01', x: 0, y: 0 })
    s().select({ kind: 'planet', name: 'a' })
    expect(s().hoveredCell).toBeNull()
    s().clearSelection()
    expect(s().selection).toEqual({ kind: 'none' })
  })

  it('dismissBubble só fecha o balão daquela sequência', () => {
    s().emitGuide('idle')
    const seq = s().bubble!.seq
    s().emitGuide('planet')
    s().dismissBubble(seq)
    expect(s().bubble?.line.id).toBe('planet')
    s().dismissBubble(s().bubble!.seq)
    expect(s().bubble).toBeNull()
  })
})
```

Run: `pnpm test src/store`
Expected: FAIL.

- [ ] **Step 6: Implementar o store**

`src/store/universe.ts`:

```ts
import { create } from 'zustand'
import { guideEventFor, type GuideEvent, type UniverseSelection } from '@/lib/interaction'
import { pickLine, type OctocatLine } from '@/lib/octocat/lines'

export interface HoveredCell {
  planet: string
  week: number
  day: number
  count: number
  date: string
  x: number
  y: number
}

export interface Bubble {
  line: OctocatLine
  seq: number
}

interface UniverseState {
  selection: UniverseSelection
  hoveredCell: HoveredCell | null
  zoomedOnce: boolean
  bubble: Bubble | null
  seenLines: string[]
  seq: number
  select: (selection: UniverseSelection) => void
  clearSelection: () => void
  setHoveredCell: (cell: HoveredCell | null) => void
  emitGuide: (event: GuideEvent) => void
  dismissBubble: (seq: number) => void
}

export const useUniverse = create<UniverseState>()((set, get) => ({
  selection: { kind: 'none' },
  hoveredCell: null,
  zoomedOnce: false,
  bubble: null,
  seenLines: [],
  seq: 0,
  select: (selection) => {
    const { zoomedOnce } = get()
    const event = guideEventFor(selection, zoomedOnce)
    set({
      selection,
      hoveredCell: null,
      zoomedOnce: zoomedOnce || selection.kind === 'planet' || selection.kind === 'moon',
    })
    if (event) get().emitGuide(event)
  },
  clearSelection: () => set({ selection: { kind: 'none' }, hoveredCell: null }),
  setHoveredCell: (hoveredCell) => set({ hoveredCell }),
  emitGuide: (event) => {
    const { seenLines, seq } = get()
    const line = pickLine(event, new Set(seenLines))
    if (!line) return
    set({ bubble: { line, seq: seq + 1 }, seq: seq + 1, seenLines: line.once ? [...seenLines, line.id] : seenLines })
  },
  dismissBubble: (s) => {
    if (get().bubble?.seq === s) set({ bubble: null })
  },
}))
```

Run: `pnpm test src/store`
Expected: PASS.

- [ ] **Step 7: Hooks**

`src/hooks/webgl.ts`:

```ts
export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}
```

`src/hooks/useMediaQuery.ts`:

```ts
import { useCallback, useSyncExternalStore } from 'react'

export const MOBILE_QUERY = '(max-width: 767px)'

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}
```

`src/hooks/useUniverseData.ts`:

```ts
import { useEffect, useState } from 'react'
import { loadUniverse, UniverseLoadError } from '@/data/loadUniverse'
import type { Universe } from '@/lib/types'

export type DataState =
  | { status: 'loading' }
  | { status: 'ready'; universe: Universe }
  | { status: 'error'; message: string }

export function useUniverseData(): { state: DataState; retry: () => void } {
  const [state, setState] = useState<DataState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    loadUniverse()
      .then((universe) => alive && setState({ status: 'ready', universe }))
      .catch((err: unknown) => {
        if (!alive) return
        const message = err instanceof UniverseLoadError ? err.message : 'Não foi possível carregar os dados. Verifique sua conexão.'
        setState({ status: 'error', message })
      })
    return () => {
      alive = false
    }
  }, [attempt])

  return {
    state,
    retry: () => {
      setState({ status: 'loading' })
      setAttempt((a) => a + 1)
    },
  }
}
```

- [ ] **Step 8: Telas de carregamento, erro e fallback**

`src/components/ui/Loader.tsx`:

```tsx
export function Loader() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-space">
      <p className="animate-pulse text-sm text-slate-400">Carregando dados do GitHub…</p>
    </div>
  )
}
```

`src/components/ui/LoadError.tsx`:

```tsx
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="fixed inset-0 grid place-items-center bg-space px-4">
      <div className="max-w-sm text-center">
        <p className="text-slate-200">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-full border border-neon/50 px-5 py-2 text-sm text-neon hover:bg-neon/10"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  )
}
```

`src/components/ui/StaticFallback.tsx`:

```tsx
import { formatCount } from '@/lib/format'
import type { Universe } from '@/lib/types'

export function StaticFallback({ universe }: { universe: Universe }) {
  const { profile, repos } = universe
  return (
    <main className="min-h-full bg-space px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-2xl">
        <p role="alert" className="mb-6 rounded-lg border border-neon/30 p-4 text-sm text-slate-300">
          Seu navegador não suporta WebGL, então o universo 3D não pode ser exibido. Aqui está a versão em lista.
        </p>
        <h1 className="text-2xl font-semibold">{profile.name}</h1>
        {profile.bio && <p className="mt-1 text-slate-400">{profile.bio}</p>}
        <ul className="mt-6 space-y-3">
          {repos.map((repo) => (
            <li key={repo.name} className="rounded-lg border border-slate-700/60 p-3">
              <a href={repo.url} target="_blank" rel="noreferrer" className="font-medium text-neon hover:underline">
                {repo.name}
              </a>
              {repo.description && <p className="text-sm text-slate-400">{repo.description}</p>}
              <p className="text-xs text-slate-500">
                ★ {formatCount(repo.stars)} · {repo.primaryLanguage ?? 'sem linguagem'}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
```

`src/App.tsx`:

```tsx
import { useState } from 'react'
import { LoadError } from '@/components/ui/LoadError'
import { Loader } from '@/components/ui/Loader'
import { StaticFallback } from '@/components/ui/StaticFallback'
import { useUniverseData } from '@/hooks/useUniverseData'
import { supportsWebGL } from '@/hooks/webgl'

export function App() {
  const { state, retry } = useUniverseData()
  const [webgl] = useState(supportsWebGL)

  if (state.status === 'error') return <LoadError message={state.message} onRetry={retry} />
  if (state.status === 'loading') return <Loader />
  if (!webgl) return <StaticFallback universe={state.universe} />
  return (
    <main className="fixed inset-0 grid place-items-center bg-space text-slate-300">
      {state.universe.repos.length} planetas carregados
    </main>
  )
}
```

- [ ] **Step 9: Verificar**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: tudo PASS / sem erros.

Run: `pnpm dev` e abra `http://localhost:5173/github-universe-3d/`
Expected: "Carregando dados do GitHub…" e depois "14 planetas carregados". Renomeie `public/universe.json` temporariamente e recarregue: aparece a mensagem "HTTP 404" com "Tentar de novo". Restaure o arquivo.

- [ ] **Step 10: Commit**

```bash
git add src
git commit -m "feat: store, falas do guia e carregamento do universe.json"
```

---

### Task 8: Cena — planetas em órbita, superfície, luas, linhas de órbita e tooltip

**Files:**
- Create: `src/store/simClock.ts`, `src/components/three/geometries.ts`, `src/components/three/grid.ts`, `src/components/three/usePlanetTexture.ts`, `src/components/three/SimClockDriver.tsx`, `src/components/three/Planet.tsx`, `src/components/three/Moon.tsx`, `src/components/three/OrbitLines.tsx`, `src/components/three/Scene.tsx`, `src/components/ui/ActivityTooltip.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/three/grid.test.ts` (o Vitest só inclui `src/**/*.test.ts`, então esse caminho entra)

**Interfaces:**
- Consumes: `buildOrbits`, `planetPosition`, `orbitPath`, `Ring`, `PlanetOrbit` (Task 5); `advanceClock`, `clockTarget` (Task 5); `planetRadius`, `moonOrbits`, `planetSpin`, `MoonSpec` (Task 4); `cellDate`, `maxCount`, `GRID_WEEKS`, `GRID_DAYS` (Task 3); `useUniverse` (Task 7); `selectedPlanet` (Task 2).
- Produces: `simClock: ClockState` (mutável); `CELL_PX`, `TEX_W`, `TEX_H`, `GRID_Y0`, `cellFromUv(u, v)`, `cellAlpha(count, max)`, `drawActivityGrid(ctx, weeks)`; componentes `Scene({ universe })`, `Planet`, `Moon`, `OrbitLines`, `SimClockDriver`, `ActivityTooltip`.

- [ ] **Step 1: Teste da grade (falha)**

`src/components/three/grid.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { emptyWeeks } from '@/lib/universe/activity'
import { CELL_PX, cellAlpha, cellFromUv, drawActivityGrid, GRID_Y0, TEX_H, TEX_W } from './grid'

const vOfRow = (row: number) => 1 - (GRID_Y0 + row * CELL_PX + CELL_PX / 2) / TEX_H
const uOfWeek = (week: number) => (week * CELL_PX + CELL_PX / 2) / TEX_W

describe('textura 2:1 com a grade no equador', () => {
  it('proporção equiretangular mantém as células quadradas', () => {
    expect(TEX_W).toBe(832)
    expect(TEX_H).toBe(416)
    expect(GRID_Y0).toBe(152)
  })

  it('cellFromUv acha semana e dia', () => {
    expect(cellFromUv(uOfWeek(0), vOfRow(0))).toEqual({ week: 0, day: 0 })
    expect(cellFromUv(uOfWeek(51), vOfRow(6))).toEqual({ week: 51, day: 6 })
  })

  it('fora da faixa (polos) não tem célula', () => {
    expect(cellFromUv(0.5, 1)).toBeNull()
    expect(cellFromUv(0.5, 0)).toBeNull()
    expect(cellFromUv(1, 0.5)).toBeNull()
  })

  it('opacidade: célula vazia quase invisível, cheia opaca', () => {
    expect(cellAlpha(0, 10)).toBeCloseTo(0.08)
    expect(cellAlpha(10, 10)).toBe(1)
    expect(cellAlpha(5, 10)).toBeGreaterThan(cellAlpha(1, 10))
  })

  it('desenha o fundo e as 364 células', () => {
    const rects: number[][] = []
    const ctx = { fillStyle: '', globalAlpha: 1, fillRect: (...r: number[]) => rects.push(r) }
    drawActivityGrid(ctx, emptyWeeks())
    expect(rects).toHaveLength(1 + 52 * 7)
    expect(rects[0]).toEqual([0, 0, TEX_W, TEX_H])
    expect(ctx.globalAlpha).toBe(1)
  })
})
```

Run: `pnpm test src/components/three`
Expected: FAIL.

- [ ] **Step 2: Implementar a grade e a textura**

`src/components/three/grid.ts`:

```ts
import { GRID_DAYS, GRID_WEEKS, maxCount } from '@/lib/universe/activity'

export const CELL_PX = 16
export const TEX_W = GRID_WEEKS * CELL_PX // 832
/** Equiretangular 2:1: 52 colunas em 360° → ~6,9° por célula, quadrada na esfera. */
export const TEX_H = TEX_W / 2 // 416
export const GRID_Y0 = (TEX_H - GRID_DAYS * CELL_PX) / 2 // 152
export const PLANET_BASE = '#0d1b3a'
export const CELL_COLOR = '#10b981'

export function cellFromUv(u: number, v: number): { week: number; day: number } | null {
  const week = Math.floor((u * TEX_W) / CELL_PX)
  const day = Math.floor(((1 - v) * TEX_H - GRID_Y0) / CELL_PX)
  if (week < 0 || week >= GRID_WEEKS || day < 0 || day >= GRID_DAYS) return null
  return { week, day }
}

export function cellAlpha(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0.08
  return 0.3 + 0.7 * Math.min(1, count / max)
}

export interface GridContext {
  fillStyle: string | CanvasGradient | CanvasPattern
  globalAlpha: number
  fillRect(x: number, y: number, w: number, h: number): void
}

export function drawActivityGrid(ctx: GridContext, weeks: number[][]): void {
  const max = maxCount(weeks)
  ctx.globalAlpha = 1
  ctx.fillStyle = PLANET_BASE
  ctx.fillRect(0, 0, TEX_W, TEX_H)
  ctx.fillStyle = CELL_COLOR
  for (let w = 0; w < GRID_WEEKS; w++) {
    for (let d = 0; d < GRID_DAYS; d++) {
      ctx.globalAlpha = cellAlpha(weeks[w][d], max)
      ctx.fillRect(w * CELL_PX + 2, GRID_Y0 + d * CELL_PX + 2, CELL_PX - 4, CELL_PX - 4)
    }
  }
  ctx.globalAlpha = 1
}
```

`src/components/three/usePlanetTexture.ts`:

```ts
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { drawActivityGrid, TEX_H, TEX_W } from './grid'

export function usePlanetTexture(weeks: number[][]): THREE.CanvasTexture {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = TEX_W
    canvas.height = TEX_H
    const ctx = canvas.getContext('2d')
    if (ctx) drawActivityGrid(ctx, weeks)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [weeks])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}
```

`src/components/three/geometries.ts`:

```ts
import * as THREE from 'three'

/** Esferas unitárias compartilhadas; cada mesh usa `scale` para o raio. */
export const PLANET_GEOMETRY_HI = new THREE.SphereGeometry(1, 64, 32)
export const PLANET_GEOMETRY_LO = new THREE.SphereGeometry(1, 32, 16)
export const MOON_GEOMETRY = new THREE.SphereGeometry(1, 24, 12)
```

Run: `pnpm test src/components/three`
Expected: PASS.

- [ ] **Step 3: Relógio de simulação na cena**

`src/store/simClock.ts`:

```ts
import type { ClockState } from '@/lib/universe/clock'

/** Mutável de propósito: lido e escrito a cada frame, fora do React. */
export const simClock: ClockState = { time: 0, scale: 1 }
```

`src/components/three/SimClockDriver.tsx`:

```tsx
import { useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import { selectedPlanet } from '@/lib/interaction'
import { advanceClock, clockTarget } from '@/lib/universe/clock'
import { simClock } from '@/store/simClock'
import { useUniverse } from '@/store/universe'

export function SimClockDriver() {
  const reducedMotion = useReducedMotion() ?? false
  useFrame((_, dt) => {
    if (reducedMotion) {
      simClock.scale = 0
      return
    }
    const focused = selectedPlanet(useUniverse.getState().selection) !== null
    const next = advanceClock(simClock, dt, clockTarget({ reducedMotion, focused, tutorialFocus: false }))
    simClock.time = next.time
    simClock.scale = next.scale
  })
  return null
}
```

- [ ] **Step 4: Planeta, lua e linhas de órbita**

`src/components/three/Moon.tsx`:

```tsx
import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useCursor } from '@react-three/drei'
import type * as THREE from 'three'
import type { MoonSpec } from '@/lib/universe/planets'
import { simClock } from '@/store/simClock'
import { useUniverse } from '@/store/universe'
import { MOON_GEOMETRY } from './geometries'

export function Moon({ spec, planet }: { spec: MoonSpec; planet: string }) {
  const pivot = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  const select = useUniverse((s) => s.select)

  useFrame(() => {
    if (pivot.current) pivot.current.rotation.y = spec.phase + spec.speed * simClock.time
  })

  return (
    <group rotation={[spec.inclination, 0, 0]}>
      <group ref={pivot}>
        <mesh
          geometry={MOON_GEOMETRY}
          scale={spec.radius}
          position={[spec.orbitRadius, 0, 0]}
          onClick={(e) => {
            e.stopPropagation()
            select({ kind: 'moon', planet, language: spec.language })
          }}
          onPointerOver={(e) => {
            e.stopPropagation()
            setHovered(true)
          }}
          onPointerOut={() => setHovered(false)}
        >
          <meshStandardMaterial color={spec.color} emissive={spec.color} emissiveIntensity={0.15} roughness={0.6} />
        </mesh>
      </group>
    </group>
  )
}
```

`src/components/three/Planet.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useCursor } from '@react-three/drei'
import type * as THREE from 'three'
import type { Repo } from '@/lib/types'
import { cellDate } from '@/lib/universe/activity'
import { planetPosition, type PlanetOrbit, type Ring } from '@/lib/universe/orbits'
import { moonOrbits, planetSpin } from '@/lib/universe/planets'
import { simClock } from '@/store/simClock'
import { useUniverse } from '@/store/universe'
import { PLANET_GEOMETRY_HI, PLANET_GEOMETRY_LO } from './geometries'
import { cellFromUv } from './grid'
import { Moon } from './Moon'
import { usePlanetTexture } from './usePlanetTexture'

export function Planet({ repo, ring, orbit }: { repo: Repo; ring: Ring; orbit: PlanetOrbit }) {
  const root = useRef<THREE.Group>(null)
  const precession = useRef<THREE.Group>(null)
  const surface = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  const texture = usePlanetTexture(repo.activity.weeks)
  const spin = useMemo(() => planetSpin(repo.name), [repo.name])
  const moons = useMemo(() => moonOrbits(orbit.radius, repo.languages), [orbit.radius, repo.languages])
  const select = useUniverse((s) => s.select)
  const setHoveredCell = useUniverse((s) => s.setHoveredCell)
  const isReal = repo.activity.source === 'real'

  useFrame(() => {
    const t = simClock.time
    const [x, y, z] = planetPosition(ring, orbit, t)
    root.current?.position.set(x, y, z)
    // Euler: precessão (y do sistema) → obliquidade (z) → rotação própria (y local).
    if (precession.current) precession.current.rotation.y = spin.precessionSpeed * t
    if (surface.current) surface.current.rotation.y = spin.spinSpeed * t
  })

  function handleMove(e: ThreeEvent<PointerEvent>) {
    if (!isReal || !e.uv) return setHoveredCell(null)
    const cell = cellFromUv(e.uv.x, e.uv.y)
    if (!cell) return setHoveredCell(null)
    setHoveredCell({
      planet: repo.name,
      ...cell,
      count: repo.activity.weeks[cell.week][cell.day],
      date: cellDate(repo.activity.startDate, cell.week, cell.day),
      x: e.nativeEvent.clientX,
      y: e.nativeEvent.clientY,
    })
  }

  return (
    <group ref={root}>
      <group ref={precession}>
        <group rotation={[0, 0, spin.obliquity]}>
          <mesh
            ref={surface}
            geometry={isReal ? PLANET_GEOMETRY_HI : PLANET_GEOMETRY_LO}
            scale={orbit.radius}
            onClick={(e) => {
              e.stopPropagation()
              select({ kind: 'planet', name: repo.name })
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHovered(true)
            }}
            onPointerOut={() => {
              setHovered(false)
              setHoveredCell(null)
            }}
            onPointerMove={handleMove}
          >
            <meshStandardMaterial
              map={texture}
              emissiveMap={texture}
              emissive="#ffffff"
              emissiveIntensity={0.25}
              roughness={0.85}
              metalness={0.05}
            />
          </mesh>
          {moons.map((moon) => (
            <Moon key={moon.language} spec={moon} planet={repo.name} />
          ))}
        </group>
      </group>
    </group>
  )
}
```

`src/components/three/OrbitLines.tsx`:

```tsx
import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { orbitPath, type Ring } from '@/lib/universe/orbits'

export function OrbitLines({ rings }: { rings: Ring[] }) {
  const paths = useMemo(() => rings.map((ring) => orbitPath(ring)), [rings])
  return (
    <>
      {paths.map((points, i) => (
        <Line key={i} points={points} color="#22d3ee" transparent opacity={0.14} lineWidth={1} />
      ))}
    </>
  )
}
```

- [ ] **Step 5: Cena e tooltip**

`src/components/three/Scene.tsx`:

```tsx
import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { CameraControls, Stars, Stats } from '@react-three/drei'
import type { Universe } from '@/lib/types'
import { buildOrbits } from '@/lib/universe/orbits'
import { planetRadius } from '@/lib/universe/planets'
import { useUniverse } from '@/store/universe'
import { OrbitLines } from './OrbitLines'
import { Planet } from './Planet'
import { SimClockDriver } from './SimClockDriver'

const SHOW_STATS = new URLSearchParams(window.location.search).has('perf')

export function Scene({ universe }: { universe: Universe }) {
  const clearSelection = useUniverse((s) => s.clearSelection)
  const system = useMemo(
    () => buildOrbits(universe.repos.map((r) => ({ name: r.name, radius: planetRadius(r.stars, r.forks) }))),
    [universe.repos],
  )

  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 40, 70], fov: 50, near: 0.1, far: 1000 }} onPointerMissed={clearSelection}>
      <color attach="background" args={['#0a0e27']} />
      <ambientLight intensity={0.25} />
      <pointLight position={[0, 0, 0]} decay={0} intensity={2.2} color="#e0fbff" />
      <Stars radius={300} depth={80} count={5000} factor={5} fade speed={0.4} />
      <SimClockDriver />
      <OrbitLines rings={system.rings} />
      {system.orbits.map((orbit, i) => (
        <Planet key={orbit.name} repo={universe.repos[i]} ring={system.rings[orbit.ring]} orbit={orbit} />
      ))}
      <CameraControls makeDefault minDistance={2} maxDistance={200} />
      {SHOW_STATS && <Stats />}
    </Canvas>
  )
}
```

`src/components/ui/ActivityTooltip.tsx`:

```tsx
import { commitsLabel, formatDate } from '@/lib/format'
import { useUniverse } from '@/store/universe'

export function ActivityTooltip() {
  const cell = useUniverse((s) => s.hoveredCell)
  if (!cell) return null
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-40 rounded-md border border-grid/40 bg-space/90 px-2 py-1 text-xs text-slate-100"
      style={{ left: cell.x + 12, top: cell.y + 12 }}
    >
      {formatDate(cell.date)} · {commitsLabel(cell.count)}
    </div>
  )
}
```

`src/App.tsx`:

```tsx
import { lazy, Suspense, useState } from 'react'
import { ActivityTooltip } from '@/components/ui/ActivityTooltip'
import { LoadError } from '@/components/ui/LoadError'
import { Loader } from '@/components/ui/Loader'
import { StaticFallback } from '@/components/ui/StaticFallback'
import { useUniverseData } from '@/hooks/useUniverseData'
import { supportsWebGL } from '@/hooks/webgl'

const Scene = lazy(() => import('@/components/three/Scene').then((m) => ({ default: m.Scene })))

export function App() {
  const { state, retry } = useUniverseData()
  const [webgl] = useState(supportsWebGL)

  if (state.status === 'error') return <LoadError message={state.message} onRetry={retry} />
  if (state.status === 'loading') return <Loader />
  if (!webgl) return <StaticFallback universe={state.universe} />
  const { universe } = state

  return (
    <main className="fixed inset-0 overflow-hidden bg-space text-slate-100">
      <Suspense fallback={<Loader />}>
        <Scene universe={universe} />
      </Suspense>
      <ActivityTooltip />
    </main>
  )
}
```

- [ ] **Step 6: Verificar visualmente**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: sem erros.

Se o `pnpm lint` acusar `react-hooks/immutability` ou `react-hooks/refs` em código que muta objetos do Three.js (textura, material, `simClock`), é falso positivo do plugin para objetos imperativos. **Só nesse caso**, acrescente ao array do `eslint.config.js`:

```js
{
  files: ['src/components/three/**/*.{ts,tsx}'],
  rules: { 'react-hooks/immutability': 'off', 'react-hooks/refs': 'off' },
},
```

Run: `pnpm dev`, abra `http://localhost:5173/github-universe-3d/?perf`
Expected:
- 14 planetas em 3 anéis (3, 5, 6) girando em volta do centro, com linhas de órbita ciano translúcidas;
- os planetas internos andam mais rápido; cada planeta acelera ao passar perto do periélio;
- eixos inclinados e grade verde numa faixa do equador; polos escuros; quadradinhos quadrados;
- luas coloridas orbitando; o planeta sem linguagens (`notes`, `empty-repo`) não tem luas;
- hover num planeta do top 10 mostra "8 de out. de 2026 · 3 commits"; o cursor vira "pointer";
- clicar num planeta faz o sistema desacelerar e parar em ~1 s; clicar no vazio retoma;
- painel do `Stats` mostra ~60 fps.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat: cena com planetas em órbitas de Kepler, superfície de commits e luas"
```

---

### Task 9: Câmera de foco, painel lateral e painel do planeta

**Files:**
- Create: `src/lib/cameraPoses.ts`, `src/components/three/CameraRig.tsx`, `src/components/ui/SidePanel.tsx`, `src/components/ui/PlanetPanel.tsx`, `src/components/ui/BackButton.tsx`
- Modify: `src/components/three/Scene.tsx`, `src/App.tsx`
- Test: `src/lib/cameraPoses.test.ts`

**Interfaces:**
- Consumes: `OrbitSystem`, `planetPosition`, `Vec3` (Task 5); `predictStopTime` (Task 5); `simClock` (Task 8); `UniverseSelection`, `selectedPlanet` (Task 2); `languageShares` (Task 4); `formatCount`, `timeAgo`, `commitsLabel` (Task 7); `useMediaQuery`, `MOBILE_QUERY` (Task 7).
- Produces: `PanelLayout = 'side' | 'bottom'`, `Pose { position: Vec3; target: Vec3 }`, `overviewPose(system)`, `sunPose(layout)`, `planetPose(position, radius, layout)`, `planetFocusPose(system, name, time, layout): Pose | null`, `selectionPose(sel, system, time, layout)`, `maxCameraDistance(system)`; componentes `CameraRig({ system })`, `SidePanel`, `PlanetPanel({ universe })`, `BackButton`.

- [ ] **Step 1: Teste das poses (falha)**

`src/lib/cameraPoses.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildOrbits, planetPosition, type Vec3 } from './universe/orbits'
import { maxCameraDistance, overviewPose, planetPose, selectionPose, sunPose } from './cameraPoses'

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
const system = buildOrbits(Array.from({ length: 8 }, (_, i) => ({ name: `p${i}`, radius: 1 + (i % 3) * 0.5 })))

describe('overviewPose', () => {
  it('enquadra o anel externo e olha para o sol', () => {
    const pose = overviewPose(system)
    const outer = system.rings[system.rings.length - 1]
    expect(pose.target).toEqual([0, 0, 0])
    expect(len(pose.position)).toBeGreaterThan(outer.a * (1 + outer.e))
    expect(maxCameraDistance(system)).toBeGreaterThan(len(pose.position))
  })

  it('funciona sem planetas', () => {
    const pose = overviewPose({ rings: [], orbits: [] })
    expect(len(pose.position)).toBeGreaterThan(10)
  })
})

describe('planetPose', () => {
  const position: Vec3 = [12, 1, -5]
  const radius = 1.5

  it('fica a uma distância proporcional ao raio', () => {
    const d = len(sub(planetPose(position, radius, 'side').position, position))
    expect(d).toBeGreaterThan(radius * 4)
    expect(d).toBeLessThan(radius * 6 + 4)
  })

  it('no desktop, o alvo vai para a direita da câmera (planeta à esquerda do painel)', () => {
    const pose = planetPose(position, radius, 'side')
    const view = sub(position, pose.position)
    const right: Vec3 = [-view[2], 0, view[0]]
    const shift = sub(pose.target, position)
    expect(shift[0] * right[0] + shift[2] * right[2]).toBeGreaterThan(0)
  })

  it('no mobile, o alvo desce (planeta acima do bottom sheet)', () => {
    expect(planetPose(position, radius, 'bottom').target[1]).toBeLessThan(position[1])
  })
})

describe('selectionPose', () => {
  it('perfil → pose do sol; nada ou planeta desconhecido → visão geral', () => {
    expect(selectionPose({ kind: 'profile' }, system, 0, 'side')).toEqual(sunPose('side'))
    expect(selectionPose({ kind: 'none' }, system, 0, 'side')).toEqual(overviewPose(system))
    expect(selectionPose({ kind: 'planet', name: 'nao-existe' }, system, 0, 'side')).toEqual(overviewPose(system))
  })

  it('planeta e lua focam a posição do planeta no instante dado', () => {
    const orbit = system.orbits[4]
    const at = planetPosition(system.rings[orbit.ring], orbit, 42)
    const expected = planetPose(at, orbit.radius, 'side')
    expect(selectionPose({ kind: 'planet', name: orbit.name }, system, 42, 'side')).toEqual(expected)
    expect(selectionPose({ kind: 'moon', planet: orbit.name, language: 'Go' }, system, 42, 'side')).toEqual(expected)
  })
})
```

Run: `pnpm test src/lib/cameraPoses.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implementar as poses**

`src/lib/cameraPoses.ts`:

```ts
import { selectedPlanet, type UniverseSelection } from './interaction'
import { planetPosition, type OrbitSystem, type Vec3 } from './universe/orbits'

export type PanelLayout = 'side' | 'bottom'

export interface Pose {
  position: Vec3
  target: Vec3
}

export function overviewPose(system: OrbitSystem): Pose {
  const outer = system.rings[system.rings.length - 1]
  const reach = outer ? outer.a * (1 + outer.e) + outer.maxRadius : 12
  const d = reach * 1.5 + 10
  return { position: [0, d * 0.6, d], target: [0, 0, 0] }
}

export function maxCameraDistance(system: OrbitSystem): number {
  const [x, y, z] = overviewPose(system).position
  return Math.hypot(x, y, z) * 1.4
}

export function sunPose(layout: PanelLayout): Pose {
  return layout === 'side' ? { position: [0, 3, 13], target: [2.5, 0, 0] } : { position: [0, 3, 13], target: [0, -2, 0] }
}

export function planetPose(position: Vec3, radius: number, layout: PanelLayout): Pose {
  const [x, y, z] = position
  const len = Math.hypot(x, z) || 1
  const ox = x / len
  const oz = z / len // para fora do sol
  // Tangente à órbita, puxada para o lado do sol: vê metade iluminada e metade na sombra.
  let dx = -oz - 0.5 * ox
  let dz = ox - 0.5 * oz
  const dl = Math.hypot(dx, dz)
  dx /= dl
  dz /= dl
  const dist = radius * 4 + 3
  const shift = radius * 1.3
  return {
    position: [x + dx * dist, y + radius * 1.2, z + dz * dist],
    // Direita da câmera = (dz, 0, −dx). Alvo à direita → planeta aparece à esquerda do painel.
    target: layout === 'side' ? [x + dz * shift, y, z - dx * shift] : [x, y - shift, z],
  }
}

export function planetFocusPose(system: OrbitSystem, name: string, time: number, layout: PanelLayout): Pose | null {
  const orbit = system.orbits.find((o) => o.name === name)
  if (!orbit) return null
  return planetPose(planetPosition(system.rings[orbit.ring], orbit, time), orbit.radius, layout)
}

export function selectionPose(sel: UniverseSelection, system: OrbitSystem, time: number, layout: PanelLayout): Pose {
  if (sel.kind === 'profile') return sunPose(layout)
  const name = selectedPlanet(sel)
  return (name && planetFocusPose(system, name, time, layout)) || overviewPose(system)
}
```

Run: `pnpm test src/lib/cameraPoses.test.ts`
Expected: PASS.

- [ ] **Step 3: CameraRig**

`src/components/three/CameraRig.tsx`:

```tsx
import { useEffect, useRef, type ComponentRef } from 'react'
import { CameraControls } from '@react-three/drei'
import { MOBILE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { maxCameraDistance, selectionPose } from '@/lib/cameraPoses'
import { predictStopTime } from '@/lib/universe/clock'
import type { OrbitSystem } from '@/lib/universe/orbits'
import { simClock } from '@/store/simClock'
import { useUniverse } from '@/store/universe'

export function CameraRig({ system }: { system: OrbitSystem }) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null)
  const selection = useUniverse((s) => s.selection)
  const layout = useMediaQuery(MOBILE_QUERY) ? 'bottom' : 'side'

  useEffect(() => {
    // O tempo desacelera até parar ao focar: mira onde o planeta vai estar quando parar.
    const pose = selectionPose(selection, system, predictStopTime(simClock), layout)
    void controls.current?.setLookAt(...pose.position, ...pose.target, true)
  }, [selection, system, layout])

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={2}
      maxDistance={maxCameraDistance(system)}
      smoothTime={0.6}
      dollyToCursor={false}
    />
  )
}
```

Em `src/components/three/Scene.tsx`, troque o import `CameraControls, Stars, Stats` por `Stars, Stats`, importe `import { CameraRig } from './CameraRig'` e troque a linha `<CameraControls makeDefault minDistance={2} maxDistance={200} />` por:

```tsx
      <CameraRig system={system} />
```

- [ ] **Step 4: Painéis e botão de voltar**

`src/components/ui/SidePanel.tsx`:

```tsx
import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { MOBILE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'

interface SidePanelProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function SidePanel({ open, onClose, title, children }: SidePanelProps) {
  const mobile = useMediaQuery(MOBILE_QUERY)
  const reduced = useReducedMotion()
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeButton.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const hidden = reduced ? { opacity: 0 } : mobile ? { y: '100%' } : { x: '100%' }

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="panel"
          role="dialog"
          aria-label={title}
          initial={hidden}
          animate={{ x: 0, y: 0, opacity: 1 }}
          exit={hidden}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          className="fixed inset-x-0 bottom-0 z-20 max-h-[60vh] overflow-y-auto rounded-t-2xl border border-neon/20 bg-panel/90 p-5 backdrop-blur md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[380px] md:rounded-none md:rounded-l-2xl"
        >
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Fechar painel"
            className="absolute right-3 top-3 rounded-full p-2 text-slate-400 hover:text-neon"
          >
            ✕
          </button>
          {children}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
```

`src/components/ui/PlanetPanel.tsx`:

```tsx
import { commitsLabel, formatCount, timeAgo } from '@/lib/format'
import { selectedPlanet } from '@/lib/interaction'
import type { Repo, Universe } from '@/lib/types'
import { languageShares } from '@/lib/universe/planets'
import { useUniverse } from '@/store/universe'
import { SidePanel } from './SidePanel'

export function PlanetPanel({ universe }: { universe: Universe }) {
  const selection = useUniverse((s) => s.selection)
  const clearSelection = useUniverse((s) => s.clearSelection)
  const name = selectedPlanet(selection)
  const repo = name ? (universe.repos.find((r) => r.name === name) ?? null) : null
  const focusLanguage = selection.kind === 'moon' ? selection.language : null

  return (
    <SidePanel open={repo !== null} onClose={clearSelection} title={repo?.name ?? 'Repositório'}>
      {repo && <PlanetDetails repo={repo} focusLanguage={focusLanguage} />}
    </SidePanel>
  )
}

function PlanetDetails({ repo, focusLanguage }: { repo: Repo; focusLanguage: string | null }) {
  const stats: [string, number][] = [
    ['Stars', repo.stars],
    ['Forks', repo.forks],
    ['Watchers', repo.watchers],
  ]
  const shares = languageShares(repo.languages)

  return (
    <div className="space-y-5 pr-6">
      <header>
        <h2 className="text-xl font-semibold text-neon">{repo.name}</h2>
        {repo.description && <p className="mt-1 text-sm text-slate-300">{repo.description}</p>}
      </header>

      <dl className="grid grid-cols-3 gap-3 text-center">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-white/5 p-2">
            <dt className="text-xs text-slate-400">{label}</dt>
            <dd className="text-lg font-semibold">{formatCount(value)}</dd>
          </div>
        ))}
      </dl>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-slate-400">Linguagens</h3>
        {shares.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">Sem linguagens detectadas.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {shares.map((l) => (
              <li
                key={l.name}
                className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${l.name === focusLanguage ? 'bg-neon/10 ring-1 ring-neon/50' : ''}`}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: l.color }} />
                {l.name}
                {l.name === repo.primaryLanguage && <span className="text-xs text-slate-500">principal</span>}
                <span className="ml-auto tabular-nums text-slate-400">{l.share.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-slate-400">Último commit</h3>
        {repo.lastCommit ? (
          <div className="mt-2 text-sm">
            <p className="text-slate-100">{repo.lastCommit.message}</p>
            <p className="text-xs text-slate-400">
              {timeAgo(repo.lastCommit.date)} · {commitsLabel(repo.totalCommits)} no total
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">Repositório sem commits.</p>
        )}
      </section>

      <a
        href={repo.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex rounded-full border border-neon/50 px-4 py-2 text-sm text-neon hover:bg-neon/10"
      >
        Ver no GitHub ↗
      </a>
    </div>
  )
}
```

`src/components/ui/BackButton.tsx`:

```tsx
import { useUniverse } from '@/store/universe'

export function BackButton() {
  const selection = useUniverse((s) => s.selection)
  const clearSelection = useUniverse((s) => s.clearSelection)
  if (selection.kind === 'none') return null
  return (
    <button
      type="button"
      onClick={clearSelection}
      className="fixed left-4 top-4 z-30 rounded-full border border-neon/40 bg-space/80 px-4 py-2 text-sm text-neon backdrop-blur hover:bg-neon/10"
    >
      ← Galáxia
    </button>
  )
}
```

Em `src/App.tsx`, importe `BackButton` e `PlanetPanel` e acrescente depois de `<ActivityTooltip />`:

```tsx
      <BackButton />
      <PlanetPanel universe={universe} />
```

- [ ] **Step 5: Verificar**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: sem erros.

Run: `pnpm dev`
Expected:
- abre na visão geral com todos os anéis enquadrados;
- clicar num planeta: o sistema para e a câmera voa até ele, com o planeta à esquerda e o painel à direita (stars, forks, watchers, linguagens com %, último commit, link);
- clicar numa lua destaca a linguagem dela no painel;
- Esc, ✕, "← Galáxia" ou clique no vazio voltam à visão geral, e o sistema volta a girar;
- com a janela < 768px, o painel vira bottom sheet e o planeta fica acima dele;
- arrastar gira a câmera em volta do planeta focado; zoom para longe é limitado.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: foco de câmera no planeta e painel lateral"
```

---

### Task 10: Sol — máquina de estados, rosto com mola e painel de perfil

**Files:**
- Create: `src/lib/sun/sunMachine.ts`, `src/lib/sun/faceSpring.ts`, `src/components/three/sunFace.ts`, `src/components/three/Sun.tsx`, `src/components/ui/ProfilePanel.tsx`
- Modify: `src/components/three/Scene.tsx`, `src/App.tsx`
- Test: `src/lib/sun/sunMachine.test.ts`, `src/lib/sun/faceSpring.test.ts`

**Interfaces:**
- Consumes: `Vec3`, `SUN_RADIUS` (Task 5); `useUniverse` (Task 7); `SidePanel` (Task 9); `languageShares` (Task 4); `formatCount`, `timeAgo` (Task 7).
- Produces:
  - `sunMachine.ts`: `SunMode`, `SunExpression`, `SunState`, `SunEvent`, `CLICK_DURATION`, `AWAY_TO_IDLE`, `INITIAL_SUN_STATE`, `sunReducer(s, e)`, `SUN_LOOK`, `nextBlinkDelay(rng?)`.
  - `faceSpring.ts`: `FaceSpring`, `FACE_AT_REST`, `MAX_PITCH`, `wrapAngle(a)`, `faceTarget(from, to)`, `stepFaceSpring(s, target, dt)`.
  - `sunFace.ts`: `SUN_TEX_W`, `SUN_TEX_H`, `drawSunFace(ctx, expression, eyesClosed)`.
  - Componentes `Sun`, `ProfilePanel({ profile })`.

- [ ] **Step 1: Teste da máquina de estados (falha)**

`src/lib/sun/sunMachine.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { AWAY_TO_IDLE, CLICK_DURATION, INITIAL_SUN_STATE, nextBlinkDelay, sunReducer, type SunEvent, type SunState } from './sunMachine'

const apply = (s: SunState, ...events: SunEvent[]) => events.reduce(sunReducer, s)

describe('sunReducer', () => {
  it('idle → hover quando o mouse chega perto', () => {
    expect(apply(INITIAL_SUN_STATE, { type: 'near' }).mode).toBe('hover')
  })

  it('mouse longe a partir do idle continua idle', () => {
    expect(apply(INITIAL_SUN_STATE, { type: 'far' })).toBe(INITIAL_SUN_STATE)
  })

  it('hover → away → idle depois de AWAY_TO_IDLE segundos', () => {
    const away = apply(INITIAL_SUN_STATE, { type: 'near' }, { type: 'far' })
    expect(away.mode).toBe('away')
    expect(apply(away, { type: 'tick', dt: AWAY_TO_IDLE - 0.1 }).mode).toBe('away')
    expect(apply(away, { type: 'tick', dt: AWAY_TO_IDLE }).mode).toBe('idle')
  })

  it('clique dura CLICK_DURATION e volta ao estado em que o mouse estiver', () => {
    const clicked = apply(INITIAL_SUN_STATE, { type: 'near' }, { type: 'click' })
    expect(clicked.mode).toBe('click')
    expect(apply(clicked, { type: 'tick', dt: CLICK_DURATION / 2 }).mode).toBe('click')
    expect(apply(clicked, { type: 'tick', dt: CLICK_DURATION }).mode).toBe('hover')
    expect(apply(clicked, { type: 'far' }, { type: 'tick', dt: CLICK_DURATION }).mode).toBe('away')
  })

  it('devolve o mesmo objeto quando nada muda', () => {
    const hover = apply(INITIAL_SUN_STATE, { type: 'near' })
    expect(sunReducer(hover, { type: 'near' })).toBe(hover)
    expect(sunReducer(hover, { type: 'tick', dt: 1 })).toBe(hover)
  })
})

describe('nextBlinkDelay', () => {
  it('fica entre 3 e 5 segundos', () => {
    expect(nextBlinkDelay(() => 0)).toBe(3)
    expect(nextBlinkDelay(() => 0.999)).toBeLessThan(5)
  })
})
```

Run: `pnpm test src/lib/sun/sunMachine.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implementar a máquina de estados**

`src/lib/sun/sunMachine.ts`:

```ts
export type SunMode = 'idle' | 'hover' | 'click' | 'away'
export type SunExpression = 'happy' | 'veryHappy' | 'surprised' | 'sad'

export interface SunState {
  mode: SunMode
  clickLeft: number
  /** Para onde voltar quando o clique terminar. */
  resumeMode: Exclude<SunMode, 'click'>
  awayFor: number
}

export type SunEvent = { type: 'near' } | { type: 'far' } | { type: 'click' } | { type: 'tick'; dt: number }

export const CLICK_DURATION = 0.6
export const AWAY_TO_IDLE = 4
export const INITIAL_SUN_STATE: SunState = { mode: 'idle', clickLeft: 0, resumeMode: 'idle', awayFor: 0 }

export function sunReducer(s: SunState, e: SunEvent): SunState {
  switch (e.type) {
    case 'click':
      return { ...s, mode: 'click', clickLeft: CLICK_DURATION, resumeMode: s.mode === 'click' ? s.resumeMode : s.mode }
    case 'near':
      if (s.mode === 'click') return s.resumeMode === 'hover' ? s : { ...s, resumeMode: 'hover' }
      return s.mode === 'hover' ? s : { ...s, mode: 'hover', awayFor: 0 }
    case 'far':
      if (s.mode === 'click') return s.resumeMode === 'hover' ? { ...s, resumeMode: 'away' } : s
      return s.mode === 'hover' ? { ...s, mode: 'away', awayFor: 0 } : s
    case 'tick': {
      if (s.mode === 'click') {
        const left = s.clickLeft - e.dt
        return left > 0 ? { ...s, clickLeft: left } : { ...s, mode: s.resumeMode, clickLeft: 0, awayFor: 0 }
      }
      if (s.mode === 'away') {
        const awayFor = s.awayFor + e.dt
        return awayFor >= AWAY_TO_IDLE ? { ...s, mode: 'idle', awayFor: 0 } : { ...s, awayFor }
      }
      return s
    }
  }
}

export const SUN_LOOK: Record<SunMode, { expression: SunExpression; glow: number }> = {
  idle: { expression: 'happy', glow: 1 },
  hover: { expression: 'veryHappy', glow: 1.6 },
  click: { expression: 'surprised', glow: 2.4 },
  away: { expression: 'sad', glow: 0.6 },
}

export function nextBlinkDelay(rng: () => number = Math.random): number {
  return 3 + rng() * 2
}
```

Run: `pnpm test src/lib/sun/sunMachine.test.ts`
Expected: PASS.

- [ ] **Step 3: Teste da mola do rosto (falha)**

`src/lib/sun/faceSpring.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { FACE_AT_REST, faceTarget, MAX_PITCH, stepFaceSpring, wrapAngle, type FaceSpring } from './faceSpring'

const simulate = (s: FaceSpring, target: { yaw: number; pitch: number }, seconds: number, dt = 1 / 60) => {
  const trace: FaceSpring[] = []
  let state = s
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    state = stepFaceSpring(state, target, dt)
    trace.push(state)
  }
  return trace
}

describe('faceTarget', () => {
  it('yaw e pitch apontam para a câmera, com pitch limitado', () => {
    expect(faceTarget([0, 0, 0], [0, 0, 10])).toEqual({ yaw: 0, pitch: 0 })
    expect(faceTarget([0, 0, 0], [10, 0, 0]).yaw).toBeCloseTo(Math.PI / 2)
    expect(faceTarget([0, 0, 0], [0, 5, 10]).pitch).toBeCloseTo(Math.atan2(5, 10))
    expect(faceTarget([0, 0, 0], [0, 100, 1]).pitch).toBe(MAX_PITCH)
    expect(faceTarget([0, 0, 0], [0, -100, 1]).pitch).toBe(-MAX_PITCH)
  })
})

describe('stepFaceSpring', () => {
  const target = { yaw: 1, pitch: 0.4 }

  it('chega ao alvo com atraso: longe em 0,1 s, perto em 1,5 s', () => {
    const trace = simulate(FACE_AT_REST, target, 1.5)
    expect(trace[5].yaw).toBeLessThan(0.5)
    const last = trace[trace.length - 1]
    expect(Math.abs(last.yaw - target.yaw)).toBeLessThan(0.01)
    expect(Math.abs(last.pitch - target.pitch)).toBeLessThan(0.01)
  })

  it('balança um pouco ao chegar, sem exagero', () => {
    const peak = Math.max(...simulate(FACE_AT_REST, target, 2).map((s) => s.yaw))
    expect(peak).toBeGreaterThan(target.yaw)
    expect(peak).toBeLessThan(target.yaw * 1.1)
  })

  it('gira pelo caminho curto ao cruzar ±π', () => {
    const start = { ...FACE_AT_REST, yaw: 3 }
    for (const s of simulate(start, { yaw: -3, pitch: 0 }, 1.5)) expect(Math.abs(s.yaw)).toBeGreaterThan(2.8)
  })

  it('dt enorme não explode', () => {
    const s = stepFaceSpring(FACE_AT_REST, target, 30)
    expect(Number.isFinite(s.yaw) && Number.isFinite(s.pitch)).toBe(true)
    expect(Math.abs(s.pitch)).toBeLessThanOrEqual(MAX_PITCH)
  })

  it('wrapAngle normaliza para [−π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI)
    expect(wrapAngle(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2)
  })
})
```

Run: `pnpm test src/lib/sun/faceSpring.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar a mola**

`src/lib/sun/faceSpring.ts`:

```ts
import type { Vec3 } from '../universe/orbits'

export interface FaceSpring {
  yaw: number
  pitch: number
  vYaw: number
  vPitch: number
}

/** ζ = 9 / (2·√40) ≈ 0,71: chega em ~0,5 s com ~4% de balanço. */
const STIFFNESS = 40
const DAMPING = 9
const SUBSTEP = 1 / 60
/** Passo máximo aceito por chamada (aba que volta do segundo plano). */
const MAX_DT = 0.25
export const MAX_PITCH = (35 * Math.PI) / 180
export const FACE_AT_REST: FaceSpring = { yaw: 0, pitch: 0, vYaw: 0, vPitch: 0 }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

export function faceTarget(from: Vec3, to: Vec3): { yaw: number; pitch: number } {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  return { yaw: Math.atan2(dx, dz), pitch: clamp(Math.atan2(dy, Math.hypot(dx, dz)), -MAX_PITCH, MAX_PITCH) }
}

export function stepFaceSpring(s: FaceSpring, target: { yaw: number; pitch: number }, dt: number): FaceSpring {
  let { yaw, pitch, vYaw, vPitch } = s
  let remaining = clamp(dt, 0, MAX_DT)
  while (remaining > 1e-9) {
    const h = Math.min(remaining, SUBSTEP)
    // Euler semi-implícito: atualiza a velocidade e depois a posição com a velocidade nova.
    vYaw += (STIFFNESS * wrapAngle(target.yaw - yaw) - DAMPING * vYaw) * h
    vPitch += (STIFFNESS * (target.pitch - pitch) - DAMPING * vPitch) * h
    yaw = wrapAngle(yaw + vYaw * h)
    pitch = clamp(pitch + vPitch * h, -MAX_PITCH, MAX_PITCH)
    remaining -= h
  }
  return { yaw, pitch, vYaw, vPitch }
}
```

Run: `pnpm test src/lib/sun`
Expected: PASS.

- [ ] **Step 5: Desenho do rosto e componente do sol**

`src/components/three/sunFace.ts`:

```ts
import type { SunExpression } from '@/lib/sun/sunMachine'

export const SUN_TEX_W = 512
export const SUN_TEX_H = 256
const OCEAN = '#1d6fd8'
const LAND = '#22c55e'
/** Continentes longe do rosto (centro em x = 128, y = 128). */
const CONTINENTS: [number, number, number, number][] = [
  [40, 40, 34, 16],
  [30, 210, 40, 18],
  [300, 90, 60, 30],
  [400, 190, 60, 24],
  [470, 60, 36, 24],
  [230, 214, 40, 14],
]

/** O rosto fica em u = 0,25, que é o +z da SphereGeometry do Three.js. */
export function drawSunFace(ctx: CanvasRenderingContext2D, expression: SunExpression, eyesClosed: boolean): void {
  ctx.fillStyle = OCEAN
  ctx.fillRect(0, 0, SUN_TEX_W, SUN_TEX_H)
  ctx.fillStyle = LAND
  for (const [x, y, rx, ry] of CONTINENTS) {
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  const cx = SUN_TEX_W * 0.25
  const cy = SUN_TEX_H * 0.5
  for (const dx of [-22, 22]) {
    if (eyesClosed) {
      ctx.strokeStyle = '#0b1020'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(cx + dx - 10, cy - 12)
      ctx.lineTo(cx + dx + 10, cy - 12)
      ctx.stroke()
      continue
    }
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(cx + dx, cy - 12, 10, expression === 'surprised' ? 16 : 13, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.arc(cx + dx, expression === 'sad' ? cy - 6 : cy - 12, expression === 'surprised' ? 4 : 5.5, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = '#f472b6'
  ctx.strokeStyle = '#f472b6'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  switch (expression) {
    case 'happy':
      ctx.arc(cx, cy + 12, 12, 0.15 * Math.PI, 0.85 * Math.PI)
      ctx.stroke()
      break
    case 'veryHappy':
      ctx.arc(cx, cy + 10, 16, 0, Math.PI)
      ctx.closePath()
      ctx.fill()
      break
    case 'surprised':
      ctx.ellipse(cx, cy + 18, 7, 9, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'sad':
      ctx.arc(cx, cy + 28, 12, 1.15 * Math.PI, 1.85 * Math.PI)
      ctx.stroke()
      break
  }
}
```

`src/components/three/Sun.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useCursor } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import { FACE_AT_REST, faceTarget, stepFaceSpring, type FaceSpring } from '@/lib/sun/faceSpring'
import {
  CLICK_DURATION,
  INITIAL_SUN_STATE,
  nextBlinkDelay,
  SUN_LOOK,
  sunReducer,
  type SunMode,
  type SunState,
} from '@/lib/sun/sunMachine'
import { SUN_RADIUS, type Vec3 } from '@/lib/universe/orbits'
import { useUniverse } from '@/store/universe'
import { drawSunFace, SUN_TEX_H, SUN_TEX_W } from './sunFace'

const NEAR_DISTANCE = 9
const FOLLOW_MAX = 1.5

export function Sun() {
  const body = useRef<THREE.Group>(null)
  const bounce = useRef<THREE.Group>(null)
  const face = useRef<THREE.Mesh>(null)
  const glow = useRef<THREE.MeshBasicMaterial>(null)
  const light = useRef<THREE.PointLight>(null)
  const machine = useRef<SunState>(INITIAL_SUN_STATE)
  const spring = useRef<FaceSpring>(FACE_AT_REST)
  const [mode, setMode] = useState<SunMode>('idle')
  const [blink, setBlink] = useState(false)
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  const select = useUniverse((s) => s.select)
  const reduced = useReducedMotion() ?? false

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = SUN_TEX_W
    canvas.height = SUN_TEX_H
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])

  useEffect(() => {
    const ctx = (texture.image as HTMLCanvasElement).getContext('2d')
    if (!ctx) return
    drawSunFace(ctx, SUN_LOOK[mode].expression, blink)
    texture.needsUpdate = true
  }, [mode, blink, texture])

  useEffect(() => () => texture.dispose(), [texture])

  useEffect(() => {
    let timer = 0
    const schedule = () => {
      timer = window.setTimeout(() => {
        setBlink(true)
        timer = window.setTimeout(() => {
          setBlink(false)
          schedule()
        }, 140)
      }, nextBlinkDelay() * 1000)
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [])

  // Raycaster próprio: o `state.raycaster` do R3F é o mesmo usado pelos eventos de clique.
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  const goal = useMemo(() => new THREE.Vector3(), [])
  const facePos = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ pointer, camera, clock }, dt) => {
    raycaster.setFromCamera(pointer, camera)
    const near = raycaster.ray.intersectPlane(plane, hit) !== null && hit.length() < NEAR_DISTANCE
    let next = sunReducer(machine.current, { type: near ? 'near' : 'far' })
    next = sunReducer(next, { type: 'tick', dt })
    if (next.mode !== machine.current.mode) setMode(next.mode)
    machine.current = next
    const look = SUN_LOOK[next.mode]
    const t = clock.elapsedTime

    // Corpo segue o mouse com atraso quando ele está perto; senão volta ao centro.
    goal.set(0, 0, 0)
    if (next.mode === 'hover' && !reduced) goal.copy(hit).setY(0).clampLength(0, FOLLOW_MAX)
    body.current?.position.lerp(goal, 1 - Math.exp(-3 * dt))

    if (bounce.current) {
      const progress = next.mode === 'click' ? 1 - next.clickLeft / CLICK_DURATION : 0
      bounce.current.position.y = reduced ? 0 : Math.sin(progress * Math.PI) * 0.8
      bounce.current.position.x = !reduced && next.mode === 'click' ? Math.sin(t * 60) * 0.05 : 0
      bounce.current.scale.setScalar(!reduced && next.mode === 'idle' ? 1 + Math.sin(t * 1.6) * 0.03 : 1)
    }

    // Rosto vira para a câmera com uma mola: atraso, leve balanço e pitch limitado.
    if (face.current) {
      face.current.getWorldPosition(facePos)
      const target = faceTarget(facePos.toArray() as Vec3, camera.position.toArray() as Vec3)
      spring.current = reduced ? { ...FACE_AT_REST, ...target } : stepFaceSpring(spring.current, target, dt)
      const wobble = next.mode === 'hover' && !reduced ? Math.sin(t * 3) * 0.08 : 0
      face.current.rotation.set(-spring.current.pitch, spring.current.yaw, wobble, 'YXZ')
    }

    const k = 1 - Math.exp(-6 * dt)
    if (glow.current) glow.current.opacity += (0.22 * look.glow - glow.current.opacity) * k
    if (light.current) light.current.intensity += (2.2 * look.glow - light.current.intensity) * k
  })

  function handleClick(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation()
    machine.current = sunReducer(machine.current, { type: 'click' })
    setMode('click')
    select({ kind: 'profile' })
  }

  return (
    <group ref={body}>
      <pointLight ref={light} decay={0} intensity={2.2} color="#e0fbff" />
      <group ref={bounce}>
        <mesh
          ref={face}
          onClick={handleClick}
          onPointerOver={(e) => {
            e.stopPropagation()
            setHovered(true)
          }}
          onPointerOut={() => setHovered(false)}
        >
          <sphereGeometry args={[SUN_RADIUS, 64, 32]} />
          <meshStandardMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={0.85} roughness={0.7} />
        </mesh>
        <mesh scale={1.25}>
          <sphereGeometry args={[SUN_RADIUS, 32, 16]} />
          <meshBasicMaterial
            ref={glow}
            color="#22d3ee"
            transparent
            opacity={0.22}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  )
}
```

Em `src/components/three/Scene.tsx`: importe `import { Sun } from './Sun'`, **remova** a linha `<pointLight position={[0, 0, 0]} decay={0} intensity={2.2} color="#e0fbff" />` (a luz agora acompanha o sol) e acrescente `<Sun />` logo depois de `<SimClockDriver />`.

- [ ] **Step 6: Painel de perfil**

`src/components/ui/ProfilePanel.tsx`:

```tsx
import { formatCount, timeAgo } from '@/lib/format'
import type { Profile } from '@/lib/types'
import { languageShares } from '@/lib/universe/planets'
import { useUniverse } from '@/store/universe'
import { SidePanel } from './SidePanel'

export function ProfilePanel({ profile }: { profile: Profile }) {
  const open = useUniverse((s) => s.selection.kind === 'profile')
  const clearSelection = useUniverse((s) => s.clearSelection)
  const stats: [string, number][] = [
    ['Stars', profile.totalStars],
    ['Forks', profile.totalForks],
    ['Seguidores', profile.followers],
    ['Repos', profile.totalRepos],
  ]

  return (
    <SidePanel open={open} onClose={clearSelection} title={`Perfil de ${profile.name}`}>
      <div className="space-y-5 pr-6">
        <header className="flex items-center gap-4">
          <img src={profile.avatarUrl} alt="" width={64} height={64} className="h-16 w-16 rounded-full ring-2 ring-neon/50" />
          <div>
            <h2 className="text-xl font-semibold text-neon">{profile.name}</h2>
            <p className="text-sm text-slate-400">@{profile.login}</p>
          </div>
        </header>
        {profile.bio && <p className="text-sm text-slate-300">{profile.bio}</p>}

        <dl className="grid grid-cols-2 gap-3 text-center">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-white/5 p-2">
              <dt className="text-xs text-slate-400">{label}</dt>
              <dd className="text-lg font-semibold">{formatCount(value)}</dd>
            </div>
          ))}
        </dl>

        <section>
          <h3 className="text-xs uppercase tracking-wider text-slate-400">Top linguagens</h3>
          <ul className="mt-2 space-y-1">
            {languageShares(profile.topLanguages).map((l) => (
              <li key={l.name} className="flex items-center gap-2 text-sm">
                <span className="h-3 w-3 rounded-full" style={{ background: l.color }} />
                {l.name}
                <span className="ml-auto tabular-nums text-slate-400">{l.share.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="text-xs uppercase tracking-wider text-slate-400">Último commit</h3>
          {profile.lastCommit ? (
            <p className="mt-2 text-sm">
              {profile.lastCommit.message}
              <span className="block text-xs text-slate-400">{timeAgo(profile.lastCommit.date)}</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-400">Nenhum commit público.</p>
          )}
        </section>
      </div>
    </SidePanel>
  )
}
```

Em `src/App.tsx`, importe `ProfilePanel` e acrescente depois de `<PlanetPanel universe={universe} />`:

```tsx
      <ProfilePanel profile={universe.profile} />
```

- [ ] **Step 7: Verificar**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: sem erros.

Run: `pnpm dev`
Expected:
- sol azul e verde no centro, com glow ciano, olhos, pupilas e boca rosa; pisca a cada 3–5 s;
- ao orbitar a câmera (arrastar), o rosto acompanha com atraso e um pequeno balanço; ao subir a câmera, o rosto olha para cima até ~35° e não vira;
- mouse perto: sorriso aberto, brilho aumenta, o sol se inclina para o mouse; mouse longe: expressão triste e, ~4 s depois, volta ao sorriso;
- clique: pula, vibra, expressão surpresa, abre o painel de perfil e a câmera vai até o sol com o painel à direita;
- com "Reduzir movimento" ligado no sistema, nada pula nem vibra e o sistema fica parado.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "feat: sol com rosto que segue a câmera e painel de perfil"
```

---

### Task 11: Tutorial guiado

**Files:**
- Create: `src/lib/tutorial.ts`, `src/store/tutorial.ts`, `src/components/ui/Tutorial.tsx`
- Modify: `src/lib/cameraPoses.ts`, `src/components/three/CameraRig.tsx`, `src/components/three/SimClockDriver.tsx`, `src/App.tsx`
- Test: `src/lib/tutorial.test.ts`, `src/lib/cameraPoses.test.ts` (acrescentar casos)

**Interfaces:**
- Consumes: poses da Task 9; `formatLine` (Task 7); `useUniverse` (Task 7); `predictStopTime`, `clockTarget` (Task 5).
- Produces: `TUTORIAL_STEPS`, `TutorialStep`, `tutorialReducer(step, action)`, `TUTORIAL_COPY`, `tutorialFocusesPlanet(step)`; `useTutorial` com `step`, `start()`, `next()`, `skip()`; `showcasePlanet(repos): string | null`; `tutorialPose(step, system, repos, time, layout): Pose`; componente `Tutorial({ profileName })`.

- [ ] **Step 1: Teste do tutorial (falha)**

`src/lib/tutorial.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TUTORIAL_COPY, TUTORIAL_STEPS, tutorialFocusesPlanet, tutorialReducer } from './tutorial'

describe('tutorialReducer', () => {
  it('percorre os 4 passos e termina', () => {
    let step = tutorialReducer(null, 'start')
    const seen = [step]
    while (step) {
      step = tutorialReducer(step, 'next')
      seen.push(step)
    }
    expect(seen).toEqual(['welcome', 'repos', 'tech', 'free', null])
  })

  it('pular encerra de qualquer passo e start reinicia', () => {
    expect(tutorialReducer('repos', 'skip')).toBeNull()
    expect(tutorialReducer('tech', 'start')).toBe('welcome')
    expect(tutorialReducer(null, 'next')).toBeNull()
  })

  it('todo passo tem texto, e só "tech" foca um planeta', () => {
    for (const step of TUTORIAL_STEPS) expect(TUTORIAL_COPY[step].length).toBeGreaterThan(20)
    expect(TUTORIAL_STEPS.filter(tutorialFocusesPlanet)).toEqual(['tech'])
  })
})
```

Run: `pnpm test src/lib/tutorial.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implementar o tutorial**

`src/lib/tutorial.ts`:

```ts
export const TUTORIAL_STEPS = ['welcome', 'repos', 'tech', 'free'] as const
export type TutorialStep = (typeof TUTORIAL_STEPS)[number]
export type TutorialAction = 'start' | 'next' | 'skip'

export function tutorialReducer(step: TutorialStep | null, action: TutorialAction): TutorialStep | null {
  if (action === 'start') return 'welcome'
  if (action === 'skip' || step === null) return null
  return TUTORIAL_STEPS[TUTORIAL_STEPS.indexOf(step) + 1] ?? null
}

/** `{name}` vira o primeiro nome do perfil (formatLine). */
export const TUTORIAL_COPY: Record<TutorialStep, string> = {
  welcome: 'Bem-vindo ao universo GitHub de {name}! O sol no centro é o perfil: clique nele quando quiser.',
  repos: 'Cada planeta é um repositório. Quanto maior o planeta, mais stars e forks ele tem.',
  tech: 'As luas são as linguagens do repo, na cor oficial de cada uma. Os quadradinhos verdes são os commits de cada dia.',
  free: 'Agora é com você: arraste para girar, role para aproximar e clique em tudo. Se precisar, é só me chamar!',
}

export function tutorialFocusesPlanet(step: TutorialStep | null): boolean {
  return step === 'tech'
}
```

`src/store/tutorial.ts`:

```ts
import { create } from 'zustand'
import { tutorialReducer, type TutorialStep } from '@/lib/tutorial'
import { useUniverse } from './universe'

interface TutorialState {
  step: TutorialStep | null
  start: () => void
  next: () => void
  skip: () => void
}

export const useTutorial = create<TutorialState>()((set, get) => ({
  step: null,
  start: () => {
    useUniverse.getState().clearSelection()
    set({ step: tutorialReducer(get().step, 'start') })
  },
  next: () => set({ step: tutorialReducer(get().step, 'next') }),
  skip: () => set({ step: tutorialReducer(get().step, 'skip') }),
}))
```

Run: `pnpm test src/lib/tutorial.test.ts`
Expected: PASS.

- [ ] **Step 3: Poses do tutorial (teste, falha)**

Acrescente ao fim de `src/lib/cameraPoses.test.ts` (e adicione `showcasePlanet, tutorialPose` ao import de `./cameraPoses`):

```ts
describe('tutorial', () => {
  const repos = [
    { name: 'p0', languages: [{ name: 'Go', color: '#0af', bytes: 10 }] },
    { name: 'p1', languages: [{ name: 'Go', color: '#0af', bytes: 10 }, { name: 'Shell', color: '#8e5', bytes: 5 }] },
  ]

  it('o planeta de vitrine é o primeiro com 2+ linguagens, senão o primeiro', () => {
    expect(showcasePlanet(repos)).toBe('p1')
    expect(showcasePlanet([repos[0]])).toBe('p0')
    expect(showcasePlanet([])).toBeNull()
  })

  it('cada passo tem a pose certa', () => {
    expect(tutorialPose('welcome', system, repos, 0, 'side')).toEqual(sunPose('side'))
    expect(tutorialPose('repos', system, repos, 0, 'side')).toEqual(overviewPose(system))
    expect(tutorialPose('free', system, repos, 0, 'side')).toEqual(overviewPose(system))
    expect(tutorialPose('tech', system, repos, 7, 'side')).toEqual(selectionPose({ kind: 'planet', name: 'p1' }, system, 7, 'side'))
  })
})
```

Run: `pnpm test src/lib/cameraPoses.test.ts`
Expected: FAIL (`showcasePlanet` não exportado).

- [ ] **Step 4: Implementar as poses do tutorial**

Acrescente ao fim de `src/lib/cameraPoses.ts` (e o import `import type { TutorialStep } from './tutorial'` e `import type { RepoBase } from './types'` no topo):

```ts
export function showcasePlanet(repos: Pick<RepoBase, 'name' | 'languages'>[]): string | null {
  return (repos.find((r) => r.languages.length >= 2) ?? repos[0])?.name ?? null
}

export function tutorialPose(
  step: TutorialStep,
  system: OrbitSystem,
  repos: Pick<RepoBase, 'name' | 'languages'>[],
  time: number,
  layout: PanelLayout,
): Pose {
  if (step === 'welcome') return sunPose(layout)
  if (step === 'tech') {
    const name = showcasePlanet(repos)
    return (name && planetFocusPose(system, name, time, layout)) || overviewPose(system)
  }
  return overviewPose(system)
}
```

Run: `pnpm test src/lib`
Expected: PASS.

- [ ] **Step 5: Câmera e relógio obedecem ao tutorial**

Substitua `src/components/three/CameraRig.tsx` por:

```tsx
import { useEffect, useRef, type ComponentRef } from 'react'
import { CameraControls } from '@react-three/drei'
import { MOBILE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { maxCameraDistance, selectionPose, tutorialPose } from '@/lib/cameraPoses'
import type { Repo } from '@/lib/types'
import { predictStopTime } from '@/lib/universe/clock'
import type { OrbitSystem } from '@/lib/universe/orbits'
import { simClock } from '@/store/simClock'
import { useTutorial } from '@/store/tutorial'
import { useUniverse } from '@/store/universe'

export function CameraRig({ system, repos }: { system: OrbitSystem; repos: Repo[] }) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null)
  const selection = useUniverse((s) => s.selection)
  const step = useTutorial((s) => s.step)
  const layout = useMediaQuery(MOBILE_QUERY) ? 'bottom' : 'side'
  const guided = step !== null && step !== 'free'

  useEffect(() => {
    // O tempo desacelera até parar ao focar: mira onde o planeta vai estar quando parar.
    const stop = predictStopTime(simClock)
    const pose =
      step !== null && step !== 'free'
        ? tutorialPose(step, system, repos, stop, layout)
        : selectionPose(selection, system, stop, layout)
    void controls.current?.setLookAt(...pose.position, ...pose.target, true)
  }, [selection, step, system, repos, layout])

  return (
    <CameraControls
      ref={controls}
      makeDefault
      enabled={!guided}
      minDistance={2}
      maxDistance={maxCameraDistance(system)}
      smoothTime={0.6}
      dollyToCursor={false}
    />
  )
}
```

Em `src/components/three/Scene.tsx`, troque `<CameraRig system={system} />` por `<CameraRig system={system} repos={universe.repos} />`.

Em `src/components/three/SimClockDriver.tsx`, importe `import { tutorialFocusesPlanet } from '@/lib/tutorial'` e `import { useTutorial } from '@/store/tutorial'`, e troque `tutorialFocus: false` por:

```ts
tutorialFocus: tutorialFocusesPlanet(useTutorial.getState().step)
```

- [ ] **Step 6: Card do tutorial**

`src/components/ui/Tutorial.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { formatLine } from '@/lib/octocat/lines'
import { TUTORIAL_COPY, TUTORIAL_STEPS } from '@/lib/tutorial'
import { useTutorial } from '@/store/tutorial'

const STORAGE_KEY = 'gu3d:tutorial-done'

function tutorialDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function markTutorialDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // Sem storage (modo privado): o tutorial volta na próxima visita, sem problema.
  }
}

export function Tutorial({ profileName }: { profileName: string }) {
  const step = useTutorial((s) => s.step)
  const start = useTutorial((s) => s.start)
  const next = useTutorial((s) => s.next)
  const skip = useTutorial((s) => s.skip)
  const wasActive = useRef(false)

  useEffect(() => {
    if (tutorialDone()) return
    const timer = window.setTimeout(start, 1500)
    return () => window.clearTimeout(timer)
  }, [start])

  useEffect(() => {
    if (step) wasActive.current = true
    else if (wasActive.current) markTutorialDone()
  }, [step])

  useEffect(() => {
    if (!step) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, skip])

  return (
    <AnimatePresence>
      {step && (
        <motion.section
          key={step}
          role="region"
          aria-label="Tutorial"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="fixed inset-x-4 bottom-36 z-40 rounded-2xl border border-neon/40 bg-panel/95 p-4 text-sm shadow-xl backdrop-blur md:inset-x-auto md:bottom-56 md:right-4 md:w-[340px]"
        >
          <p className="text-xs text-slate-400">
            {TUTORIAL_STEPS.indexOf(step) + 1}/{TUTORIAL_STEPS.length}
          </p>
          <p className="mt-1 text-slate-100">{formatLine(TUTORIAL_COPY[step], profileName)}</p>
          <div className="mt-3 flex justify-end gap-2">
            {step !== 'free' && (
              <button type="button" onClick={skip} className="rounded-full px-3 py-1.5 text-slate-400 hover:text-slate-100">
                Pular tutorial
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="rounded-full bg-neon/90 px-4 py-1.5 font-medium text-space hover:bg-neon"
            >
              {step === 'free' ? 'Explorar' : 'Próximo'}
            </button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  )
}
```

Em `src/App.tsx`, importe `Tutorial` e acrescente depois de `<ProfilePanel profile={universe.profile} />`:

```tsx
      <Tutorial profileName={universe.profile.name} />
```

- [ ] **Step 7: Verificar**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: sem erros.

Run: `pnpm dev` numa aba anônima.
Expected:
- 1,5 s após carregar, aparece o card "1/4 Bem-vindo ao universo GitHub de Mona!…" e a câmera vai ao sol;
- "Próximo" leva à visão geral (2/4); o 3/4 foca um planeta com 2+ linguagens e o sistema para; o 4/4 tem o botão "Explorar";
- durante os passos 1–3, arrastar não move a câmera; no 4 e depois, move;
- "Pular tutorial" ou Esc encerram; recarregar a página **não** abre o tutorial de novo.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "feat: tutorial guiado com câmera conduzida"
```

---

### Task 12: Octocat 3D — modelo e página de preview (aprovação por partes)

> **Ordem de execução:** esta task roda logo depois da Task 3, antes das Tasks 4–11, a pedido do usuário. Ela é entregue em **4 partes**. Ao fim de cada parte, o implementador commita, **para** e reporta; o controlador abre `http://localhost:5173/github-universe-3d/?preview=octocat` no navegador do usuário e só segue para a próxima parte depois da aprovação (ajustes pedidos pelo usuário entram como rodada extra da mesma parte).

**Files:**
- Create: `src/lib/octocat/expression.ts`, `src/lib/ship/geometry.ts`, `src/lib/ship/motion.ts`, `src/components/three/octocat/Ship.tsx`, `src/components/three/octocat/Pilot.tsx`, `src/components/three/octocat/octocatFace.ts`, `src/components/three/octocat/ClawdHat.tsx`, `src/components/three/octocat/OctocatShip.tsx`, `src/preview/OctocatPreview.tsx`
- Modify: `src/main.tsx`
- Test: `src/lib/ship/geometry.test.ts`, `src/lib/ship/motion.test.ts`

**Interfaces:**
- Consumes: nada das Tasks 2–11 (só React Three Fiber, drei, three, Framer Motion e Tailwind da Task 1).
- Produces:
  - `expression.ts`: `OCTOCAT_EXPRESSIONS`, `OctocatExpression = 'neutral' | 'happy' | 'wink' | 'surprised' | 'thinking'` (a Task 7 reexporta este tipo em `lines.ts`).
  - `geometry.ts`: `svgTo3d(x, y): [number, number]`, `COLORS`, `CONTRIBUTION_COLORS`, `HULL`, `DOME`, `TORSO`, `HEAD`, `FACE`, `UPPER_FIN`, `LOWER_FIN`, `FREE_ARM`, `STICK_ARM`, `JOYSTICK`, `HEADLIGHT`, `SQUARES_X`, `ARM_RADIUS`, `ARM_Z`, `Block`, `HAT_BLOCKS`, `HAT_EYE_BLOCKS`, `CROWN_DEPTH`, `BRIM_DEPTH`.
  - `motion.ts`: `hoverOffset(t)`, `WAVE_AMPLITUDE`, `waveAngle(t)`, `POINT_ANGLE`, `thrusterScale(t, level)`, `BLINK_EVERY`, `BLINK_LENGTH`, `isBlinking(t)`.
  - Componentes: `Ship({ thrusterLevel })`, `Pilot({ expression, blinking, armMode })`, `ClawdHat()`, `OctocatShip({ expression?, armMode?, thrusterLevel?, floating?, parts? })`, `ArmMode = 'rest' | 'wave' | 'point'`, `OctocatShipParts`, `ALL_PARTS`; `OctocatPreview()`.

Convenção do modelo: a arte de referência é o SVG `viewBox="0 0 400 420"` de `design/Octocat.dc.html` (linhas 29–75; expressões nas linhas 90–175). **100 px = 1 unidade**, origem no centro do casco `(200, 312)`, y para cima, a nave olha para **+z** (a câmera do preview fica em +z).

#### Parte A — nave

- [ ] **Step A1: Tipo de expressão**

`src/lib/octocat/expression.ts`:

```ts
export const OCTOCAT_EXPRESSIONS = ['neutral', 'happy', 'wink', 'surprised', 'thinking'] as const
export type OctocatExpression = (typeof OCTOCAT_EXPRESSIONS)[number]
```

- [ ] **Step A2: Teste da geometria (falha)**

`src/lib/ship/geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BRIM_DEPTH, CROWN_DEPTH, FACE, HAT_BLOCKS, HAT_EYE_BLOCKS, HEAD, HULL, LOWER_FIN, svgTo3d, UPPER_FIN } from './geometry'

describe('svgTo3d', () => {
  it('converte com 100 px = 1 unidade, origem no centro do casco e y para cima', () => {
    expect(svgTo3d(200, 312)).toEqual([0, 0])
    expect(svgTo3d(300, 212)).toEqual([1, 1])
    expect(svgTo3d(100, 412)).toEqual([-1, -1])
  })
})

describe('peças da nave', () => {
  it('as asas saem das laterais do casco', () => {
    for (const fin of [UPPER_FIN, LOWER_FIN]) {
      expect(fin).toHaveLength(4)
      expect(fin.every(([x]) => x < 0 && x > -HULL.rx - 0.2)).toBe(true)
    }
  })
})

describe('gorro-Clawd', () => {
  const crown = HAT_BLOCKS.find((b) => b.size[2] === CROWN_DEPTH)!
  const brim = HAT_BLOCKS.find((b) => b.size[2] === BRIM_DEPTH)!

  it('tem 10 blocos e 2 olhos', () => {
    expect(HAT_BLOCKS).toHaveLength(10)
    expect(HAT_EYE_BLOCKS).toHaveLength(2)
  })

  it('a copa encaixa no alto da cabeça', () => {
    const headTop = HEAD.center[1] + HEAD.ry
    const crownBottom = crown.position[1] - crown.size[1] / 2
    const crownTop = crown.position[1] + crown.size[1] / 2
    expect(crownBottom).toBeLessThan(headTop)
    expect(crownTop).toBeGreaterThan(headTop)
  })

  it('a aba fica na frente do rosto e os olhos na frente da copa', () => {
    expect(brim.size[2] / 2).toBeGreaterThan(FACE.z)
    for (const eye of HAT_EYE_BLOCKS) expect(eye.position[2]).toBeGreaterThan(CROWN_DEPTH / 2)
  })
})
```

Run: `pnpm test src/lib/ship/geometry.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step A3: Geometria derivada do SVG**

`src/lib/ship/geometry.ts`:

```ts
/**
 * Medidas do Octocat piloto tiradas do SVG de design/Octocat.dc.html (viewBox 0 0 400 420).
 * 100 px = 1 unidade; origem no centro do casco (200, 312); y para cima; a nave olha para +z.
 */
const ORIGIN_X = 200
const ORIGIN_Y = 312
const PX = 100

export function svgTo3d(x: number, y: number): [number, number] {
  return [(x - ORIGIN_X) / PX, (ORIGIN_Y - y) / PX]
}

export const COLORS = {
  ship: '#C4B5FD',
  stripe: '#E6EAF0',
  dome: '#A5F3FC',
  thruster: '#67E8F9',
  headlight: '#FFF3C4',
  body: '#1F2329',
  skin: '#F2C9A6',
  face: '#7A2F2F',
  blush: '#F29C8A',
  hat: '#D97757',
  hatBrim: '#B85C3E',
  hatEyes: '#141413',
  stick: '#4A5878',
  thought: '#9AA3B8',
} as const

export const CONTRIBUTION_COLORS = ['#39D353', '#26A641', '#39D353', '#0E4429', '#39D353', '#26A641', '#39D353'] as const

/** Casco: elipse rx 150, ry 52; a profundidade (rz) é escolha do 3D. */
export const HULL = { rx: 1.5, ry: 0.38, rz: 1.1 } as const
/** Cúpula: path M54 292 Q54 56 200 54 Q346 56 346 292. */
export const DOME = { base: svgTo3d(200, 292), rx: 1.46, ry: 2.38, rz: 1.1 } as const
/** Corpo: path M150 296 Q146 232 200 226 Q254 232 250 296. */
export const TORSO = { base: svgTo3d(200, 296), rx: 0.5, ry: 0.7, rz: 0.42 } as const
/** Cabeça: elipse cx 200, cy 190, rx 62, ry 54. */
export const HEAD = { center: svgTo3d(200, 190), rx: 0.62, ry: 0.54, rz: 0.5 } as const
/** Rosto: elipse cx 200, cy 204, rx 46, ry 34; disco logo à frente da cabeça. */
export const FACE = { center: svgTo3d(200, 204), rx: 0.46, ry: 0.34, z: 0.49 } as const

const pts = (list: [number, number][]) => list.map(([x, y]) => svgTo3d(x, y))
/** Asa superior esquerda: M96 286 L60 250 L74 246 L118 286 (a direita é espelhada). */
export const UPPER_FIN = pts([[96, 286], [60, 250], [74, 246], [118, 286]])
/** Asa inferior esquerda: M150 330 L70 392 L104 398 L190 336. */
export const LOWER_FIN = pts([[150, 330], [70, 392], [104, 398], [190, 336]])

/** Braço livre (acena): M160 254 Q124 236 120 198. */
export const FREE_ARM = { from: svgTo3d(160, 254), control: svgTo3d(124, 236), to: svgTo3d(120, 198) } as const
/** Braço no manche: M238 262 Q256 250 262 262. */
export const STICK_ARM = { from: svgTo3d(238, 262), control: svgTo3d(256, 250), to: svgTo3d(262, 262) } as const
/** Manche: rect x 262, y 262, 8 × 32; bola cx 266, cy 258, r 10. */
export const JOYSTICK = { base: svgTo3d(266, 278), height: 0.32, knob: svgTo3d(266, 258), knobRadius: 0.1 } as const
/** Farol: circle cx 200, cy 336, r 8. */
export const HEADLIGHT = svgTo3d(200, 336)
/** Quadradinhos de contribuição na faixa (rects de 10 px a partir de x = 112, passo 28). */
export const SQUARES_X = [117, 145, 173, 201, 229, 257, 285].map((x) => (x - ORIGIN_X) / PX)
export const ARM_RADIUS = 0.065
export const ARM_Z = 0.2

export interface Block {
  position: [number, number, number]
  size: [number, number, number]
  color: string
}

export const CROWN_DEPTH = 0.75
/** A aba é mais funda que o rosto (FACE.z) para cobrir a testa, como no SVG. */
export const BRIM_DEPTH = 1.05

/** Retângulos do gorro-Clawd (dentro de translate(80 44)): x, y, w, h, profundidade 3D, cor. */
const HAT_RECTS: [number, number, number, number, number, string][] = [
  [92, 34, 9, 18, 0.3, COLORS.hat],
  [108, 34, 9, 18, 0.3, COLORS.hat],
  [124, 34, 9, 18, 0.3, COLORS.hat],
  [140, 34, 9, 18, 0.3, COLORS.hat],
  [62, 50, 116, 80, CROWN_DEPTH, COLORS.hat],
  [40, 96, 24, 14, 0.3, COLORS.hat],
  [176, 96, 24, 14, 0.3, COLORS.hat],
  [40, 110, 14, 34, 0.3, COLORS.hat],
  [186, 110, 14, 34, 0.3, COLORS.hat],
  [58, 120, 124, 14, BRIM_DEPTH, COLORS.hatBrim],
]
const HAT_EYE_RECTS: [number, number, number, number][] = [
  [96, 66, 10, 24],
  [134, 66, 10, 24],
]

function rectToBlock(x: number, y: number, w: number, h: number, depth: number, color: string, z = 0): Block {
  const [cx, cy] = svgTo3d(80 + x + w / 2, 44 + y + h / 2)
  return { position: [cx, cy, z], size: [w / PX, h / PX, depth], color }
}

export const HAT_BLOCKS: Block[] = HAT_RECTS.map(([x, y, w, h, depth, color]) => rectToBlock(x, y, w, h, depth, color))
export const HAT_EYE_BLOCKS: Block[] = HAT_EYE_RECTS.map(([x, y, w, h]) =>
  rectToBlock(x, y, w, h, 0.02, COLORS.hatEyes, CROWN_DEPTH / 2 + 0.011),
)
```

Run: `pnpm test src/lib/ship/geometry.test.ts`
Expected: PASS.

- [ ] **Step A4: A nave**

`src/components/three/octocat/Ship.tsx` (nesta parte, o propulsor é estático; a Parte D faz ele tremular):

```tsx
import { useRef } from 'react'
import * as THREE from 'three'
import { COLORS, CONTRIBUTION_COLORS, DOME, HEADLIGHT, HULL, LOWER_FIN, SQUARES_X, UPPER_FIN } from '@/lib/ship/geometry'

const HULL_GEOMETRY = new THREE.SphereGeometry(1, 48, 24)
const DOME_GEOMETRY = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2)
const FLAME_LENGTH = 0.9
const FLAME_GEOMETRY = new THREE.ConeGeometry(0.22, FLAME_LENGTH, 16).translate(0, FLAME_LENGTH / 2, 0)

function finGeometry(points: [number, number][], mirror: boolean): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(mirror ? -x : x, y)))
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false })
  geometry.translate(0, 0, -0.04)
  return geometry
}

const FIN_GEOMETRIES = [UPPER_FIN, LOWER_FIN].flatMap((fin) => [finGeometry(fin, false), finGeometry(fin, true)])

/** Ponto da superfície frontal do casco na altura y, para encostar peças nele. */
function hullFrontZ(x: number, y: number): number {
  const k = 1 - (x / HULL.rx) ** 2 - (y / HULL.ry) ** 2
  return HULL.rz * Math.sqrt(Math.max(0, k))
}

export function Ship({ thrusterLevel }: { thrusterLevel: number }) {
  const flame = useRef<THREE.Mesh>(null)

  return (
    <group>
      <mesh geometry={HULL_GEOMETRY} scale={[HULL.rx, HULL.ry, HULL.rz]}>
        <meshStandardMaterial color={COLORS.ship} roughness={0.45} metalness={0.15} />
      </mesh>

      {/* faixa clara em volta do casco */}
      <mesh position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[HULL.rx, HULL.rz, 1]}>
        <torusGeometry args={[1, 0.035, 8, 64]} />
        <meshStandardMaterial color={COLORS.stripe} roughness={0.5} />
      </mesh>

      {/* quadradinhos de contribuição na frente da faixa */}
      {SQUARES_X.map((x, i) => {
        const z = hullFrontZ(x, 0.03) + 0.03
        const yaw = Math.atan2(x / HULL.rx ** 2, z / HULL.rz ** 2)
        return (
          <mesh key={i} position={[x, 0.03, z]} rotation={[0, yaw, 0]}>
            <boxGeometry args={[0.1, 0.1, 0.04]} />
            <meshStandardMaterial color={CONTRIBUTION_COLORS[i]} emissive={CONTRIBUTION_COLORS[i]} emissiveIntensity={0.35} />
          </mesh>
        )
      })}

      {/* farol */}
      <mesh position={[HEADLIGHT[0], HEADLIGHT[1], hullFrontZ(HEADLIGHT[0], HEADLIGHT[1]) + 0.02]}>
        <sphereGeometry args={[0.08, 16, 8]} />
        <meshStandardMaterial color={COLORS.headlight} emissive={COLORS.headlight} emissiveIntensity={1.2} />
      </mesh>

      {FIN_GEOMETRIES.map((geometry, i) => (
        <mesh key={i} geometry={geometry}>
          <meshStandardMaterial color={COLORS.ship} roughness={0.5} metalness={0.1} />
        </mesh>
      ))}

      {/* propulsor atrás do casco */}
      <mesh
        ref={flame}
        geometry={FLAME_GEOMETRY}
        position={[0, 0, -HULL.rz + 0.05]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1, Math.max(thrusterLevel, 0.001), 1]}
        visible={thrusterLevel > 0.01}
      >
        <meshBasicMaterial color={COLORS.thruster} transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* cúpula de vidro */}
      <mesh geometry={DOME_GEOMETRY} position={[0, DOME.base[1], 0]} scale={[DOME.rx, DOME.ry, DOME.rz]}>
        <meshStandardMaterial
          color={COLORS.dome}
          transparent
          opacity={0.16}
          roughness={0.1}
          metalness={0.1}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
```

- [ ] **Step A5: Componente agregador e preview**

`src/components/three/octocat/OctocatShip.tsx` (versão da Parte A: só a nave):

```tsx
import { Ship } from './Ship'

export interface OctocatShipParts {
  ship: boolean
  pilot: boolean
  hat: boolean
}

export const ALL_PARTS: OctocatShipParts = { ship: true, pilot: true, hat: true }

interface OctocatShipProps {
  thrusterLevel?: number
  parts?: OctocatShipParts
}

export function OctocatShip({ thrusterLevel = 0.3, parts = ALL_PARTS }: OctocatShipProps) {
  return <group>{parts.ship && <Ship thrusterLevel={thrusterLevel} />}</group>
}
```

`src/preview/OctocatPreview.tsx` (versão da Parte A; as Partes B–D acrescentam controles):

```tsx
import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { ALL_PARTS, OctocatShip, type OctocatShipParts } from '@/components/three/octocat/OctocatShip'

const PART_LABELS: [keyof OctocatShipParts, string][] = [
  ['ship', 'Nave'],
  ['pilot', 'Octocat'],
  ['hat', 'Gorro-Clawd'],
]

export function OctocatPreview() {
  const [parts, setParts] = useState<OctocatShipParts>(ALL_PARTS)
  const [thruster, setThruster] = useState(0.3)
  const [spin, setSpin] = useState(true)

  return (
    <main className="fixed inset-0 bg-space text-slate-100">
      <Canvas dpr={[1, 2]} camera={{ position: [0, 1.4, 6.5], fov: 45 }}>
        <color attach="background" args={['#0a0e27']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 5, 4]} intensity={1.6} />
        <pointLight position={[-4, 2, 3]} intensity={20} color="#22d3ee" />
        <Stars radius={60} depth={30} count={1500} factor={3} fade />
        <OctocatShip thrusterLevel={thruster} parts={parts} />
        <OrbitControls target={[0, 0.9, 0]} autoRotate={spin} autoRotateSpeed={0.8} enablePan={false} minDistance={2.5} maxDistance={14} />
      </Canvas>

      <aside className="fixed left-4 top-4 w-64 space-y-4 rounded-2xl border border-neon/30 bg-panel/90 p-4 text-sm backdrop-blur">
        <h1 className="font-semibold text-neon">Octocat 3D — preview</h1>

        <fieldset className="space-y-1">
          <legend className="text-xs uppercase tracking-wider text-slate-400">Peças</legend>
          {PART_LABELS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={parts[key]}
                onChange={(e) => setParts({ ...parts, [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-slate-400">Propulsor</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={thruster}
            onChange={(e) => setThruster(Number(e.target.value))}
            className="w-full"
          />
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} />
          Girar sozinho
        </label>
      </aside>
    </main>
  )
}
```

Substitua `src/main.tsx` por:

```tsx
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

const OctocatPreview = lazy(() => import('./preview/OctocatPreview').then((m) => ({ default: m.OctocatPreview })))
const showOctocatPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'octocat'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showOctocatPreview ? (
      <Suspense fallback={null}>
        <OctocatPreview />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
```

- [ ] **Step A6: Verificar, commitar e PARAR**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: tudo PASS.

Suba `pnpm dev` em segundo plano e confirme com `curl -s http://localhost:5173/github-universe-3d/?preview=octocat | grep -c root` que a página responde; depois **derrube o servidor** (o controlador sobe o dele para mostrar ao usuário).

```bash
git add src/lib/octocat/expression.ts src/lib/ship src/components/three/octocat src/preview src/main.tsx
git commit -m "feat(octocat-3d): nave e página de preview"
```

**Pare aqui e reporte.** O que o usuário deve ver: casco elipsoide roxo claro, faixa clara com 7 quadradinhos verdes na frente, farol amarelo, quatro asas, cúpula de vidro azul translúcida e chama ciano atrás que cresce com o controle "Propulsor".

#### Parte B — Octocat (corpo, cabeça, rosto e expressões)

- [ ] **Step B1: Desenho do rosto**

`src/components/three/octocat/octocatFace.ts`:

```ts
import type { OctocatExpression } from '@/lib/octocat/expression'
import { COLORS } from '@/lib/ship/geometry'

export const FACE_TEX_W = 256
export const FACE_TEX_H = 192
/** O canvas cobre a caixa da elipse do rosto no SVG (cx 200, cy 204, rx 46, ry 34). */
const BOX = { x: 154, y: 170, w: 92, h: 68 }

type Layer =
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; color: string; opacity?: number }
  | { kind: 'stroke'; d: string; width: number }
  | { kind: 'fill'; d: string }

/** Rosto do piloto (coordenadas do SVG principal). */
const NEUTRAL: Layer[] = [
  { kind: 'ellipse', cx: 186, cy: 200, rx: 6, ry: 9, color: COLORS.face },
  { kind: 'ellipse', cx: 214, cy: 200, rx: 6, ry: 9, color: COLORS.face },
  { kind: 'ellipse', cx: 200, cy: 215, rx: 3, ry: 3, color: COLORS.face },
  { kind: 'stroke', d: 'M190 222 Q200 231 210 222', width: 2.5 },
  { kind: 'ellipse', cx: 172, cy: 214, rx: 8, ry: 4, color: COLORS.blush, opacity: 0.6 },
  { kind: 'ellipse', cx: 228, cy: 214, rx: 8, ry: 4, color: COLORS.blush, opacity: 0.6 },
]

const NEUTRAL_BLINK: Layer[] = [
  { kind: 'stroke', d: 'M180 200 L192 200 M208 200 L220 200', width: 3 },
  ...NEUTRAL.slice(2),
]

/** Folha de expressões: desenhadas em coordenadas deslocadas por translate(80 44). */
const SHEET: Record<Exclude<OctocatExpression, 'neutral'>, Layer[]> = {
  happy: [
    { kind: 'stroke', d: 'M98 158 Q106 147 114 158 M126 158 Q134 147 142 158', width: 3.5 },
    { kind: 'fill', d: 'M106 174 Q120 192 134 174 Z' },
    { kind: 'ellipse', cx: 92, cy: 172, rx: 8, ry: 4, color: COLORS.blush, opacity: 0.7 },
    { kind: 'ellipse', cx: 148, cy: 172, rx: 8, ry: 4, color: COLORS.blush, opacity: 0.7 },
  ],
  wink: [
    { kind: 'ellipse', cx: 106, cy: 156, rx: 6, ry: 9, color: COLORS.face },
    { kind: 'stroke', d: 'M127 158 Q134 151 141 158', width: 3.5 },
    { kind: 'stroke', d: 'M109 177 Q120 188 131 177', width: 3 },
  ],
  surprised: [
    { kind: 'ellipse', cx: 105, cy: 154, rx: 8, ry: 12, color: COLORS.face },
    { kind: 'ellipse', cx: 135, cy: 154, rx: 8, ry: 12, color: COLORS.face },
    { kind: 'ellipse', cx: 102, cy: 149, rx: 2.5, ry: 2.5, color: '#FFFFFF' },
    { kind: 'ellipse', cx: 132, cy: 149, rx: 2.5, ry: 2.5, color: '#FFFFFF' },
    { kind: 'ellipse', cx: 120, cy: 182, rx: 6, ry: 8, color: COLORS.face },
  ],
  thinking: [
    { kind: 'ellipse', cx: 110, cy: 151, rx: 6, ry: 9, color: COLORS.face },
    { kind: 'ellipse', cx: 138, cy: 151, rx: 6, ry: 9, color: COLORS.face },
    { kind: 'stroke', d: 'M112 180 L130 177', width: 3 },
  ],
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer): void {
  ctx.globalAlpha = layer.kind === 'ellipse' ? (layer.opacity ?? 1) : 1
  if (layer.kind === 'ellipse') {
    ctx.fillStyle = layer.color
    ctx.beginPath()
    ctx.ellipse(layer.cx, layer.cy, layer.rx, layer.ry, 0, 0, Math.PI * 2)
    ctx.fill()
  } else if (layer.kind === 'stroke') {
    ctx.strokeStyle = COLORS.face
    ctx.lineWidth = layer.width
    ctx.lineCap = 'round'
    ctx.stroke(new Path2D(layer.d))
  } else {
    ctx.fillStyle = COLORS.face
    ctx.fill(new Path2D(layer.d))
  }
}

export function drawOctocatFace(ctx: CanvasRenderingContext2D, expression: OctocatExpression, blinking: boolean): void {
  const sx = FACE_TEX_W / BOX.w
  const sy = FACE_TEX_H / BOX.h
  ctx.setTransform(sx, 0, 0, sy, -BOX.x * sx, -BOX.y * sy)
  ctx.clearRect(BOX.x, BOX.y, BOX.w, BOX.h)
  ctx.globalAlpha = 1
  ctx.fillStyle = COLORS.skin
  ctx.beginPath()
  ctx.ellipse(200, 204, 46, 34, 0, 0, Math.PI * 2)
  ctx.fill()

  if (expression === 'neutral') {
    for (const layer of blinking ? NEUTRAL_BLINK : NEUTRAL) drawLayer(ctx, layer)
  } else {
    ctx.translate(80, 44)
    for (const layer of SHEET[expression]) drawLayer(ctx, layer)
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
}
```

- [ ] **Step B2: O piloto**

`src/components/three/octocat/Pilot.tsx` (nesta parte o braço fica parado; a Parte D anima):

```tsx
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { OctocatExpression } from '@/lib/octocat/expression'
import { ARM_RADIUS, ARM_Z, COLORS, FACE, FREE_ARM, HEAD, JOYSTICK, STICK_ARM, TORSO } from '@/lib/ship/geometry'
import { drawOctocatFace, FACE_TEX_H, FACE_TEX_W } from './octocatFace'

export type ArmMode = 'rest' | 'wave' | 'point'

const HALF_SPHERE = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)
const SPHERE = new THREE.SphereGeometry(1, 32, 16)
const FACE_DISC = new THREE.CircleGeometry(1, 48)

function armGeometry(from: [number, number], control: [number, number], to: [number, number], origin: [number, number]) {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(from[0] - origin[0], from[1] - origin[1], 0),
    new THREE.Vector3(control[0] - origin[0], control[1] - origin[1], 0),
    new THREE.Vector3(to[0] - origin[0], to[1] - origin[1], 0),
  )
  return new THREE.TubeGeometry(curve, 16, ARM_RADIUS, 8, false)
}

/** Braço livre desenhado a partir do ombro, para girar em torno dele. */
const FREE_ARM_GEOMETRY = armGeometry(FREE_ARM.from, FREE_ARM.control, FREE_ARM.to, FREE_ARM.from)
const STICK_ARM_GEOMETRY = armGeometry(STICK_ARM.from, STICK_ARM.control, STICK_ARM.to, [0, 0])
/** Bolhas de pensamento do SVG (cx 196/212/230, cy 70/52/30, r 5/7/9, em translate(80 44)). */
const THOUGHTS: [number, number, number][] = [
  [(276 - 200) / 100, (312 - 114) / 100, 0.05],
  [(292 - 200) / 100, (312 - 96) / 100, 0.07],
  [(310 - 200) / 100, (312 - 74) / 100, 0.09],
]

interface PilotProps {
  expression: OctocatExpression
  blinking: boolean
  armMode: ArmMode
}

export function Pilot({ expression, blinking }: PilotProps) {
  const freeArm = useRef<THREE.Group>(null)
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = FACE_TEX_W
    canvas.height = FACE_TEX_H
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])

  useEffect(() => {
    const ctx = (texture.image as HTMLCanvasElement).getContext('2d')
    if (!ctx) return
    drawOctocatFace(ctx, expression, blinking)
    texture.needsUpdate = true
  }, [expression, blinking, texture])

  useEffect(() => () => texture.dispose(), [texture])

  const body = <meshStandardMaterial color={COLORS.body} roughness={0.6} />

  return (
    <group>
      <mesh geometry={HALF_SPHERE} position={[0, TORSO.base[1], 0]} scale={[TORSO.rx, TORSO.ry, TORSO.rz]}>
        {body}
      </mesh>
      <mesh geometry={SPHERE} position={[0, HEAD.center[1], 0]} scale={[HEAD.rx, HEAD.ry, HEAD.rz]}>
        {body}
      </mesh>
      <mesh geometry={FACE_DISC} position={[0, FACE.center[1], FACE.z]} scale={[FACE.rx, FACE.ry, 1]}>
        <meshStandardMaterial map={texture} roughness={0.8} />
      </mesh>

      {/* braço livre, com pivô no ombro */}
      <group ref={freeArm} position={[FREE_ARM.from[0], FREE_ARM.from[1], ARM_Z]}>
        <mesh geometry={FREE_ARM_GEOMETRY}>{body}</mesh>
        <mesh
          geometry={SPHERE}
          position={[FREE_ARM.to[0] - FREE_ARM.from[0], FREE_ARM.to[1] - FREE_ARM.from[1], 0]}
          scale={ARM_RADIUS * 1.3}
        >
          {body}
        </mesh>
      </group>

      {/* braço no manche e o manche */}
      <mesh geometry={STICK_ARM_GEOMETRY} position={[0, 0, ARM_Z]}>
        {body}
      </mesh>
      <mesh position={[JOYSTICK.base[0], JOYSTICK.base[1], ARM_Z]}>
        <cylinderGeometry args={[0.04, 0.04, JOYSTICK.height, 12]} />
        <meshStandardMaterial color={COLORS.stick} />
      </mesh>
      <mesh geometry={SPHERE} position={[JOYSTICK.knob[0], JOYSTICK.knob[1], ARM_Z]} scale={JOYSTICK.knobRadius}>
        <meshStandardMaterial color={COLORS.hat} />
      </mesh>

      {expression === 'thinking' &&
        THOUGHTS.map(([x, y, r], i) => (
          <mesh key={i} geometry={SPHERE} position={[x, y, 0.3]} scale={r}>
            <meshStandardMaterial color={COLORS.thought} />
          </mesh>
        ))}
    </group>
  )
}
```

- [ ] **Step B3: Montar o piloto e controles de expressão**

Substitua `src/components/three/octocat/OctocatShip.tsx` por:

```tsx
import type { OctocatExpression } from '@/lib/octocat/expression'
import { Pilot, type ArmMode } from './Pilot'
import { Ship } from './Ship'

export interface OctocatShipParts {
  ship: boolean
  pilot: boolean
  hat: boolean
}

export const ALL_PARTS: OctocatShipParts = { ship: true, pilot: true, hat: true }

interface OctocatShipProps {
  expression?: OctocatExpression
  armMode?: ArmMode
  thrusterLevel?: number
  parts?: OctocatShipParts
}

export function OctocatShip({ expression = 'neutral', armMode = 'rest', thrusterLevel = 0.3, parts = ALL_PARTS }: OctocatShipProps) {
  return (
    <group>
      {parts.ship && <Ship thrusterLevel={thrusterLevel} />}
      {parts.pilot && <Pilot expression={expression} blinking={false} armMode={armMode} />}
    </group>
  )
}
```

Em `src/preview/OctocatPreview.tsx`:
- importe `import { OCTOCAT_EXPRESSIONS, type OctocatExpression } from '@/lib/octocat/expression'`;
- acrescente `const [expression, setExpression] = useState<OctocatExpression>('neutral')`;
- passe `expression={expression}` ao `<OctocatShip … />`;
- acrescente ao `<aside>`, logo depois do `<fieldset>` de peças:

```tsx
        <fieldset className="space-y-1">
          <legend className="text-xs uppercase tracking-wider text-slate-400">Expressão</legend>
          <div className="flex flex-wrap gap-1">
            {OCTOCAT_EXPRESSIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setExpression(e)}
                className={`rounded-full border px-2 py-0.5 ${e === expression ? 'border-neon text-neon' : 'border-slate-600 text-slate-300'}`}
              >
                {EXPRESSION_LABELS[e]}
              </button>
            ))}
          </div>
        </fieldset>
```

e, acima do componente:

```tsx
const EXPRESSION_LABELS: Record<OctocatExpression, string> = {
  neutral: 'Neutro',
  happy: 'Feliz',
  wink: 'Piscadinha',
  surprised: 'Surpreso',
  thinking: 'Pensando',
}
```

- [ ] **Step B4: Verificar, commitar e PARAR**

Run: `pnpm test && pnpm typecheck && pnpm lint` → PASS. Confira com `curl` que o preview responde e derrube o servidor.

```bash
git add src/components/three/octocat src/preview
git commit -m "feat(octocat-3d): piloto com rosto e expressões"
```

**Pare aqui e reporte.** O que o usuário deve ver: corpo e cabeça escuros dentro da cúpula; rosto cor de pele com olhos, nariz, boca e bochechas como no SVG; braço livre levantado à esquerda; braço no manche à direita com bola laranja; os 5 botões de expressão trocam o rosto (Pensando mostra as 3 bolhas cinza).

#### Parte C — gorro-Clawd

- [ ] **Step C1: O gorro**

`src/components/three/octocat/ClawdHat.tsx`:

```tsx
import { HAT_BLOCKS, HAT_EYE_BLOCKS } from '@/lib/ship/geometry'

const BLOCKS = [...HAT_BLOCKS, ...HAT_EYE_BLOCKS]

export function ClawdHat() {
  return (
    <group>
      {BLOCKS.map((block, i) => (
        <mesh key={i} position={block.position}>
          <boxGeometry args={block.size} />
          <meshStandardMaterial color={block.color} roughness={0.7} flatShading />
        </mesh>
      ))}
    </group>
  )
}
```

Em `src/components/three/octocat/OctocatShip.tsx`, importe `import { ClawdHat } from './ClawdHat'` e acrescente, depois da linha do `Pilot`:

```tsx
      {parts.hat && <ClawdHat />}
```

- [ ] **Step C2: Verificar, commitar e PARAR**

Run: `pnpm test && pnpm typecheck && pnpm lint` → PASS.

```bash
git add src/components/three/octocat
git commit -m "feat(octocat-3d): gorro-Clawd"
```

**Pare aqui e reporte.** O que o usuário deve ver: o gorro laranja em blocos (estilo pixel do Clawd) no alto da cabeça, com quatro "pernas" em cima, abas laterais, dois olhos pretos na frente e a aba marrom cobrindo a testa.

#### Parte D — animações

- [ ] **Step D1: Teste do movimento (falha)**

`src/lib/ship/motion.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BLINK_EVERY, hoverOffset, isBlinking, thrusterScale, WAVE_AMPLITUDE, waveAngle } from './motion'

const times = Array.from({ length: 400 }, (_, i) => i * 0.037)

describe('movimento do Octocat', () => {
  it('flutua pouco', () => {
    for (const t of times) {
      const { y, roll } = hoverOffset(t)
      expect(Math.abs(y)).toBeLessThanOrEqual(0.06)
      expect(Math.abs(roll)).toBeLessThanOrEqual(0.03)
    }
  })

  it('o aceno fica dentro da amplitude', () => {
    for (const t of times) expect(Math.abs(waveAngle(t))).toBeLessThanOrEqual(WAVE_AMPLITUDE)
  })

  it('o propulsor apaga no nível 0 e tremula em volta do nível', () => {
    expect(thrusterScale(1.23, 0)).toBe(0)
    for (const t of times) {
      const s = thrusterScale(t, 1)
      expect(s).toBeGreaterThan(0.75)
      expect(s).toBeLessThan(1.25)
    }
  })

  it('pisca por um instante a cada BLINK_EVERY segundos', () => {
    expect(isBlinking(0.1)).toBe(true)
    expect(isBlinking(1)).toBe(false)
    expect(isBlinking(BLINK_EVERY + 0.05)).toBe(true)
    expect(times.filter(isBlinking).length / times.length).toBeLessThan(0.1)
  })
})
```

Run: `pnpm test src/lib/ship/motion.test.ts`
Expected: FAIL.

- [ ] **Step D2: Funções de movimento**

`src/lib/ship/motion.ts`:

```ts
/** Flutuação suave do Octocat parado. */
export function hoverOffset(t: number): { y: number; roll: number } {
  return { y: Math.sin(t * 1.6) * 0.06, roll: Math.sin(t * 0.9) * 0.03 }
}

export const WAVE_AMPLITUDE = 0.45
/** Ângulo do braço livre acenando (rad, em torno do ombro). */
export function waveAngle(t: number): number {
  return WAVE_AMPLITUDE * Math.sin(t * 7)
}

/** Braço livre esticado para o lado, apontando (rad). */
export const POINT_ANGLE = 0.9

/** Comprimento relativo da chama: 0 apaga; senão tremula ±23% em volta do nível. */
export function thrusterScale(t: number, level: number): number {
  if (level <= 0) return 0
  return level * (1 + 0.15 * Math.sin(t * 31) + 0.08 * Math.sin(t * 53))
}

export const BLINK_EVERY = 4
export const BLINK_LENGTH = 0.15
export function isBlinking(t: number): boolean {
  return t % BLINK_EVERY < BLINK_LENGTH
}
```

Run: `pnpm test src/lib/ship/motion.test.ts`
Expected: PASS.

- [ ] **Step D3: Animar braço, chama, piscada e flutuação**

Em `src/components/three/octocat/Pilot.tsx`:
- importe `useFrame` de `@react-three/fiber`, `useReducedMotion` de `framer-motion` e `POINT_ANGLE, waveAngle` de `@/lib/ship/motion`;
- troque a assinatura para `export function Pilot({ expression, blinking, armMode }: PilotProps) {`;
- acrescente, logo depois de `const freeArm = useRef<THREE.Group>(null)`:

```tsx
  const reduced = useReducedMotion() ?? false

  useFrame(({ clock }, dt) => {
    const arm = freeArm.current
    if (!arm) return
    const goal = armMode === 'point' ? POINT_ANGLE : 0
    if (armMode === 'wave' && !reduced) arm.rotation.z = waveAngle(clock.elapsedTime)
    else arm.rotation.z += (goal - arm.rotation.z) * (1 - Math.exp(-8 * dt))
  })
```

Em `src/components/three/octocat/Ship.tsx`:
- importe `useFrame` de `@react-three/fiber`, `useReducedMotion` de `framer-motion` e `thrusterScale` de `@/lib/ship/motion`;
- acrescente, logo depois de `const flame = useRef<THREE.Mesh>(null)`:

```tsx
  const glow = useRef<THREE.PointLight>(null)
  const reduced = useReducedMotion() ?? false

  useFrame(({ clock }) => {
    const s = reduced ? thrusterLevel : thrusterScale(clock.elapsedTime, thrusterLevel)
    if (flame.current) {
      flame.current.scale.set(1, Math.max(s, 0.001), 1)
      flame.current.visible = s > 0.01
    }
    if (glow.current) glow.current.intensity = 3 * s
  })
```

- acrescente, logo depois do `<mesh ref={flame} …>…</mesh>` do propulsor:

```tsx
      <pointLight ref={glow} position={[0, 0, -HULL.rz - 0.3]} color={COLORS.thruster} distance={3} intensity={0} />
```

Substitua `src/components/three/octocat/OctocatShip.tsx` pela versão final:

```tsx
import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import type * as THREE from 'three'
import type { OctocatExpression } from '@/lib/octocat/expression'
import { hoverOffset, isBlinking } from '@/lib/ship/motion'
import { ClawdHat } from './ClawdHat'
import { Pilot, type ArmMode } from './Pilot'
import { Ship } from './Ship'

export type { ArmMode }

export interface OctocatShipParts {
  ship: boolean
  pilot: boolean
  hat: boolean
}

export const ALL_PARTS: OctocatShipParts = { ship: true, pilot: true, hat: true }

interface OctocatShipProps {
  expression?: OctocatExpression
  armMode?: ArmMode
  thrusterLevel?: number
  floating?: boolean
  parts?: OctocatShipParts
}

export function OctocatShip({
  expression = 'neutral',
  armMode = 'rest',
  thrusterLevel = 0.3,
  floating = true,
  parts = ALL_PARTS,
}: OctocatShipProps) {
  const root = useRef<THREE.Group>(null)
  const blinkRef = useRef(false)
  const [blinking, setBlinking] = useState(false)
  const reduced = useReducedMotion() ?? false

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const blink = !reduced && isBlinking(t)
    if (blink !== blinkRef.current) {
      blinkRef.current = blink
      setBlinking(blink)
    }
    if (root.current) {
      const hover = floating && !reduced ? hoverOffset(t) : { y: 0, roll: 0 }
      root.current.position.y = hover.y
      root.current.rotation.z = hover.roll
    }
  })

  return (
    <group ref={root}>
      {parts.ship && <Ship thrusterLevel={thrusterLevel} />}
      {parts.pilot && <Pilot expression={expression} blinking={blinking} armMode={armMode} />}
      {parts.hat && <ClawdHat />}
    </group>
  )
}
```

Em `src/preview/OctocatPreview.tsx`:
- importe `type ArmMode` junto de `OctocatShip`;
- acrescente `const [armMode, setArmMode] = useState<ArmMode>('wave')` e `const [floating, setFloating] = useState(true)`;
- passe `armMode={armMode}` e `floating={floating}` ao `<OctocatShip … />`;
- acrescente ao `<aside>`, depois do `<fieldset>` de expressão:

```tsx
        <fieldset className="space-y-1">
          <legend className="text-xs uppercase tracking-wider text-slate-400">Braço</legend>
          <div className="flex gap-1">
            {ARM_LABELS.map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setArmMode(mode)}
                className={`rounded-full border px-2 py-0.5 ${mode === armMode ? 'border-neon text-neon' : 'border-slate-600 text-slate-300'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={floating} onChange={(e) => setFloating(e.target.checked)} />
          Flutuar
        </label>
```

e, acima do componente:

```tsx
const ARM_LABELS: [ArmMode, string][] = [
  ['rest', 'Parado'],
  ['wave', 'Acenar'],
  ['point', 'Apontar'],
]
```

- [ ] **Step D4: Verificar, commitar e PARAR**

Run: `pnpm test && pnpm typecheck && pnpm lint` → PASS.

```bash
git add src/lib/ship src/components/three/octocat src/preview
git commit -m "feat(octocat-3d): aceno, piscada, flutuação e propulsor"
```

**Pare aqui e reporte.** O que o usuário deve ver: o Octocat acena (vai e volta em torno do ombro), "Apontar" estica o braço para o lado, ele pisca a cada 4 s no rosto neutro, a nave flutua de leve, e a chama tremula conforme o nível do propulsor. Com "Reduzir movimento" no sistema, nada oscila.

---

### Task 13: Octocat 3D — escolta, viagem com câmera de perseguição e falas

> Roda depois da Task 11. Usa o modelo aprovado na Task 12.

**Files:**
- Create: `src/lib/ship/vec.ts`, `src/lib/ship/travel.ts`, `src/lib/ship/escort.ts`, `src/lib/ship/shipMachine.ts`, `src/store/shipPose.ts`, `src/components/three/octocat/ShipRig.tsx`, `src/hooks/useIdle.ts`, `src/components/ui/OctocatSpeech.tsx`, `src/components/ui/TutorialButton.tsx`, `src/components/ui/octocat/OctocatArt.tsx`
- Modify: `src/components/three/CameraRig.tsx`, `src/components/three/Scene.tsx`, `src/components/ui/Loader.tsx`, `src/App.tsx`
- Test: `src/lib/ship/travel.test.ts`, `src/lib/ship/escort.test.ts`, `src/lib/ship/shipMachine.test.ts`

**Interfaces:**
- Consumes: `OctocatShip`, `ArmMode` (Task 12); `SUN_RADIUS`, `planetPosition`, `OrbitSystem`, `Vec3` (Task 5); `predictStopTime` (Task 5); `simClock` (Task 8); `selectionPose`, `tutorialPose`, `showcasePlanet`, `maxCameraDistance`, `Pose` (Tasks 9 e 11); `useUniverse` (bubble, emitGuide, dismissBubble), `formatLine`, `LINE_DURATION_MS`, `IDLE_MS`, `LONG_IDLE_MS` (Task 7); `useTutorial` (Task 11); `useMediaQuery`, `MOBILE_QUERY` (Task 7).
- Produces:
  - `vec.ts`: `add`, `sub`, `scale`, `dot`, `cross`, `length`, `normalize`, `lerp3`.
  - `travel.ts`: `SUN_SAFE_DISTANCE`, `MIN_TRAVEL_SECONDS`, `MAX_TRAVEL_SECONDS`, `TravelPath`, `travelDuration(d)`, `bezierPoint(points, s)`, `bezierTangent(points, s)`, `minSunDistance(points)`, `planTravel(from, to)`, `easeInOutCubic(x)`, `travelProgress(elapsed, duration)`.
  - `escort.ts`: `ShipTarget`, `targetAnchor(target, system, time)`, `visitPosition(anchor, radius, cameraPos)`, `escortPosition(cameraPos, forward, up)`, `chasePose(position, tangent)`, `MAX_BANK`, `bankAngle(prev, next, dt)`.
  - `shipMachine.ts`: `ShipMode`, `ShipState`, `ShipEvent`, `ENTER_DURATION`, `RETURN_DURATION`, `INITIAL_SHIP`, `shipReducer(s, e)`.
  - `shipPose`: estado mutável `{ position, tangent, mode, userTravel }` lido pela câmera.
  - Componentes: `ShipRig({ system, repos })`, `OctocatSpeech({ profileName })`, `TutorialButton()`, `OctocatArt` (SVG 2D, só no loader).

- [ ] **Step 1: Vetores**

`src/lib/ship/vec.ts`:

```ts
import type { Vec3 } from '../universe/orbits'

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t))

export function normalize(a: Vec3, fallback: Vec3 = [0, 0, 1]): Vec3 {
  const l = length(a)
  return l < 1e-9 ? fallback : scale(a, 1 / l)
}
```

- [ ] **Step 2: Teste da viagem (falha)**

`src/lib/ship/travel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../universe/orbits'
import {
  bezierPoint,
  bezierTangent,
  MAX_TRAVEL_SECONDS,
  MIN_TRAVEL_SECONDS,
  minSunDistance,
  planTravel,
  SUN_SAFE_DISTANCE,
  travelDuration,
  travelProgress,
} from './travel'
import { length, sub } from './vec'

const ring = (r: number, angle: number, y = 0): Vec3 => [Math.cos(angle) * r, y, Math.sin(angle) * r]

describe('planTravel', () => {
  it('começa e termina nos pontos dados', () => {
    const from = ring(10, 0)
    const to = ring(20, 2)
    const path = planTravel(from, to)
    expect(length(sub(bezierPoint(path.points, 0), from))).toBeLessThan(1e-9)
    expect(length(sub(bezierPoint(path.points, 1), to))).toBeLessThan(1e-9)
  })

  it('nunca passa perto do sol, nem entre lados opostos da galáxia', () => {
    const cases: [Vec3, Vec3][] = [
      [ring(8, 0), ring(8, Math.PI)],
      [ring(6, 0.3, 0.5), ring(40, 0.3 + Math.PI)],
      [ring(5, 1), ring(5, 1 + Math.PI)],
      [[0, 30, 60], ring(9, 4)],
      [ring(12, 2), ring(12, 2.1)],
    ]
    for (const [from, to] of cases) expect(minSunDistance(planTravel(from, to).points)).toBeGreaterThanOrEqual(SUN_SAFE_DISTANCE)
  })

  it('o arco sobe acima do plano das órbitas', () => {
    const path = planTravel(ring(10, 0), ring(10, 1.5))
    expect(bezierPoint(path.points, 0.5)[1]).toBeGreaterThan(1)
  })
})

describe('tempo de viagem', () => {
  it('cresce com a distância e fica entre 1,5 e 3 s', () => {
    expect(travelDuration(0)).toBe(MIN_TRAVEL_SECONDS)
    expect(travelDuration(30)).toBeGreaterThan(travelDuration(10))
    expect(travelDuration(1000)).toBe(MAX_TRAVEL_SECONDS)
  })

  it('progresso suave de 0 a 1, travado nas pontas', () => {
    expect(travelProgress(0, 2)).toBe(0)
    expect(travelProgress(1, 2)).toBeCloseTo(0.5)
    expect(travelProgress(5, 2)).toBe(1)
    expect(travelProgress(0.2, 2)).toBeLessThan(0.1)
  })
})

describe('tangente', () => {
  it('é unitária e aponta para o destino no fim', () => {
    const path = planTravel(ring(10, 0), ring(10, 1.5))
    const t = bezierTangent(path.points, 1)
    expect(length(t)).toBeCloseTo(1)
    const toEnd = sub(path.points[3], path.points[2])
    expect(t[0] * toEnd[0] + t[1] * toEnd[1] + t[2] * toEnd[2]).toBeGreaterThan(0)
  })
})
```

Run: `pnpm test src/lib/ship/travel.test.ts`
Expected: FAIL.

- [ ] **Step 3: Viagem**

`src/lib/ship/travel.ts`:

```ts
import { SUN_RADIUS, type Vec3 } from '../universe/orbits'
import { add, length, lerp3, normalize, scale, sub } from './vec'

export const SUN_SAFE_DISTANCE = SUN_RADIUS + 2
export const MIN_TRAVEL_SECONDS = 1.5
export const MAX_TRAVEL_SECONDS = 3

export interface TravelPath {
  /** Bézier cúbica: origem, dois controles erguidos, destino. */
  points: [Vec3, Vec3, Vec3, Vec3]
  duration: number
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function travelDuration(distance: number): number {
  return clamp(MIN_TRAVEL_SECONDS + distance / 40, MIN_TRAVEL_SECONDS, MAX_TRAVEL_SECONDS)
}

export function bezierPoint(p: TravelPath['points'], s: number): Vec3 {
  const u = 1 - s
  return add(add(scale(p[0], u * u * u), scale(p[1], 3 * u * u * s)), add(scale(p[2], 3 * u * s * s), scale(p[3], s * s * s)))
}

export function bezierTangent(p: TravelPath['points'], s: number): Vec3 {
  const u = 1 - s
  const d = add(add(scale(sub(p[1], p[0]), 3 * u * u), scale(sub(p[2], p[1]), 6 * u * s)), scale(sub(p[3], p[2]), 3 * s * s))
  return normalize(d, normalize(sub(p[3], p[0])))
}

export function minSunDistance(p: TravelPath['points'], samples = 96): number {
  let min = Infinity
  for (let i = 0; i <= samples; i++) min = Math.min(min, length(bezierPoint(p, i / samples)))
  return min
}

function arc(from: Vec3, to: Vec3, lift: number): TravelPath['points'] {
  const up: Vec3 = [0, lift, 0]
  return [from, add(lerp3(from, to, 1 / 3), up), add(lerp3(from, to, 2 / 3), up), to]
}

/** Arco acima do plano das órbitas; sobe mais até a curva ficar longe do sol. */
export function planTravel(from: Vec3, to: Vec3): TravelPath {
  const distance = length(sub(to, from))
  let lift = Math.max(3, distance * 0.35)
  let points = arc(from, to, lift)
  for (let i = 0; i < 16 && minSunDistance(points) < SUN_SAFE_DISTANCE; i++) {
    lift *= 1.5
    points = arc(from, to, lift)
  }
  return { points, duration: travelDuration(distance) }
}

export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

export function travelProgress(elapsed: number, duration: number): number {
  return easeInOutCubic(clamp(elapsed / duration, 0, 1))
}
```

Run: `pnpm test src/lib/ship/travel.test.ts`
Expected: PASS.

- [ ] **Step 4: Teste de escolta, visita e perseguição (falha)**

`src/lib/ship/escort.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildOrbits, planetPosition, SUN_RADIUS, type Vec3 } from '../universe/orbits'
import { bankAngle, chasePose, escortPosition, MAX_BANK, targetAnchor, visitPosition } from './escort'
import { SUN_SAFE_DISTANCE } from './travel'
import { cross, dot, length, sub } from './vec'

const system = buildOrbits(Array.from({ length: 12 }, (_, i) => ({ name: `p${i}`, radius: 2.2 })))

describe('targetAnchor', () => {
  it('sol na origem com o raio do sol; planeta na posição do instante', () => {
    expect(targetAnchor({ kind: 'sun' }, system, 0)).toEqual({ position: [0, 0, 0], radius: SUN_RADIUS })
    const orbit = system.orbits[5]
    expect(targetAnchor({ kind: 'planet', name: 'p5' }, system, 12)).toEqual({
      position: planetPosition(system.rings[orbit.ring], orbit, 12),
      radius: orbit.radius,
    })
    expect(targetAnchor({ kind: 'planet', name: 'nada' }, system, 0)).toBeNull()
  })
})

describe('visitPosition', () => {
  it('fica ao lado do alvo, do lado da câmera, e longe do sol', () => {
    const cameraPositions: Vec3[] = [[0, 20, 40], [0, 2, 0.1], [30, 5, -30]]
    for (const cam of cameraPositions) {
      for (const orbit of system.orbits) {
        const anchor = targetAnchor({ kind: 'planet', name: orbit.name }, system, 3)!
        const visit = visitPosition(anchor.position, anchor.radius, cam)
        expect(length(sub(visit, anchor.position))).toBeGreaterThan(anchor.radius)
        expect(length(visit)).toBeGreaterThanOrEqual(SUN_SAFE_DISTANCE)
      }
      expect(length(visitPosition([0, 0, 0], SUN_RADIUS, cam))).toBeGreaterThanOrEqual(SUN_SAFE_DISTANCE)
    }
  })
})

describe('escortPosition', () => {
  it('fica à frente, à direita e abaixo do centro da câmera', () => {
    const cam: Vec3 = [0, 10, 30]
    const forward: Vec3 = [0, 0, -1]
    const up: Vec3 = [0, 1, 0]
    const offset = sub(escortPosition(cam, forward, up), cam)
    expect(dot(offset, forward)).toBeGreaterThan(0)
    expect(dot(offset, cross(forward, up))).toBeGreaterThan(0)
    expect(dot(offset, up)).toBeLessThan(0)
  })
})

describe('chasePose', () => {
  it('câmera atrás e acima da nave, olhando para a frente dela', () => {
    const position: Vec3 = [5, 2, 5]
    const tangent: Vec3 = [1, 0, 0]
    const pose = chasePose(position, tangent)
    expect(dot(sub(pose.position, position), tangent)).toBeLessThan(0)
    expect(pose.position[1]).toBeGreaterThan(position[1])
    expect(dot(sub(pose.target, position), tangent)).toBeGreaterThan(0)
  })
})

describe('bankAngle', () => {
  it('inclina para dentro da curva, com limite', () => {
    const straight: Vec3 = [0, 0, 1]
    const left: Vec3 = [Math.sin(0.05), 0, Math.cos(0.05)]
    expect(bankAngle(straight, straight, 1 / 60)).toBe(0)
    expect(Math.sign(bankAngle(straight, left, 1 / 60))).not.toBe(0)
    expect(Math.abs(bankAngle(straight, [1, 0, 0], 1 / 60))).toBe(MAX_BANK)
    expect(bankAngle(straight, left, 0)).toBe(0)
  })
})
```

Run: `pnpm test src/lib/ship/escort.test.ts`
Expected: FAIL.

- [ ] **Step 5: Escolta, visita e perseguição**

`src/lib/ship/escort.ts`:

```ts
import type { Pose } from '../cameraPoses'
import { planetPosition, SUN_RADIUS, type OrbitSystem, type Vec3 } from '../universe/orbits'
import { SUN_SAFE_DISTANCE } from './travel'
import { add, cross, length, normalize, scale, sub } from './vec'

export type ShipTarget = { kind: 'sun' } | { kind: 'planet'; name: string }

export function targetAnchor(target: ShipTarget, system: OrbitSystem, time: number): { position: Vec3; radius: number } | null {
  if (target.kind === 'sun') return { position: [0, 0, 0], radius: SUN_RADIUS }
  const orbit = system.orbits.find((o) => o.name === target.name)
  if (!orbit) return null
  return { position: planetPosition(system.rings[orbit.ring], orbit, time), radius: orbit.radius }
}

/** Ao lado do alvo, do lado da câmera e um pouco acima; nunca perto demais do sol. */
export function visitPosition(anchor: Vec3, radius: number, cameraPos: Vec3): Vec3 {
  const toCamera = normalize(sub(cameraPos, anchor))
  const side = normalize(cross([0, 1, 0], toCamera), [1, 0, 0])
  let pos = add(add(anchor, scale(toCamera, radius + 1.6)), add(scale(side, -(radius + 0.8)), [0, radius * 0.5 + 0.4, 0]))
  const d = length(pos)
  if (d < SUN_SAFE_DISTANCE + 0.5) pos = scale(normalize(pos, [0, 1, 0]), SUN_SAFE_DISTANCE + 0.5)
  return pos
}

/** Canto inferior direito da visão, 4,5 unidades à frente da câmera. */
export function escortPosition(cameraPos: Vec3, forward: Vec3, up: Vec3): Vec3 {
  const right = normalize(cross(forward, up), [1, 0, 0])
  return add(cameraPos, add(add(scale(forward, 4.5), scale(right, 1.6)), scale(up, -0.9)))
}

/** Câmera de perseguição: atrás e acima da nave, olhando um pouco à frente dela. */
export function chasePose(position: Vec3, tangent: Vec3): Pose {
  return {
    position: add(add(position, scale(tangent, -6)), [0, 2.2, 0]),
    target: add(position, scale(tangent, 2)),
  }
}

export const MAX_BANK = 0.6

/** Inclinação lateral proporcional à velocidade de curva (rad), limitada a ±MAX_BANK. */
export function bankAngle(prev: Vec3, next: Vec3, dt: number): number {
  if (dt <= 0) return 0
  const turn = Math.atan2(prev[2] * next[0] - prev[0] * next[2], prev[0] * next[0] + prev[2] * next[2])
  if (turn === 0) return 0
  return Math.max(-MAX_BANK, Math.min(MAX_BANK, -0.25 * (turn / dt)))
}
```

Run: `pnpm test src/lib/ship/escort.test.ts`
Expected: PASS.

- [ ] **Step 6: Máquina de estados da nave (teste, falha)**

`src/lib/ship/shipMachine.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ENTER_DURATION, INITIAL_SHIP, RETURN_DURATION, shipReducer, type ShipEvent, type ShipState } from './shipMachine'
import { planTravel } from './travel'

const apply = (s: ShipState, ...events: ShipEvent[]) => events.reduce(shipReducer, s)
const path = planTravel([10, 0, 0], [-10, 0, 5])
const sun = { kind: 'sun' } as const

describe('shipReducer', () => {
  it('entrada vira escolta depois de ENTER_DURATION', () => {
    expect(apply(INITIAL_SHIP, { type: 'tick', dt: ENTER_DURATION - 0.1 }).mode).toBe('entering')
    expect(apply(INITIAL_SHIP, { type: 'tick', dt: ENTER_DURATION }).mode).toBe('escort')
  })

  it('viagem termina em visita no tempo do trajeto', () => {
    const traveling = apply(INITIAL_SHIP, { type: 'travel', path, target: sun })
    expect(traveling).toMatchObject({ mode: 'traveling', elapsed: 0, target: sun })
    expect(apply(traveling, { type: 'tick', dt: path.duration / 2 }).mode).toBe('traveling')
    expect(apply(traveling, { type: 'tick', dt: path.duration }).mode).toBe('visiting')
  })

  it('soltar volta para a escolta', () => {
    const visiting = apply(INITIAL_SHIP, { type: 'arrive', target: sun })
    const returning = apply(visiting, { type: 'release' })
    expect(returning).toMatchObject({ mode: 'returning', target: null })
    expect(apply(returning, { type: 'tick', dt: RETURN_DURATION }).mode).toBe('escort')
  })

  it('soltar na escolta não muda nada', () => {
    const escort = apply(INITIAL_SHIP, { type: 'tick', dt: ENTER_DURATION })
    expect(shipReducer(escort, { type: 'release' })).toBe(escort)
  })

  it('nova viagem durante uma viagem recomeça do zero', () => {
    const first = apply(INITIAL_SHIP, { type: 'travel', path, target: sun }, { type: 'tick', dt: 0.5 })
    expect(apply(first, { type: 'travel', path, target: { kind: 'planet', name: 'a' } })).toMatchObject({
      mode: 'traveling',
      elapsed: 0,
      target: { kind: 'planet', name: 'a' },
    })
  })
})
```

Run: `pnpm test src/lib/ship/shipMachine.test.ts`
Expected: FAIL.

- [ ] **Step 7: Máquina de estados da nave**

`src/lib/ship/shipMachine.ts`:

```ts
import type { ShipTarget } from './escort'
import type { TravelPath } from './travel'

export type ShipMode = 'entering' | 'escort' | 'traveling' | 'visiting' | 'returning'

export interface ShipState {
  mode: ShipMode
  elapsed: number
  path: TravelPath | null
  target: ShipTarget | null
}

export type ShipEvent =
  | { type: 'tick'; dt: number }
  | { type: 'travel'; path: TravelPath; target: ShipTarget }
  /** Chegada instantânea (movimento reduzido). */
  | { type: 'arrive'; target: ShipTarget }
  | { type: 'release' }

export const ENTER_DURATION = 2
export const RETURN_DURATION = 1.2
export const INITIAL_SHIP: ShipState = { mode: 'entering', elapsed: 0, path: null, target: null }

export function shipReducer(s: ShipState, e: ShipEvent): ShipState {
  switch (e.type) {
    case 'travel':
      return { mode: 'traveling', elapsed: 0, path: e.path, target: e.target }
    case 'arrive':
      return { mode: 'visiting', elapsed: 0, path: null, target: e.target }
    case 'release':
      return s.mode === 'traveling' || s.mode === 'visiting' ? { mode: 'returning', elapsed: 0, path: null, target: null } : s
    case 'tick': {
      const elapsed = s.elapsed + e.dt
      if (s.mode === 'entering' && elapsed >= ENTER_DURATION) return { ...s, mode: 'escort', elapsed: 0 }
      if (s.mode === 'traveling' && s.path && elapsed >= s.path.duration) return { ...s, mode: 'visiting', elapsed: 0, path: null }
      if (s.mode === 'returning' && elapsed >= RETURN_DURATION) return { ...s, mode: 'escort', elapsed: 0 }
      return { ...s, elapsed }
    }
  }
}
```

Run: `pnpm test src/lib/ship`
Expected: PASS.

- [ ] **Step 8: Estado compartilhado e a nave na cena**

`src/store/shipPose.ts`:

```ts
import type { ShipMode } from '@/lib/ship/shipMachine'
import type { Vec3 } from '@/lib/universe/orbits'

/** Mutável de propósito: escrito pela nave a cada frame, lido pela câmera. */
export const shipPose: { position: Vec3; tangent: Vec3; mode: ShipMode; userTravel: boolean } = {
  position: [0, 0, 0],
  tangent: [0, 0, 1],
  mode: 'entering',
  userTravel: false,
}
```

`src/components/three/octocat/ShipRig.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, Trail, useCursor } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import { showcasePlanet } from '@/lib/cameraPoses'
import { selectedPlanet } from '@/lib/interaction'
import type { OctocatExpression } from '@/lib/octocat/expression'
import { formatLine } from '@/lib/octocat/lines'
import { bankAngle, escortPosition, targetAnchor, visitPosition, type ShipTarget } from '@/lib/ship/escort'
import { ENTER_DURATION, INITIAL_SHIP, RETURN_DURATION, shipReducer, type ShipMode, type ShipState } from '@/lib/ship/shipMachine'
import { bezierPoint, bezierTangent, planTravel, travelProgress } from '@/lib/ship/travel'
import type { Repo } from '@/lib/types'
import { predictStopTime } from '@/lib/universe/clock'
import type { OrbitSystem, Vec3 } from '@/lib/universe/orbits'
import { shipPose } from '@/store/shipPose'
import { simClock } from '@/store/simClock'
import { useTutorial } from '@/store/tutorial'
import { useUniverse } from '@/store/universe'
import { OctocatShip, type ArmMode } from './OctocatShip'

const SHIP_SCALE = 0.28

export function ShipRig({ system, repos, profileName }: { system: OrbitSystem; repos: Repo[]; profileName: string }) {
  const group = useRef<THREE.Group>(null)
  const machine = useRef<ShipState>(INITIAL_SHIP)
  const lastTangent = useRef<Vec3>([0, 0, 1])
  const [mode, setMode] = useState<ShipMode>('entering')
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  const camera = useThree((s) => s.camera)
  const reduced = useReducedMotion() ?? false
  const selection = useUniverse((s) => s.selection)
  const bubble = useUniverse((s) => s.bubble)
  const step = useTutorial((s) => s.step)
  const startTutorial = useTutorial((s) => s.start)

  const forward = useMemo(() => new THREE.Vector3(), [])
  const up = useMemo(() => new THREE.Vector3(), [])
  const look = useMemo(() => new THREE.Vector3(), [])
  const targetQuat = useMemo(() => new THREE.Quaternion(), [])
  const helper = useMemo(() => new THREE.Object3D(), [])

  const target: ShipTarget | null = useMemo(() => {
    if (step === 'welcome') return { kind: 'sun' }
    if (step === 'tech') {
      const name = showcasePlanet(repos)
      return name ? { kind: 'planet', name } : null
    }
    if (step === 'repos') return null
    if (selection.kind === 'profile') return { kind: 'sun' }
    const name = selectedPlanet(selection)
    return name ? { kind: 'planet', name } : null
  }, [selection, step, repos])

  // Destino mudou: planeja a viagem até onde o alvo vai estar quando o tempo parar.
  useEffect(() => {
    if (!target) {
      machine.current = shipReducer(machine.current, { type: 'release' })
      shipPose.userTravel = false
      return
    }
    // Mesmo alvo (ex.: clicar numa lua do planeta já visitado): a nave fica onde está.
    const current = machine.current.target
    const sameTarget =
      current !== null &&
      current.kind === target.kind &&
      (current.kind === 'sun' || (target.kind === 'planet' && current.name === target.name))
    if (sameTarget && (machine.current.mode === 'traveling' || machine.current.mode === 'visiting')) return
    const anchor = targetAnchor(target, system, predictStopTime(simClock))
    if (!anchor) return
    const destination = visitPosition(anchor.position, anchor.radius, camera.position.toArray() as Vec3)
    shipPose.userTravel = step === null || step === 'free'
    if (reduced) {
      machine.current = shipReducer(machine.current, { type: 'arrive', target })
      group.current?.position.set(...destination)
      return
    }
    machine.current = shipReducer(machine.current, { type: 'travel', target, path: planTravel(shipPose.position, destination) })
  }, [target, system, camera, reduced, step])

  useFrame((_, rawDt) => {
    const g = group.current
    if (!g) return
    const dt = Math.min(rawDt, 0.1)
    const s = shipReducer(machine.current, { type: 'tick', dt })
    if (s.mode !== machine.current.mode) setMode(s.mode)
    machine.current = s

    camera.getWorldDirection(forward)
    up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    const escort = escortPosition(camera.position.toArray() as Vec3, forward.toArray() as Vec3, up.toArray() as Vec3)
    let tangent: Vec3 | null = null

    if (s.mode === 'traveling' && s.path) {
      const p = travelProgress(s.elapsed, s.path.duration)
      g.position.set(...bezierPoint(s.path.points, p))
      tangent = bezierTangent(s.path.points, p)
    } else if (s.mode === 'entering' && !reduced) {
      const k = Math.min(1, s.elapsed / ENTER_DURATION)
      const drop = (1 - k) ** 2 * 6
      g.position.set(escort[0], escort[1] + drop, escort[2])
    } else {
      let goal = escort
      if (s.mode === 'visiting' && s.target) {
        const anchor = targetAnchor(s.target, system, simClock.time)
        if (anchor) goal = visitPosition(anchor.position, anchor.radius, camera.position.toArray() as Vec3)
      }
      const rate = s.mode === 'returning' ? 3 / RETURN_DURATION : 4
      look.set(...goal)
      g.position.lerp(look, reduced ? 1 : 1 - Math.exp(-rate * dt))
    }

    // Orientação: na viagem, olha para a frente e inclina nas curvas; parada, vira para a câmera.
    if (tangent) {
      helper.position.copy(g.position)
      helper.lookAt(look.set(...tangent).add(g.position))
      helper.rotateZ(bankAngle(lastTangent.current, tangent, dt))
      targetQuat.copy(helper.quaternion)
      lastTangent.current = tangent
    } else {
      helper.position.copy(g.position)
      helper.lookAt(camera.position)
      targetQuat.copy(helper.quaternion)
    }
    g.quaternion.slerp(targetQuat, reduced ? 1 : 1 - Math.exp(-6 * dt))

    shipPose.position = g.position.toArray() as Vec3
    shipPose.tangent = tangent ?? shipPose.tangent
    shipPose.mode = s.mode
  })

  const expression: OctocatExpression = hovered ? 'wink' : (bubble?.line.expression ?? (mode === 'traveling' ? 'happy' : 'neutral'))
  const armMode: ArmMode = hovered || mode === 'entering' ? 'wave' : mode === 'visiting' ? 'point' : 'rest'
  const thrusterLevel = mode === 'traveling' ? 1 : mode === 'entering' ? 0.8 : 0.25

  return (
    <group
      ref={group}
      scale={SHIP_SCALE}
      onClick={(e) => {
        e.stopPropagation()
        startTutorial()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      <OctocatShip expression={expression} armMode={armMode} thrusterLevel={thrusterLevel} floating={mode !== 'traveling'} />
      {!reduced && (
        <Trail width={3} length={6} color="#C4B5FD" attenuation={(w) => w * w}>
          <mesh position={[0, 0, -1.3]}>
            <sphereGeometry args={[0.01, 4, 2]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        </Trail>
      )}
      {bubble && (
        <Html position={[0, 3.4, 0]} center distanceFactor={12} zIndexRange={[30, 0]}>
          <p className="pointer-events-none w-max max-w-[220px] rounded-2xl border border-neon/30 bg-space/90 px-4 py-2 text-sm text-slate-100 shadow-lg">
            {formatLine(bubble.line.text, profileName)}
          </p>
        </Html>
      )}
    </group>
  )
}
```

- [ ] **Step 9: Câmera de perseguição**

Substitua `src/components/three/CameraRig.tsx` por:

```tsx
import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import { MOBILE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { maxCameraDistance, selectionPose, tutorialPose } from '@/lib/cameraPoses'
import { chasePose } from '@/lib/ship/escort'
import type { ShipMode } from '@/lib/ship/shipMachine'
import type { Repo } from '@/lib/types'
import { predictStopTime } from '@/lib/universe/clock'
import type { OrbitSystem } from '@/lib/universe/orbits'
import { shipPose } from '@/store/shipPose'
import { simClock } from '@/store/simClock'
import { useTutorial } from '@/store/tutorial'
import { useUniverse } from '@/store/universe'

export function CameraRig({ system, repos }: { system: OrbitSystem; repos: Repo[] }) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null)
  const lastShipMode = useRef<ShipMode>(shipPose.mode)
  const [chasing, setChasing] = useState(false)
  const selection = useUniverse((s) => s.selection)
  const step = useTutorial((s) => s.step)
  const layout = useMediaQuery(MOBILE_QUERY) ? 'bottom' : 'side'
  const reduced = useReducedMotion() ?? false
  const guided = step !== null && step !== 'free'
  const focusing = selection.kind !== 'none'

  useEffect(() => {
    const stop = predictStopTime(simClock)
    if (step !== null && step !== 'free') {
      const pose = tutorialPose(step, system, repos, stop, layout)
      void controls.current?.setLookAt(...pose.position, ...pose.target, true)
      return
    }
    // Com movimento normal, focar algo começa pela perseguição da nave; a pose final vem na chegada.
    if (focusing && !reduced) return
    const pose = selectionPose(selection, system, stop, layout)
    void controls.current?.setLookAt(...pose.position, ...pose.target, true)
  }, [selection, step, focusing, reduced, system, repos, layout])

  useFrame(() => {
    const mode = shipPose.mode
    const chase = mode === 'traveling' && shipPose.userTravel && !reduced
    if (chase !== chasing) setChasing(chase)
    if (chase) {
      const pose = chasePose(shipPose.position, shipPose.tangent)
      void controls.current?.setLookAt(...pose.position, ...pose.target, true)
    } else if (lastShipMode.current === 'traveling' && mode === 'visiting' && shipPose.userTravel) {
      const pose = selectionPose(useUniverse.getState().selection, system, simClock.time, layout)
      void controls.current?.setLookAt(...pose.position, ...pose.target, true)
    }
    lastShipMode.current = mode
  })

  return (
    <CameraControls
      ref={controls}
      makeDefault
      enabled={!guided && !chasing}
      minDistance={2}
      maxDistance={maxCameraDistance(system)}
      smoothTime={0.6}
      dollyToCursor={false}
    />
  )
}
```

Em `src/components/three/Scene.tsx`, importe `import { ShipRig } from './octocat/ShipRig'` e acrescente logo depois de `<CameraRig system={system} repos={universe.repos} />`:

```tsx
      <ShipRig system={system} repos={universe.repos} profileName={universe.profile.name} />
```

- [ ] **Step 10: Falas acessíveis, botão do tutorial e loader 2D**

`src/hooks/useIdle.ts`:

```ts
import { useEffect } from 'react'
import { IDLE_MS, LONG_IDLE_MS } from '@/lib/octocat/lines'

const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'] as const

export function useIdle(onIdle: (kind: 'idle' | 'longIdle') => void): void {
  useEffect(() => {
    let idle = 0
    let longIdle = 0
    const arm = () => {
      window.clearTimeout(idle)
      window.clearTimeout(longIdle)
      idle = window.setTimeout(() => onIdle('idle'), IDLE_MS)
      longIdle = window.setTimeout(() => onIdle('longIdle'), LONG_IDLE_MS)
    }
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, arm, { passive: true })
    arm()
    return () => {
      window.clearTimeout(idle)
      window.clearTimeout(longIdle)
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, arm)
    }
  }, [onIdle])
}
```

`src/components/ui/OctocatSpeech.tsx`:

```tsx
import { useEffect } from 'react'
import { useIdle } from '@/hooks/useIdle'
import { formatLine, LINE_DURATION_MS } from '@/lib/octocat/lines'
import { useUniverse } from '@/store/universe'

/** Controla a duração das falas e as espelha para leitores de tela; o balão visível fica preso à nave. */
export function OctocatSpeech({ profileName }: { profileName: string }) {
  const bubble = useUniverse((s) => s.bubble)
  const dismissBubble = useUniverse((s) => s.dismissBubble)
  const emitGuide = useUniverse((s) => s.emitGuide)

  useIdle(emitGuide)

  useEffect(() => {
    if (!bubble) return
    const timer = window.setTimeout(() => dismissBubble(bubble.seq), LINE_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [bubble, dismissBubble])

  return (
    <div aria-live="polite" className="sr-only">
      {bubble ? formatLine(bubble.line.text, profileName) : ''}
    </div>
  )
}
```

`src/components/ui/TutorialButton.tsx`:

```tsx
import { useTutorial } from '@/store/tutorial'

export function TutorialButton() {
  const start = useTutorial((s) => s.start)
  return (
    <button
      type="button"
      onClick={start}
      aria-label="Abrir tutorial com o Octocat"
      className="fixed bottom-4 right-4 z-30 rounded-full border border-neon/40 bg-space/80 px-3 py-1.5 text-xs text-neon backdrop-blur hover:bg-neon/10"
    >
      ? Tutorial
    </button>
  )
}
```

`src/components/ui/octocat/OctocatArt.tsx` (SVG 2D, usado só no loader):

```tsx
import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { OctocatExpression } from '@/lib/octocat/lines'

const SHIP = '#C4B5FD'
const BODY = '#1F2329'
const SKIN = '#F2C9A6'
const FACE = '#7A2F2F'
const BLUSH = '#F29C8A'
const HAT = '#D97757'

function Face({ expression, blinking }: { expression: OctocatExpression; blinking: boolean }) {
  switch (expression) {
    case 'happy':
      return (
        <g transform="translate(80 44)">
          <path d="M98 158 Q106 147 114 158 M126 158 Q134 147 142 158" stroke={FACE} strokeWidth={3.5} fill="none" strokeLinecap="round" />
          <path d="M106 174 Q120 192 134 174 Z" fill={FACE} />
          <ellipse cx="92" cy="172" rx="8" ry="4" fill={BLUSH} opacity={0.7} />
          <ellipse cx="148" cy="172" rx="8" ry="4" fill={BLUSH} opacity={0.7} />
        </g>
      )
    case 'wink':
      return (
        <g transform="translate(80 44)">
          <ellipse cx="106" cy="156" rx="6" ry="9" fill={FACE} />
          <path d="M127 158 Q134 151 141 158" stroke={FACE} strokeWidth={3.5} fill="none" strokeLinecap="round" />
          <path d="M109 177 Q120 188 131 177" stroke={FACE} strokeWidth={3} fill="none" strokeLinecap="round" />
        </g>
      )
    case 'surprised':
      return (
        <g transform="translate(80 44)">
          <ellipse cx="105" cy="154" rx="8" ry="12" fill={FACE} />
          <ellipse cx="135" cy="154" rx="8" ry="12" fill={FACE} />
          <circle cx="102" cy="149" r="2.5" fill="#FFFFFF" />
          <circle cx="132" cy="149" r="2.5" fill="#FFFFFF" />
          <ellipse cx="120" cy="182" rx="6" ry="8" fill={FACE} />
        </g>
      )
    case 'thinking':
      return (
        <g transform="translate(80 44)">
          <circle cx="196" cy="70" r="5" fill="#9AA3B8" />
          <circle cx="212" cy="52" r="7" fill="#9AA3B8" />
          <circle cx="230" cy="30" r="9" fill="#9AA3B8" />
          <ellipse cx="110" cy="151" rx="6" ry="9" fill={FACE} />
          <ellipse cx="138" cy="151" rx="6" ry="9" fill={FACE} />
          <path d="M112 180 L130 177" stroke={FACE} strokeWidth={3} fill="none" strokeLinecap="round" />
        </g>
      )
    default:
      return (
        <g>
          {blinking ? (
            <path d="M180 200 L192 200 M208 200 L220 200" stroke={FACE} strokeWidth={3} strokeLinecap="round" />
          ) : (
            <>
              <ellipse cx="186" cy="200" rx="6" ry="9" fill={FACE} />
              <ellipse cx="214" cy="200" rx="6" ry="9" fill={FACE} />
            </>
          )}
          <circle cx="200" cy="215" r="3" fill={FACE} />
          <path d="M190 222 Q200 231 210 222" stroke={FACE} strokeWidth={2.5} fill="none" strokeLinecap="round" />
          <ellipse cx="172" cy="214" rx="8" ry="4" fill={BLUSH} opacity={0.6} />
          <ellipse cx="228" cy="214" rx="8" ry="4" fill={BLUSH} opacity={0.6} />
        </g>
      )
  }
}

export function OctocatArt({ expression, waving = false }: { expression: OctocatExpression; waving?: boolean }) {
  const reduced = useReducedMotion()
  const [blinking, setBlinking] = useState(false)

  useEffect(() => {
    if (reduced) return
    let reopen = 0
    const interval = window.setInterval(() => {
      setBlinking(true)
      reopen = window.setTimeout(() => setBlinking(false), 150)
    }, 4000)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(reopen)
    }
  }, [reduced])

  return (
    <svg viewBox="0 0 400 420" className="h-auto w-full drop-shadow-[0_0_18px_rgba(196,181,253,0.35)]" aria-hidden="true">
      {/* nave */}
      <path d="M120 318 L80 300 L80 336 Z" fill="#67E8F9" opacity={0.85} />
      <path d="M96 286 L60 250 L74 246 L118 286 Z" fill={SHIP} />
      <path d="M304 286 L340 250 L326 246 L282 286 Z" fill={SHIP} />
      <path d="M150 330 L70 392 L104 398 L190 336 Z" fill={SHIP} />
      <path d="M250 330 L330 392 L296 398 L210 336 Z" fill={SHIP} />
      <ellipse cx="200" cy="312" rx="150" ry="52" fill={SHIP} />
      <ellipse cx="200" cy="330" rx="140" ry="32" fill="#000000" fillOpacity={0.2} />
      <path d="M56 300 Q200 318 344 300" stroke="#E6EAF0" strokeWidth={8} fill="none" strokeLinecap="round" />
      <rect x="112" y="304" width="10" height="10" rx="2" fill="#39D353" />
      <rect x="140" y="307" width="10" height="10" rx="2" fill="#26A641" />
      <rect x="168" y="309" width="10" height="10" rx="2" fill="#39D353" />
      <rect x="196" y="309" width="10" height="10" rx="2" fill="#0E4429" />
      <rect x="224" y="309" width="10" height="10" rx="2" fill="#39D353" />
      <rect x="252" y="307" width="10" height="10" rx="2" fill="#26A641" />
      <rect x="280" y="304" width="10" height="10" rx="2" fill="#39D353" />
      <circle cx="200" cy="336" r="8" fill="#FFF3C4" />
      {/* corpo, manche e braço no manche */}
      <path d="M150 296 Q146 232 200 226 Q254 232 250 296 Z" fill={BODY} />
      <rect x="262" y="262" width="8" height="32" rx="3" fill="#4A5878" />
      <circle cx="266" cy="258" r="10" fill={HAT} />
      <path d="M238 262 Q256 250 262 262" stroke={BODY} strokeWidth={13} fill="none" strokeLinecap="round" />
      {/* braço livre: acena */}
      <motion.path
        d="M160 254 Q124 236 120 198"
        stroke={BODY}
        strokeWidth={13}
        fill="none"
        strokeLinecap="round"
        style={{ transformOrigin: '160px 254px', transformBox: 'view-box' }}
        animate={waving && !reduced ? { rotate: [0, -20, 8, -20, 0] } : { rotate: 0 }}
        transition={waving && !reduced ? { duration: 1.2, repeat: Infinity } : { duration: 0.3 }}
      />
      {/* cabeça e rosto */}
      <ellipse cx="200" cy="190" rx="62" ry="54" fill={BODY} />
      <ellipse cx="200" cy="204" rx="46" ry="34" fill={SKIN} />
      <Face expression={expression} blinking={blinking} />
      {/* gorro-Clawd */}
      <g transform="translate(80 44)" shapeRendering="crispEdges">
        <rect x="92" y="34" width="9" height="18" fill={HAT} />
        <rect x="108" y="34" width="9" height="18" fill={HAT} />
        <rect x="124" y="34" width="9" height="18" fill={HAT} />
        <rect x="140" y="34" width="9" height="18" fill={HAT} />
        <rect x="62" y="50" width="116" height="80" fill={HAT} />
        <rect x="40" y="96" width="24" height="14" fill={HAT} />
        <rect x="176" y="96" width="24" height="14" fill={HAT} />
        <rect x="40" y="110" width="14" height="34" fill={HAT} />
        <rect x="186" y="110" width="14" height="34" fill={HAT} />
        <rect x="96" y="66" width="10" height="24" fill="#141413" />
        <rect x="134" y="66" width="10" height="24" fill="#141413" />
        <rect x="58" y="120" width="124" height="14" fill="#B85C3E" />
      </g>
      {/* cúpula */}
      <path
        d="M54 292 Q54 56 200 54 Q346 56 346 292 Z"
        fill="#A5F3FC"
        fillOpacity={0.12}
        stroke="#A5F3FC"
        strokeOpacity={0.55}
        strokeWidth={2.5}
      />
      <path d="M92 170 Q104 110 156 86" stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={7} fill="none" strokeLinecap="round" />
    </svg>
  )
}
```

Substitua `src/components/ui/Loader.tsx` por:

```tsx
import { OctocatArt } from './octocat/OctocatArt'

export function Loader() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-space">
      <div className="flex flex-col items-center gap-3">
        <div className="w-32 animate-pulse">
          <OctocatArt expression="thinking" />
        </div>
        <p className="text-sm text-slate-400">Carregando dados do GitHub…</p>
      </div>
    </div>
  )
}
```

Substitua `src/App.tsx` pela versão final:

```tsx
import { lazy, Suspense, useState } from 'react'
import { ActivityTooltip } from '@/components/ui/ActivityTooltip'
import { BackButton } from '@/components/ui/BackButton'
import { LoadError } from '@/components/ui/LoadError'
import { Loader } from '@/components/ui/Loader'
import { OctocatSpeech } from '@/components/ui/OctocatSpeech'
import { PlanetPanel } from '@/components/ui/PlanetPanel'
import { ProfilePanel } from '@/components/ui/ProfilePanel'
import { StaticFallback } from '@/components/ui/StaticFallback'
import { Tutorial } from '@/components/ui/Tutorial'
import { TutorialButton } from '@/components/ui/TutorialButton'
import { useUniverseData } from '@/hooks/useUniverseData'
import { supportsWebGL } from '@/hooks/webgl'

const Scene = lazy(() => import('@/components/three/Scene').then((m) => ({ default: m.Scene })))

export function App() {
  const { state, retry } = useUniverseData()
  const [webgl] = useState(supportsWebGL)

  if (state.status === 'error') return <LoadError message={state.message} onRetry={retry} />
  if (state.status === 'loading') return <Loader />
  if (!webgl) return <StaticFallback universe={state.universe} />
  const { universe } = state

  return (
    <main className="fixed inset-0 overflow-hidden bg-space text-slate-100">
      <Suspense fallback={<Loader />}>
        <Scene universe={universe} />
      </Suspense>
      <ActivityTooltip />
      <BackButton />
      <PlanetPanel universe={universe} />
      <ProfilePanel profile={universe.profile} />
      <OctocatSpeech profileName={universe.profile.name} />
      <TutorialButton />
      <Tutorial profileName={universe.profile.name} />
    </main>
  )
}
```

- [ ] **Step 11: Verificar**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: sem erros.

Run: `pnpm dev` (aba anônima) e confira:
- a nave desce do alto, acena e fica na escolta no canto inferior direito da visão, flutuando e piscando; ao girar a câmera, ela acompanha com atraso;
- clicar num planeta: a nave voa em arco (sobe acima das órbitas, nunca cruza o sol), inclina nas curvas, deixa rastro roxo, e a câmera vai atrás dela; na chegada a câmera assume a pose do planeta com o painel e libera o arrasto; a nave paira ao lado, apontando;
- clicar no sol: viagem até o sol, painel de perfil, balão "Esse é o perfil GitHub de Mona!" preso à nave;
- Esc ou "← Galáxia": a câmera volta à visão geral e a nave retorna à escolta;
- no tutorial, a nave viaja até o sol (passo 1) e até o planeta de vitrine (passo 3), sem perseguição;
- clicar na nave ou no botão "? Tutorial" abre o tutorial; hover na nave faz acenar;
- com "Reduzir movimento": sem voo nem perseguição, a nave aparece direto ao lado do alvo.

- [ ] **Step 12: Commit**

```bash
git add src
git commit -m "feat(octocat-3d): escolta, viagem em arco e câmera de perseguição"
```

---

### Task 14: E2E, CI, deploy no GitHub Pages e README

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`
- Modify: `README.md`, `.gitignore`

**Interfaces:**
- Consumes: todo o app; `public/universe.json` de exemplo (Task 6); scripts `snapshot`, `build`, `preview`, `e2e`.

- [ ] **Step 1: Playwright**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173/github-universe-3d/',
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
  },
})
```

`e2e/smoke.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('universo carrega, o sol abre o perfil e o Octocat reabre o tutorial', async ({ page }) => {
  await page.goto('/github-universe-3d/')

  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible({ timeout: 30_000 })

  const welcome = page.getByText(/Bem-vindo ao universo GitHub de/)
  await expect(welcome).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Pular tutorial' }).click()
  await expect(welcome).toBeHidden()
  await page.waitForTimeout(1500) // câmera volta à visão geral

  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas sem dimensões')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.getByRole('dialog', { name: /Perfil de/ })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()

  await page.getByRole('button', { name: 'Abrir tutorial com o Octocat' }).click()
  await expect(welcome).toBeVisible()
})
```

Acrescente ao `.gitignore`:

```
test-results/
playwright-report/
```

Run: `pnpm exec playwright install chromium && pnpm e2e`
Expected: 1 passed.

- [ ] **Step 2: Workflows**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches-ignore: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm e2e
        env:
          CI: 'true'
```

`.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  schedule:
    - cron: '17 */6 * * *'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      # Falha aqui = nada é publicado e o deploy anterior continua no ar.
      - run: pnpm snapshot
        env:
          UNIVERSE_TOKEN: ${{ secrets.UNIVERSE_TOKEN }}
          UNIVERSE_LOGIN: ${{ github.repository_owner }}
      - run: pnpm build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: README**

Substitua o bloco "Status" e a seção "Stack planejada" do `README.md` por:

```markdown
> Status: MVP em desenvolvimento. Site estático publicado no GitHub Pages.

## Rodar localmente

```bash
pnpm install
pnpm dev            # http://localhost:5173/github-universe-3d/ (usa public/universe.json de exemplo)
pnpm test           # testes unitários (Vitest)
pnpm e2e            # smoke test (Playwright)
```

Para ver o seu próprio perfil: copie `.env.example` para `.env.local`, preencha `UNIVERSE_TOKEN` (token fine-grained, só leitura de repositórios públicos) e `UNIVERSE_LOGIN`, e rode `pnpm snapshot`. Não commite o `universe.json` gerado assim; o commitado vem de `pnpm sample`.

Adicione `?perf` à URL para ver o FPS.

## Deploy

O workflow `Deploy` roda em push na `main`, a cada 6 horas e manualmente. Ele gera `universe.json` com o GitHub GraphQL, faz o build e publica no GitHub Pages. Se o GitHub falhar, nada é publicado e o site anterior continua no ar.

Configuração única no repositório:

1. Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → secret `UNIVERSE_TOKEN` com um token fine-grained de leitura de repositórios públicos. O token expira (no máximo 1 ano): renove antes disso.
3. O GitHub desativa workflows agendados em repositórios sem atividade por 60 dias; um push ou um disparo manual reativa.

## Checklist visual (PR)

- [ ] Planetas em anéis, mais rápidos perto do sol, eixos inclinados, quadradinhos quadrados no equador.
- [ ] Hover em planeta do top 10 mostra data e commits.
- [ ] Clique em planeta: o sistema para e o painel abre à direita (bottom sheet no mobile).
- [ ] Rosto do sol segue a câmera com atraso e olha para cima e para baixo.
- [ ] Octocat com nave roxo clara, falas contextuais, tutorial de 4 passos.
- [ ] "Reduzir movimento" no sistema deixa tudo parado.
- [ ] Lighthouse: performance ≥ 80 no desktop; `?perf` mostra ~60 fps.

## Stack

Vite, React, TypeScript, React Three Fiber, drei, Zustand, Tailwind, Framer Motion, GitHub GraphQL API, GitHub Actions, GitHub Pages.
```

- [ ] **Step 4: Verificação final**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e`
Expected: tudo PASS.

Run: `ls dist/assets/*.js | xargs -I{} sh -c 'gzip -c {} | wc -c'`
Expected: o chunk de entrada (o que **não** contém o Three.js) fica abaixo de 400 KB gzip; o Three.js fica num chunk separado carregado pelo `React.lazy`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "ci: smoke e2e, CI e deploy no GitHub Pages"
```

- [ ] **Step 6: Configuração no GitHub (precisa do usuário)**

**Pare e peça ao usuário** para fazer estes passos. Eles mexem no repositório remoto e criam um segredo, então o agente não deve fazê-los sozinho:

1. Garantir que o repositório é público (o Pages gratuito exige isso) e que o remoto `origin` existe.
2. Criar o token fine-grained e o secret `UNIVERSE_TOKEN`.
3. Settings → Pages → Source: GitHub Actions.
4. Autorizar o push da branch e o merge na `main`, que dispara o primeiro deploy.

Depois do deploy, abra `https://<usuário>.github.io/github-universe-3d/` e passe pelo checklist visual do README.
