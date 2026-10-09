import { formatCount, timeAgo } from '@/lib/format'
import type { Profile } from '@/lib/types'
import { languageShares } from '@/lib/universe/planets'
import { useReducedMotion } from 'framer-motion'
import { usePanelReady } from '@/store/panelReady'
import { usePresentation } from '@/store/presentation'
import { useUniverse } from '@/store/universe'
import { SidePanel } from './SidePanel'

export function ProfilePanel({ profile }: { profile: Profile }) {
  const selected = useUniverse((s) => s.selection.kind === 'profile')
  // Durante a apresentação, o cartão dela substitui o painel.
  const presenting = usePresentation((s) => s.state !== null)
  // O painel só aparece quando a nave chega (ver store/panelReady).
  const ready = usePanelReady(useReducedMotion() ?? false)
  const open = selected && !presenting && ready
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
        {/* folga à direita para o ✕ (44 px no toque); no celular, os blocos de leitura em 16 px */}
        <header className="flex items-center gap-4 pr-4">
          <img src={profile.avatarUrl} alt="" width={64} height={64} className="h-16 w-16 rounded-full ring-2 ring-neon/50" />
          <div>
            <h2 className="text-xl font-semibold text-neon">{profile.name}</h2>
            <p className="text-sm text-slate-400">@{profile.login}</p>
          </div>
        </header>
        {profile.bio && <p className="text-base text-slate-300 side:text-sm">{profile.bio}</p>}

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
            <p className="mt-2 text-base side:text-sm">
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
