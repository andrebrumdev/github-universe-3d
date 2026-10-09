import { commitsLabel, formatCount, timeAgo } from '@/lib/format'
import { selectedPlanet } from '@/lib/interaction'
import type { Repo, Universe } from '@/lib/types'
import { languageShares } from '@/lib/universe/planets'
import { usePresentation } from '@/store/presentation'
import { useUniverse } from '@/store/universe'
import { SidePanel } from './SidePanel'

export function PlanetPanel({ universe }: { universe: Universe }) {
  const selection = useUniverse((s) => s.selection)
  const clearSelection = useUniverse((s) => s.clearSelection)
  const name = selectedPlanet(selection)
  const repo = name ? (universe.repos.find((r) => r.name === name) ?? null) : null
  const focusLanguage = selection.kind === 'moon' ? selection.language : null
  // Durante a apresentação, o cartão dela substitui o painel.
  const presenting = usePresentation((s) => s.state !== null)

  return (
    <SidePanel open={repo !== null && !presenting} onClose={clearSelection} title={repo?.name ?? 'Repositório'}>
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
      {/* folga à direita para o ✕ (44 px no toque); no celular, os blocos de leitura em 16 px */}
      <header className="pr-4">
        <h2 className="break-words text-xl font-semibold text-neon">{repo.name}</h2>
        {repo.description && <p className="mt-1 text-base text-slate-300 side:text-sm">{repo.description}</p>}
      </header>

      {repo.readme && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-slate-400">Sobre</h3>
          <p className="mt-2 text-base leading-relaxed text-slate-300 side:text-sm">{repo.readme}</p>
        </section>
      )}

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
                {l.name === repo.primaryLanguage && <span className="text-xs text-slate-400">principal</span>}
                <span className="ml-auto tabular-nums text-slate-400">{l.share.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-slate-400">Último commit</h3>
        {repo.lastCommit ? (
          <div className="mt-2 text-base side:text-sm">
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
        className="inline-flex items-center rounded-full border border-neon/50 px-4 py-2 text-sm text-neon hover:bg-neon/10 pointer-coarse:min-h-11"
      >
        Ver no GitHub ↗
      </a>
    </div>
  )
}
