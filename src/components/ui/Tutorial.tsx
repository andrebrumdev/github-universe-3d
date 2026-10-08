import { useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
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
  const primary = useRef<HTMLButtonElement>(null)
  const reduced = useReducedMotion() ?? false
  const instant = { duration: 0 }

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
      if (e.key !== 'Escape') return
      // Fase de captura: só o tutorial reage ao Esc (o painel lateral não fecha junto).
      e.stopImmediatePropagation()
      skip()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [step, skip])

  useEffect(() => {
    if (step) primary.current?.focus()
  }, [step])

  return (
    <AnimatePresence>
      {step && (
        <motion.section
          key="tutorial"
          aria-label="Tutorial"
          initial={{ opacity: 0, y: reduced ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={reduced ? instant : undefined}
          className="fixed inset-x-4 bottom-36 z-40 rounded-2xl border border-neon/40 bg-panel/95 p-4 text-sm shadow-xl backdrop-blur md:inset-x-auto md:bottom-56 md:right-4 md:w-[340px]"
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
