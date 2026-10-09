import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { formatCount, timeAgo } from '@/lib/format'
import { firstName } from '@/lib/octocat/lines'
import { isHeld, isOutro, MAX_PRESENTED_REPOS, shipAtStop, STOP_SECONDS, type PresentationState, type Stop } from '@/lib/presentation'
import type { Profile, Repo, Universe } from '@/lib/types'
import { commitsInWindow } from '@/lib/universe/activity'
import { languageShares, MAX_MOONS } from '@/lib/universe/planets'
import { PRESENTATION_CARD } from '@/lib/uiLayout'
import { usePresentation } from '@/store/presentation'
import { shipPose } from '@/store/shipPose'

// Posição pelas medidas compartilhadas (uiLayout): a nave da escolta e a câmera contam com essa coluna/folha.
const CARD_STYLE = {
  '--sheet-max': `${PRESENTATION_CARD.phoneMaxHeight * 100}dvh`,
  '--card-right-md': `${PRESENTATION_CARD.desktopRight}px`,
  '--card-bottom-md': `${PRESENTATION_CARD.desktopBottom}px`,
  '--card-width-md': `${PRESENTATION_CARD.desktopWidth}px`,
  '--card-max-md': `calc(100dvh - ${PRESENTATION_CARD.desktopBottom + PRESENTATION_CARD.desktopTop}px)`,
} as CSSProperties

/** Laço da apresentação: avisa a chegada da nave e passa o tempo da parada (fora do React, por frame). */
function usePresentationClock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    let frame = 0
    let last = performance.now()
    const loop = (now: number) => {
      // Tempo de relógio, mesmo com poucos quadros por segundo; a aba escondida já pausa pelo visibilitychange.
      const dt = Math.min((now - last) / 1000, 1)
      last = now
      const { state, stops, arrived, tick } = usePresentation.getState()
      if (state) {
        if (!state.arrived && shipAtStop(stops[state.index], shipPose.mode, shipPose.target)) arrived()
        tick(dt)
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    const onVisibility = () => usePresentation.getState().setHidden(document.visibilityState === 'hidden')
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active])
}

/** Teclas da apresentação: Espaço pausa, ←/→ trocam de parada, Esc sai (só a apresentação reage ao Esc). */
function usePresentationKeys(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const target = e.target as HTMLElement | null
      const p = usePresentation.getState()
      if (e.key === 'Escape') {
        // Fase de captura: o painel lateral (e quem mais ouvir o Esc) não reage junto.
        e.stopImmediatePropagation()
        p.exit()
      } else if (e.key === ' ') {
        // Espaço num botão ou link já aciona o próprio controle.
        if (target?.closest('button, a, input, textarea, select')) return
        e.preventDefault()
        p.togglePause()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        p.next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        p.prev()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active])
}

export function PresentationCard({ universe }: { universe: Universe }) {
  const state = usePresentation((s) => s.state)
  const stops = usePresentation((s) => s.stops)
  const reduced = useReducedMotion() ?? false
  const active = state !== null
  usePresentationClock(active)
  usePresentationKeys(active)

  // Mouse em cima ou foco de teclado dentro do cartão seguram o tempo (quem está lendo não perde a parada).
  const card = useRef<HTMLElement>(null)
  const pointerInside = useRef(false)
  const keyboardFocus = useRef(false)
  const syncHover = () => usePresentation.getState().setHovering(pointerInside.current || keyboardFocus.current)
  const index = state?.index ?? -1
  useEffect(() => {
    // A cada parada o conteúdo troca: um botão focado pode ter saído da tela sem disparar blur.
    const focused = document.activeElement
    keyboardFocus.current = !!focused && !!card.current?.contains(focused) && focused.matches(':focus-visible')
    if (index < 0) pointerInside.current = false
    else syncHover()
  }, [index])

  const stop = state ? stops[state.index] : null

  return (
    <AnimatePresence>
      {state && stop && (
        <motion.section
          key="presentation"
          ref={card}
          aria-label="Apresentação"
          initial={{ opacity: 0, y: reduced ? 0 : 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : 16 }}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 30 }}
          style={CARD_STYLE}
          onPointerEnter={(e) => {
            if (e.pointerType !== 'mouse') return
            pointerInside.current = true
            syncHover()
          }}
          onPointerLeave={() => {
            pointerInside.current = false
            syncHover()
          }}
          onFocus={(e) => {
            keyboardFocus.current = e.target.matches(':focus-visible')
            syncHover()
          }}
          onBlur={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
            keyboardFocus.current = false
            syncHover()
          }}
          className="fixed inset-x-0 bottom-0 z-40 max-h-(--sheet-max) overflow-y-auto rounded-t-2xl border border-neon/30 bg-panel/95 text-sm shadow-xl shadow-black/40 backdrop-blur md:left-auto md:right-(--card-right-md) md:bottom-(--card-bottom-md) md:max-h-(--card-max-md) md:w-(--card-width-md) md:rounded-2xl"
        >
          <Controls state={state} reduced={reduced} />
          <p aria-live="polite" className="sr-only">
            {`Parada ${state.index + 1} de ${state.count}: ${stopTitle(stop, universe.profile)}`}
          </p>
          <motion.div
            key={state.index}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduced ? { duration: 0 } : { duration: 0.35 }}
            className="px-4 pb-4"
          >
            <StopBody stop={stop} universe={universe} />
          </motion.div>
        </motion.section>
      )}
    </AnimatePresence>
  )
}

