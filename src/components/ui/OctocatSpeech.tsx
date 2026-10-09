import { useCallback, useEffect, useRef } from 'react'
import { useIdle } from '@/hooks/useIdle'
import { steerBubble } from '@/lib/bubblePlacement'
import { panelSelection } from '@/lib/interaction'
import { formatLine, LINE_DURATION_MS } from '@/lib/octocat/lines'
import { backButtonRect, isSheetLayout, safeArea, sidePanelWidth, UI_GAP } from '@/lib/uiLayout'
import { usePresentation } from '@/store/presentation'
import { shipPose } from '@/store/shipPose'
import { useTutorial } from '@/store/tutorial'
import { useUniverse } from '@/store/universe'

/**
 * Controla a duração das falas, espelha-as para leitores de tela e desenha o balão visível preso à nave
 * (a nave escreve em `shipPose` o ponto da tela onde ele se apoia). DOM comum, na árvore principal: o `Html`
 * do drei cria uma raiz React por balão e montar/desmontar essa raiz a cada fala quebrava.
 */
export function OctocatSpeech({ profileName }: { profileName: string }) {
  const bubble = useUniverse((s) => s.bubble)
  const dismissBubble = useUniverse((s) => s.dismissBubble)
  const emitGuide = useUniverse((s) => s.emitGuide)

  // Assistindo à apresentação ou lendo o tutorial, ficar parado é o esperado: nada de "Oi, tá aí?".
  const onIdle = useCallback((kind: 'idle' | 'longIdle') => {
    if (!usePresentation.getState().state && useTutorial.getState().step === null) emitGuide(kind)
  }, [emitGuide])
  useIdle(onIdle)
  const balloon = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (!bubble) return
    const timer = window.setTimeout(() => dismissBubble(bubble.seq), LINE_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [bubble, dismissBubble])

  // Segue a nave a cada quadro enquanto há fala (sem re-render do React).
  useEffect(() => {
    if (!bubble) return
    let frame = 0
    const follow = () => {
      const el = balloon.current
      if (el) {
        // Dentro da tela e, com o painel lateral (ou o cartão da apresentação, na mesma coluna) aberto no desktop,
        // à esquerda dele (senão o painel corta o balão).
        const half = el.offsetWidth / 2
        const { selection } = useUniverse.getState()
        // o "← Galáxia" aparece com qualquer seleção (também no modo de foco na nave); a coluna, só com o painel
        const selected = selection.kind !== 'none'
        const presenting = usePresentation.getState().state !== null
        const columnBusy = panelSelection(selection) || presenting
        const { innerWidth: W, innerHeight: H } = window
        const panelOpen = columnBusy && !isSheetLayout(W, H)
        const maxX = W - UI_GAP - half - (panelOpen ? sidePanelWidth(W) : safeArea.right)
        // longe do alvo na tela (planeta ou sol: no celular cobria a borda do sol), depois dentro da tela
        const a = shipPose.speechAvoid
        const steered = steerBubble(shipPose.speechX, shipPose.speechY, el.offsetWidth, el.offsetHeight, a.on ? a : null)
        const x = Math.max(UI_GAP + safeArea.left + half, Math.min(maxX, steered.x))
        // O balão sobe a partir do ponto (translate −100%): o topo dele não sai da tela nem passa por baixo do
        // "← Galáxia" (que aparece com uma seleção, fora da apresentação).
        const h = el.offsetHeight
        let minY = UI_GAP + safeArea.top + h
        const back = backButtonRect()
        if (selected && !presenting && x - half < back.x + back.w + UI_GAP) minY = Math.max(minY, back.y + back.h + UI_GAP + h)
        const y = Math.max(minY, steered.y)
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`
        el.style.visibility = shipPose.speechOnScreen ? 'visible' : 'hidden'
      }
      frame = requestAnimationFrame(follow)
    }
    follow()
    return () => cancelAnimationFrame(frame)
  }, [bubble])

  const text = bubble ? formatLine(bubble.line.text, profileName) : ''
  return (
    <>
      <div aria-live="polite" className="sr-only">
        {/* chave por fala: a mesma frase repetida vira um nó novo e é anunciada de novo */}
        {bubble && <span key={bubble.seq}>{text}</span>}
      </div>
      {bubble && (
        // Abaixo dos painéis (z-20) e do tutorial; o texto já chega aos leitores de tela pelo espelho acima.
        <p
          ref={balloon}
          aria-hidden="true"
          style={{ visibility: 'hidden' }}
          className="pointer-events-none fixed left-0 top-0 z-[15] w-max max-w-[220px] rounded-2xl border border-neon/30 bg-space/90 px-4 py-2 text-sm text-slate-100 shadow-lg"
        >
          {text}
        </p>
      )}
    </>
  )
}
