import { useEffect, useRef, type CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { formatLine } from '@/lib/octocat/lines'
import { TUTORIAL_CARD } from '@/lib/uiLayout'
import { presentationRequested } from '@/lib/presentation'
import { shouldAutostartTutorial, TUTORIAL_COPY, TUTORIAL_STEPS, tutorialCardVisible } from '@/lib/tutorial'
import { usePresentation } from '@/store/presentation'
import { useSceneReady } from '@/store/sceneReady'
import { useTutorial } from '@/store/tutorial'
import { useUniverse } from '@/store/universe'

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
  const primary = useRef<HTMLButtonElement>(null)
  const reduced = useReducedMotion() ?? false
  const instant = { duration: 0 }
  const sceneReady = useSceneReady((s) => s.ready)
  // Com o painel ou a folha de uma seleção aberto, o cartão sai da tela (o passo "free" continua e volta depois).
  const selected = useUniverse((s) => s.selection.kind !== 'none')
  const visible = tutorialCardVisible(step, selected)

  useEffect(() => {
    // Só depois do primeiro quadro da cena; com a apresentação pedida no link (ou já rodando), não abre por cima dela.
    if (!shouldAutostartTutorial({ done: tutorialDone(), presentationRequested: presentationRequested(window.location.search), sceneReady })) return
    const timer = window.setTimeout(() => {
      if (!usePresentation.getState().state) start()
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [start, sceneReady])

  useEffect(() => {
    if (step) wasActive.current = true
    else if (wasActive.current) markTutorialDone()
  }, [step])

  useEffect(() => {
    // Escondido atrás de um painel, o Esc é do painel.
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Fase de captura: só o tutorial reage ao Esc (o painel lateral não fecha junto).
      e.stopImmediatePropagation()
      skip()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [visible, skip])

  useEffect(() => {
    if (visible) primary.current?.focus()
  }, [step, visible])

  return (
    <AnimatePresence>
      {visible && step && (
        <motion.section
          key="tutorial"
          aria-label="Tutorial"
          initial={{ opacity: 0, y: reduced ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={reduced ? instant : undefined}
          // Posição pelas medidas compartilhadas (uiLayout): a nave da escolta fica abaixo da borda de baixo do cartão.
          style={
            {
              '--card-inset': `${TUTORIAL_CARD.phoneInset}px`,
              '--card-bottom': `${TUTORIAL_CARD.phoneBottom}px`,
              '--card-right-md': `${TUTORIAL_CARD.desktopRight}px`,
              '--card-bottom-md': `${TUTORIAL_CARD.desktopBottom}px`,
              '--card-width-md': `${TUTORIAL_CARD.desktopWidth}px`,
            } as CSSProperties
          }
          className="fixed left-(--card-inset) right-(--card-inset) bottom-(--card-bottom) z-40 rounded-2xl border border-neon/40 bg-panel/95 p-4 text-sm shadow-xl backdrop-blur md:left-auto md:right-(--card-right-md) md:bottom-(--card-bottom-md) md:w-(--card-width-md)"
        >
          <p className="text-xs text-slate-400">
            {TUTORIAL_STEPS.indexOf(step) + 1}/{TUTORIAL_STEPS.length}
          </p>
          <div aria-live="polite" className="mt-1">
            <motion.p
              key={step}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={reduced ? instant : undefined}
              className="text-slate-100"
            >
              {formatLine(TUTORIAL_COPY[step], profileName)}
            </motion.p>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            {step !== 'free' && (
              <button type="button" onClick={skip} className="rounded-full px-3 py-1.5 text-slate-400 hover:text-slate-100">
                Pular tutorial
              </button>
            )}
            <button
              ref={primary}
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
