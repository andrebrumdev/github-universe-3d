import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useFloatingButtonsHidden } from '@/hooks/useFloatingButtonsHidden'
import { DODGE_TRIGGER, planDodge, pointerDistance, type DodgePlan } from '@/lib/easter/dodge'
import { noClickVisible } from '@/lib/easter/show'
import { reservedRects, safeArea } from '@/lib/uiLayout'
import { useCrash } from '@/store/crash'
import { dispatchShow, useShow } from '@/store/show'
import { usePresentation } from '@/store/presentation'
import { useTutorial } from '@/store/tutorial'

/** Canto de baixo à esquerda (o lado livre da linha dos botões), fora das áreas seguras. */
const HOME = { left: 16, bottom: 16 } as const
/** Mola do pulo: passa um pouco do lugar e volta (o "boing" de quem foge). */
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

/**
 * Easter egg da quarta parede: um botão discreto "Não clique aqui" que foge do mouse (lib/easter/dodge). Cansa depois de
 * algumas fugas e se deixa pegar; pego, o Octocat faz um show (store/easter, ShowDriver) e o botão volta para o canto,
 * mais esperto (a rodada seguinte foge mais). Some com os outros botões flutuantes, no tutorial, na apresentação, na
 * trombada e durante o show.
 *
 * Acessível: Tab chega nele e Enter ou Espaço o pegam (com o foco nele, ele nunca foge nem se move). No toque, foge do
 * dedo que desce perto; o toque que acerta pega. Com movimento reduzido, pula sem animação.
 */
export function NoClickButton() {
  const floatingHidden = useFloatingButtonsHidden()
  const tutorial = useTutorial((s) => s.step !== null)
  const presentation = usePresentation((s) => s.state !== null)
  const crash = useCrash((s) => s.impact !== null)
  const showing = useShow((s) => s.phase !== 'idle')
  const round = useShow((s) => s.round)
  if (!noClickVisible({ floatingHidden, tutorial, presentation, crash, showing })) return null
  // cada rodada começa do canto, descansada
  return <DodgingButton key={round} round={round} />
}

function DodgingButton({ round }: { round: number }) {
  const reduced = useReducedMotion() ?? false
  const button = useRef<HTMLButtonElement>(null)
  /** Deslocamento a partir do canto (px) e a duração do pulo em curso. */
  const [offset, setOffset] = useState({ x: 0, y: 0, duration: 0 })
  const [tired, setTired] = useState(false)
  const dodge = useRef({ count: 0, busyUntil: 0, offset: { x: 0, y: 0 }, swallowClick: false })

  useEffect(() => {
    const el = button.current
    if (!el) return
    /** Foge se der (`press`: o mouse apertou em cima dele, no meio de um pulo; ainda com fôlego, escapa). */
    const tryDodge = (x: number, y: number, now: number, press = false): DodgePlan['kind'] | null => {
      // com o foco do teclado nele (Tab), fica quieto: o teclado nunca persegue um alvo que anda
      if (el.matches(':focus-visible')) return null
      const d = dodge.current
      if (!press && now < d.busyUntil) return null
      const r = el.getBoundingClientRect()
      const rect = { x: r.left, y: r.top, w: r.width, h: r.height }
      if (pointerDistance(rect, { x, y }) > DODGE_TRIGGER) return null
      const { innerWidth: width, innerHeight: height } = window
      const plan = planDodge({
        button: rect,
        pointer: { x, y },
        viewport: { width, height },
        reserved: reservedRects(width, height),
        dodges: d.count,
        round,
        insets: safeArea,
      })
      if (plan.kind === 'stay') return plan.kind
      if (plan.kind === 'give-up') {
        setTired(true)
        return plan.kind
      }
      d.count++
      if (plan.kind === 'cornered') {
        // sem saída: se espreme e chacoalha no lugar
        d.busyUntil = now + 450
        if (!reduced) {
          el.animate(
            [
              { scale: '1 1', rotate: '0deg' },
              { scale: '0.86 1.12', rotate: '-6deg' },
              { scale: '1.08 0.9', rotate: '5deg' },
              { scale: '0.95 1.04', rotate: '-3deg' },
              { scale: '1 1', rotate: '0deg' },
            ],
            { duration: 420, easing: 'ease-out' },
          )
        }
        return plan.kind
      }
      const next = { x: d.offset.x + plan.x - rect.x, y: d.offset.y + plan.y - rect.y }
      d.offset = next
      // espera o pulo quase acabar antes de pensar no próximo (cansado, o pulo é mais lento)
      d.busyUntil = now + plan.duration * 0.7
      setOffset({ ...next, duration: plan.duration })
      return plan.kind
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') tryDodge(e.clientX, e.clientY, performance.now())
    }
    const onDown = (e: PointerEvent) => {
      const onIt = e.target instanceof Node && el.contains(e.target)
      dodge.current.swallowClick = false
      // no toque: o dedo que desce perto (fora dele) espanta o botão; o que desce em cima pega
      if (e.pointerType === 'touch') {
        if (!onIt) tryDodge(e.clientX, e.clientY, performance.now())
        return
      }
      // mouse rápido que chegou a apertar no meio do pulo: com fôlego, ainda escapa (e o clique não vale)
      if (onIt && tryDodge(e.clientX, e.clientY, performance.now(), true) === 'move') {
        e.preventDefault()
        dodge.current.swallowClick = true
      }
    }
    // o aperto que ele escapou não deixa o foco nele
    const onMouseDown = (e: MouseEvent) => {
      if (dodge.current.swallowClick) e.preventDefault()
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { capture: true })
    el.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown, { capture: true })
      el.removeEventListener('mousedown', onMouseDown)
    }
  }, [round, reduced])

  const style = {
    left: `calc(${HOME.left}px + var(--safe-left))`,
    bottom: `calc(${HOME.bottom}px + var(--safe-bottom))`,
    transform: `translate(${offset.x}px, ${offset.y}px)${tired ? ' rotate(-4deg)' : ''}`,
    transition: reduced || offset.duration === 0 ? 'none' : `transform ${offset.duration}ms ${SPRING}`,
  } as CSSProperties

  return (
    <button
      ref={button}
      type="button"
      onClick={() => {
        if (dodge.current.swallowClick) {
          dodge.current.swallowClick = false
          return
        }
        dispatchShow({ type: 'catch' })
      }}
      aria-label="Não clique aqui"
      style={style}
      className="fixed z-30 inline-flex h-11 items-center justify-center rounded-full border border-slate-400/30 bg-space/80 px-4 text-sm text-slate-300 shadow-[0_6px_18px_-8px_rgb(0_0_0/0.8)] backdrop-blur hover:border-neon/50 hover:text-neon pointer-fine:h-8 pointer-fine:px-3 pointer-fine:text-xs"
    >
      Não clique aqui
    </button>
  )
}
