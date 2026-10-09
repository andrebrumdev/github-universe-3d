import { Html } from '@react-three/drei'
import { formatCount } from '@/lib/format'
import type { Repo } from '@/lib/types'

/** Cartão com o resumo do README, com a base logo acima do topo do planeta. Ignora o ponteiro para não roubar o hover. */
export function PlanetHoverCard({ repo, radius }: { repo: Repo; radius: number }) {
  const language = repo.languages.find((l) => l.name === repo.primaryLanguage)
  const about = repo.readme ?? repo.description
  return (
    <Html position={[0, radius + 0.3, 0]} zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
      <div style={{ transform: 'translate(-50%, calc(-100% - 8px))' }}>
        <div
          role="tooltip"
          className="planet-card w-72 max-w-[18rem] rounded-xl border border-neon/40 bg-panel/95 p-3 text-left shadow-lg shadow-black/40"
        >
          <h3 className="truncate text-sm font-semibold text-neon">{repo.name}</h3>
          {repo.readme && repo.description && <p className="mt-0.5 text-xs text-slate-300">{repo.description}</p>}
          {about && <p className="mt-1.5 line-clamp-5 text-xs leading-snug text-slate-400">{about}</p>}
          <div className="mt-2 flex items-center gap-3 text-xs text-slate-300">
            <span>⭐ {formatCount(repo.stars)}</span>
            <span>⑂ {formatCount(repo.forks)}</span>
            {repo.primaryLanguage && (
              <span className="ml-auto flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: language?.color ?? '#8b949e' }} />
                {repo.primaryLanguage}
              </span>
            )}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Clique para explorar</p>
        </div>
      </div>
    </Html>
  )
}