function stopTitle(stop: Stop, profile: Profile): string {
  if (stop.kind === 'profile') return `perfil de ${profile.name}`
  if (stop.kind === 'repo') return stop.name
  return 'fim da apresentação'
}

function Controls({ state, reduced }: { state: PresentationState; reduced: boolean }) {
  const { prev, next, togglePause, exit } = usePresentation.getState()
  const outro = isOutro(state)
  return (
    // Fica no topo da folha/cartão enquanto o conteúdo rola.
    <div className="sticky top-0 z-10 bg-panel/95 px-4 pb-3 pt-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <p className="text-xs uppercase tracking-wider text-slate-400">
          Apresentação <span className="ml-1 tabular-nums normal-case tracking-normal text-slate-500">{state.index + 1}/{state.count}</span>
        </p>
        <div className="ml-auto flex items-center gap-1">
          <ControlButton label="Parada anterior" onClick={prev} disabled={state.index === 0}>
            ◀
          </ControlButton>
          {!outro && (
            <ControlButton label={state.paused ? 'Continuar' : 'Pausar'} onClick={togglePause} primary>
              {state.paused ? '▶' : '⏸'}
            </ControlButton>
          )}
          <ControlButton label="Próxima parada" onClick={next} disabled={outro}>
            ▶
          </ControlButton>
          <ControlButton label="Sair da apresentação" onClick={exit}>
            ✕
          </ControlButton>
        </div>
      </div>
      <ol aria-hidden="true" className="mt-2 flex gap-1">
        {Array.from({ length: state.count }, (_, i) => (
          <li
            key={i}
            className={`h-1.5 rounded-full transition-all motion-reduce:transition-none ${
              i === state.index ? 'w-4 bg-neon' : i < state.index ? 'w-1.5 bg-neon/50' : 'w-1.5 bg-white/15'
            }`}
          />
        ))}
      </ol>
      {!outro && <StopProgress reduced={reduced} />}
    </div>
  )
}

