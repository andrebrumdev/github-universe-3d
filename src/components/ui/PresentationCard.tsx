import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { formatCount, timeAgo } from '@/lib/format'
import { firstName } from '@/lib/octocat/lines'
import { type ArrivalWatch, isHeld, MAX_PRESENTED_REPOS, shipAtStop, STOP_SECONDS, type Stop, watchArrival } from '@/lib/presentation'
import type { Profile, Repo, Universe } from '@/lib/types'
import { commitsInWindow } from '@/lib/universe/activity'
import { languageShares, MAX_MOONS } from '@/lib/universe/planets'
import { PRESENTATION_CARD, SIDE_PANEL_MAX_FRACTION, SIDE_PANEL_WIDTH } from '@/lib/uiLayout'
import { usePresentation } from '@/store/presentation'
import { shipPose } from '@/store/shipPose'

// Posição pelas medidas compartilhadas (uiLayout): a nave da escolta e a câmera contam com essa coluna/folha.
// Na coluna, a largura do painel lateral (metade da tela num celular deitado), fora das áreas seguras.
const CARD_STYLE = {
  '--sheet-max': `${PRESENTATION_CARD.phoneMaxHeight * 100}dvh`,
  '--card-right-md': `calc(${PRESENTATION_CARD.desktopRight}px + var(--safe-right))`,
  '--card-bottom-md': `calc(${PRESENTATION_CARD.desktopBottom}px + var(--safe-bottom))`,
  '--card-width-md': `calc(min(${SIDE_PANEL_WIDTH}px, ${SIDE_PANEL_MAX_FRACTION * 100}vw) - ${PRESENTATION_CARD.desktopMargin}px)`,
  '--card-max-md': `calc(100dvh - ${PRESENTATION_CARD.desktopBottom + PRESENTATION_CARD.desktopTop}px - var(--safe-bottom) - var(--safe-top))`,
} as CSSProperties

