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
            <li key={repo.name}>
              {/* o cartão inteiro é o link: alvo de toque da linha toda, não só do nome */}
              <a
                href={repo.url}
                target="_blank"
                rel="noreferrer"
                className="group block min-h-11 rounded-lg border border-slate-700/60 p-3 hover:border-neon/50"
              >
                <span className="font-medium text-neon group-hover:underline">{repo.name}</span>
                {repo.description && <span className="block text-sm text-slate-400">{repo.description}</span>}
                <span className="block text-xs text-slate-400">
                  ★ {formatCount(repo.stars)} · {repo.primaryLanguage ?? 'sem linguagem'}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