function ControlButton({
  label,
  onClick,
  disabled = false,
  primary = false,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs focus-visible:outline-2 focus-visible:outline-neon disabled:opacity-30 ${
        primary ? 'bg-neon/90 text-space hover:bg-neon' : 'text-slate-300 hover:bg-white/10 hover:text-neon disabled:hover:bg-transparent'
      }`}
    >
      {children}
    </button>
  )
}

/** Barra fina do tempo da parada; com movimento reduzido, os segundos que faltam em texto. */
function StopProgress({ reduced }: { reduced: boolean }) {
  const fraction = usePresentation((s) => (s.state ? s.state.holdElapsed / STOP_SECONDS : 0))
  const remaining = usePresentation((s) => (s.state ? Math.ceil(STOP_SECONDS - s.state.holdElapsed) : 0))
  const arrived = usePresentation((s) => s.state?.arrived ?? false)
  const held = usePresentation((s) => (s.state ? isHeld(s.state) : false))
  const paused = usePresentation((s) => s.state?.paused ?? false)

  const status = !arrived ? 'A caminho…' : paused ? 'Pausado' : held ? 'Esperando você ler' : `Próxima em ${remaining} s`
  if (reduced) return <p className="mt-2 text-xs tabular-nums text-slate-400">{status}</p>
  return (
    <div className="mt-2">
      <div className="h-0.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full origin-left bg-neon" style={{ transform: `scaleX(${Math.min(1, fraction)})` }} />
      </div>
      {(paused || !arrived) && <p className="mt-1 text-[11px] text-slate-500">{status}</p>}
    </div>
  )
}

function StopBody({ stop, universe }: { stop: Stop; universe: Universe }) {
  if (stop.kind === 'profile') return <ProfileStop profile={universe.profile} />
  if (stop.kind === 'outro') return <OutroStop universe={universe} />
  const repo = universe.repos.find((r) => r.name === stop.name)
  return repo ? <RepoStop repo={repo} /> : null
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-xs uppercase tracking-wider text-slate-400">{children}</h3>
}

function ProfileStop({ profile }: { profile: Profile }) {
  const stats: [string, number][] = [
    ['Stars', profile.totalStars],
    ['Forks', profile.totalForks],
    ['Seguidores', profile.followers],
    ['Repos', profile.totalRepos],
  ]
  const languages = languageShares(profile.topLanguages).slice(0, 3)
  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <img src={profile.avatarUrl} alt="" width={56} height={56} className="h-14 w-14 rounded-full ring-2 ring-neon/50" />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-neon">{profile.name}</h2>
          <p className="text-sm text-slate-400">@{profile.login}</p>
        </div>
      </header>
      {profile.bio && <p className="text-slate-300">{profile.bio}</p>}
      <dl className="grid grid-cols-4 gap-2 text-center">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-white/5 px-1 py-2">
            <dt className="text-[11px] text-slate-400">{label}</dt>
            <dd className="text-base font-semibold">{formatCount(value)}</dd>
          </div>
        ))}
      </dl>
      {languages.length > 0 && (
        <section>
          <SectionTitle>Top linguagens</SectionTitle>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {languages.map((l) => (
              <LanguageChip key={l.name} name={l.name} color={l.color}>
                <span className="tabular-nums text-slate-400">{l.share.toFixed(0)}%</span>
              </LanguageChip>
            ))}
          </ul>
        </section>
      )}
      <section>
        <SectionTitle>Último commit</SectionTitle>
        {profile.lastCommit ? (
          <p className="mt-1.5">
            <span className="line-clamp-2 text-slate-100">{profile.lastCommit.message}</span>
            <span className="block text-xs text-slate-400">{timeAgo(profile.lastCommit.date)}</span>
          </p>
        ) : (
          <p className="mt-1.5 text-slate-400">Nenhum commit público.</p>
        )}
      </section>
    </div>
  )
}

function RepoStop({ repo }: { repo: Repo }) {
  const yearCommits = commitsInWindow(repo.activity)
  // As luas do planeta: uma por linguagem, até MAX_MOONS.
  const moons = repo.languages.slice(0, MAX_MOONS)
  return (
    <div className="space-y-4">
      <h2 className="break-words text-lg font-semibold text-neon">{repo.name}</h2>
      <section>
        <SectionTitle>O que faz</SectionTitle>
        {repo.description || repo.readme ? (
          <div className="mt-1.5 space-y-1.5">
            {repo.description && <p className="text-slate-100">{repo.description}</p>}
            {repo.readme && <p className="line-clamp-4 text-[13px] leading-snug text-slate-400">{repo.readme}</p>}
          </div>
        ) : (
          <p className="mt-1.5 text-slate-400">Sem descrição nem README por aqui, mas o código conta a história. Vale a visita!</p>
        )}
      </section>
      {moons.length > 0 && (
        <section>
          <SectionTitle>Linguagens (as luas)</SectionTitle>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {moons.map((l) => (
              <LanguageChip key={l.name} name={l.name} color={l.color} />
            ))}
          </ul>
        </section>
      )}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-2">
        <Stat label="Stars" value={`⭐ ${formatCount(repo.stars)}`} />
        <Stat label="Forks" value={`⑂ ${formatCount(repo.forks)}`} />
        <Stat label="Commits no último ano" value={formatCount(yearCommits)} />
        <Stat label="Último commit" value={repo.lastCommit ? timeAgo(repo.lastCommit.date) : '—'} />
      </dl>
      <a
        href={repo.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex rounded-full border border-neon/50 px-4 py-2 text-neon hover:bg-neon/10"
      >
        Ver no GitHub ↗
      </a>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 px-2 py-1.5">
      <dt className="text-[11px] text-slate-400">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  )
}

function LanguageChip({ name, color, children }: { name: string; color: string; children?: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {name}
      {children}
    </li>
  )
}

function OutroStop({ universe }: { universe: Universe }) {
  const { exit, restart } = usePresentation.getState()
  const shown = Math.min(universe.repos.length, MAX_PRESENTED_REPOS)
  const name = firstName(universe.profile.name) || universe.profile.login
  const explore = useRef<HTMLButtonElement>(null)
  // No fim, o foco vai para "Explorar" (a apresentação não anda mais sozinha).
  useEffect(() => explore.current?.focus({ preventScroll: true }), [])
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-neon">Fim da apresentação</h2>
      <p className="text-slate-300">
        {shown > 0
          ? `Esse foi o universo de ${name}: o perfil e ${shown === 1 ? 'o repo' : `os ${shown} repos`} em destaque. Agora é com você!`
          : `Esse foi o universo de ${name}. Agora é com você!`}
      </p>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={restart} className="rounded-full px-3 py-1.5 text-slate-300 hover:text-neon">
          Ver de novo
        </button>
        <button
          ref={explore}
          type="button"
          onClick={exit}
          className="rounded-full bg-neon/90 px-4 py-1.5 font-medium text-space hover:bg-neon"
        >
          Explorar
        </button>
      </div>
    </div>
  )
}