/** Laço da apresentação: avisa a chegada da nave e passa o tempo da parada (fora do React, por frame). */
function usePresentationClock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    let frame = 0
    let last = performance.now()
    const watch: ArrivalWatch = { index: -1, waited: 0 }
    const loop = (now: number) => {
      // Tempo de relógio, mesmo com poucos quadros por segundo; a aba escondida já pausa pelo visibilitychange.
      const dt = Math.min((now - last) / 1000, 1)
      last = now
      const { state, stops, arrived, tick } = usePresentation.getState()
      if (state) {
        // Chegou (ou a nave nunca chega, e a rede de segurança libera a parada no mesmo relógio da viagem).
        // Em viagem, `tick` devolve o mesmo estado: nada re-renderiza.
        if (!state.arrived && (shipAtStop(stops[state.index], shipPose.mode, shipPose.target) || watchArrival(watch, state.index, dt))) arrived()
        else tick(dt)
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    const onVisibility = () => {
      // Sem quadros enquanto a aba some: na volta, o primeiro passo não soma o tempo fora.
      last = performance.now()
      usePresentation.getState().setHidden(document.visibilityState === 'hidden')
    }
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
  // Só campos que mudam raramente: o tempo da parada (por quadro) fica fora do React (StopProgress).
  const index = usePresentation((s) => s.state?.index ?? -1)
  const count = usePresentation((s) => s.state?.count ?? 0)
  const stop = usePresentation((s) => (s.state ? s.stops[s.state.index] : null))
  const reduced = useReducedMotion() ?? false
  const active = index >= 0
  usePresentationClock(active)
  usePresentationKeys(active)

  // Mouse em cima ou foco de teclado dentro do cartão seguram o tempo (quem está lendo não perde a parada).
  const card = useRef<HTMLElement>(null)
  const pointerInside = useRef(false)
  const keyboardFocus = useRef(false)
  const syncHover = () => usePresentation.getState().setHovering(pointerInside.current || keyboardFocus.current)
  useEffect(() => {
    // Ao abrir, o foco vai para o cartão (o botão que abriu sumiu); o próprio cartão não segura o tempo.
    if (active) card.current?.focus({ preventScroll: true })
  }, [active])
  useEffect(() => {
    // A cada parada o conteúdo troca: um botão focado pode ter saído da tela sem disparar blur.
    const focused = document.activeElement
    keyboardFocus.current = !!focused && focused !== card.current && !!card.current?.contains(focused) && focused.matches(':focus-visible')
    if (index < 0) pointerInside.current = false
    else syncHover()
  }, [index])

  return (
    <AnimatePresence>
      {active && stop && (
        <motion.section
          key="presentation"
          ref={card}
          tabIndex={-1}
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
            keyboardFocus.current = e.target !== e.currentTarget && e.target.matches(':focus-visible')
            syncHover()
          }}
          onBlur={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
            keyboardFocus.current = false
            syncHover()
          }}
          className="fixed inset-x-0 bottom-0 z-40 max-h-(--sheet-max) overflow-y-auto rounded-t-2xl border border-neon/30 bg-panel/95 text-sm shadow-xl shadow-black/40 backdrop-blur overscroll-contain side:left-auto side:right-(--card-right-md) side:bottom-(--card-bottom-md) side:max-h-(--card-max-md) side:w-(--card-width-md) side:rounded-2xl outline-none"
        >
          <Controls index={index} count={count} reduced={reduced} />
          <p aria-live="polite" className="sr-only">
            {`Parada ${index + 1} de ${count}: ${stopTitle(stop, universe.profile)}`}
          </p>
          <motion.div
            key={index}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduced ? { duration: 0 } : { duration: 0.35 }}
            className="px-4 pb-[max(1rem,var(--safe-bottom))] side:pb-4"
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

function Controls({ index, count, reduced }: { index: number; count: number; reduced: boolean }) {
  const { prev, next, togglePause, exit } = usePresentation.getState()
  const paused = usePresentation((s) => s.state?.paused ?? false)
  const outro = index === count - 1
  return (
    // Fica no topo da folha/cartão enquanto o conteúdo rola.
    <div className="sticky top-0 z-10 bg-panel/95 px-4 pb-3 pt-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <p className="text-xs uppercase tracking-wider text-slate-400">
          Apresentação <span className="ml-1 tabular-nums normal-case tracking-normal text-slate-400">{index + 1}/{count}</span>
        </p>
        {/* No toque, 44 px e mais espaço; o ✕ fica separado da navegação, para o polegar não sair sem querer. */}
        <div className="ml-auto flex items-center gap-1 pointer-coarse:gap-2">
          <ControlButton label="Parada anterior" onClick={prev} disabled={index === 0}>
            ◀
          </ControlButton>
          {!outro && (
            <ControlButton label={paused ? 'Continuar' : 'Pausar'} onClick={togglePause} primary>
              {paused ? '▶' : '⏸'}
            </ControlButton>
          )}
          <ControlButton label="Próxima parada" onClick={next} disabled={outro}>
            ▶
          </ControlButton>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-white/15 pointer-coarse:mx-2 pointer-coarse:h-7" />
          <ControlButton label="Sair da apresentação" onClick={exit}>
            ✕
          </ControlButton>
        </div>
      </div>
      <ol aria-hidden="true" className="mt-2 flex gap-1">
        {Array.from({ length: count }, (_, i) => (
          <li
            key={i}
            className={`h-1.5 rounded-full transition-all motion-reduce:transition-none ${
              i === index ? 'w-4 bg-neon' : i < index ? 'w-1.5 bg-neon/50' : 'w-1.5 bg-white/15'
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
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:text-sm focus-visible:outline-2 focus-visible:outline-neon disabled:opacity-30 ${
        primary ? 'bg-neon/90 text-space hover:bg-neon' : 'text-slate-300 hover:bg-white/10 hover:text-neon disabled:hover:bg-transparent'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Barra fina do tempo da parada; com movimento reduzido, os segundos que faltam em texto. A barra anda por quadro
 * sem React: uma assinatura do store escreve o `scaleX` direto no elemento.
 */
function StopProgress({ reduced }: { reduced: boolean }) {
  const bar = useRef<HTMLDivElement>(null)
  // Os segundos em texto mudam uma vez por segundo, e só valem com movimento reduzido.
  const remaining = usePresentation((s) => (reduced && s.state ? Math.ceil(STOP_SECONDS - s.state.holdElapsed) : 0))
  const arrived = usePresentation((s) => s.state?.arrived ?? false)
  const held = usePresentation((s) => (s.state ? isHeld(s.state) : false))
  const paused = usePresentation((s) => s.state?.paused ?? false)

  useEffect(() => {
    if (reduced) return
    const paint = (holdElapsed: number) => {
      if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, holdElapsed / STOP_SECONDS)})`
    }
    paint(usePresentation.getState().state?.holdElapsed ?? 0)
    return usePresentation.subscribe((s, prev) => {
      const t = s.state?.holdElapsed ?? 0
      if (t !== (prev.state?.holdElapsed ?? 0)) paint(t)
    })
  }, [reduced])

  // A pausa do usuário vem primeiro: é a resposta ao que ele acabou de fazer (mesmo com a nave ainda a caminho).
  const status = paused ? 'Pausado' : !arrived ? 'A caminho…' : held ? 'Esperando você ler' : `Próxima em ${remaining} s`
  if (reduced) return <p className="mt-2 text-xs tabular-nums text-slate-400">{status}</p>
  return (
    <div className="mt-2">
      <div className="h-0.5 overflow-hidden rounded-full bg-white/10">
        <div ref={bar} className="h-full origin-left bg-neon" style={{ transform: 'scaleX(0)' }} />
      </div>
      {(held || !arrived) && <p className="mt-1 text-[11px] text-slate-400">{status}</p>}
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
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 side:grid-cols-2">
        <Stat label="Stars" value={`⭐ ${formatCount(repo.stars)}`} />
        <Stat label="Forks" value={`⑂ ${formatCount(repo.forks)}`} />
        <Stat label="Commits no último ano" value={formatCount(yearCommits)} />
        <Stat label="Último commit" value={repo.lastCommit ? timeAgo(repo.lastCommit.date) : '—'} />
      </dl>
      <a
        href={repo.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center rounded-full border border-neon/50 px-4 py-2 text-neon hover:bg-neon/10 pointer-coarse:min-h-11"
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
        <button type="button" onClick={restart} className="rounded-full px-3 py-1.5 text-slate-300 hover:text-neon pointer-coarse:min-h-11 pointer-coarse:px-4">
          Ver de novo
        </button>
        <button
          ref={explore}
          type="button"
          onClick={exit}
          className="rounded-full bg-neon/90 px-4 py-1.5 font-medium text-space hover:bg-neon pointer-coarse:min-h-11 pointer-coarse:px-5"
        >
          Explorar
        </button>
      </div>
    </div>
  )
}
