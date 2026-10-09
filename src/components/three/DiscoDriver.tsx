import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { classifyGesture, isTypingTarget, KONAMI_KEYS, KONAMI_TOUCH, keyToken, matchStep, TOUCH_GAP_MS } from '@/lib/easter/konami'
import { EASTER_LINES } from '@/lib/octocat/lines'
import { discoBlockedNow, dispatchDisco, konami, useDisco } from '@/store/disco'
import { useUniverse } from '@/store/universe'

/**
 * Modo disco (easter egg): escuta o Konami Code e anda a linha do tempo da festa (lib/easter/disco) a cada quadro.
 * - Teclado: ↑ ↑ ↓ ↓ ← → ← → B A em qualquer lugar da página, menos digitando num campo.
 * - Celular: no canvas, deslizar ↑ ↑ ↓ ↓ ← → ← → com um dedo e tocar duas vezes (o B e o A), sem passar de
 *   TOUCH_GAP_MS entre um gesto e outro. A câmera orbita junto com os deslizes, mas ida e volta se anulam.
 * Ao acender, o Octocat anuncia (a dança é da nave, a festa do sol, dos fachos e da chuva).
 */
export function DiscoDriver() {
  const canvas = useThree((s) => s.gl.domElement)

  useEffect(() => {
    let index = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingTarget(e.target instanceof HTMLElement ? e.target : null)) return
      const token = keyToken(e.key)
      if (token === null) return
      const step = matchStep(KONAMI_KEYS, index, token)
      index = step.index
      if (step.fired) konami()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    let index = 0
    let last = -Infinity
    /** Dedos na tela agora (início de cada um); com dois ou mais, é pinça: não conta. */
    const down = new Map<number, { x: number; y: number; t: number }>()
    let pinch = false
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      down.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp })
      if (down.size > 1) pinch = true
    }
    const onUp = (e: PointerEvent) => {
      const start = down.get(e.pointerId)
      if (!start) return
      down.delete(e.pointerId)
      if (pinch) {
        if (down.size === 0) pinch = false
        return
      }
      const gesture = classifyGesture(e.clientX - start.x, e.clientY - start.y, e.timeStamp - start.t)
      if (gesture === null) return
      if (e.timeStamp - last > TOUCH_GAP_MS) index = 0
      last = e.timeStamp
      const step = matchStep(KONAMI_TOUCH, index, gesture)
      index = step.index
      if (step.fired) konami()
    }
    const onCancel = (e: PointerEvent) => {
      down.delete(e.pointerId)
      if (down.size === 0) pinch = false
    }
    canvas.addEventListener('pointerdown', onDown)
    // o fim do gesto pode cair fora do canvas (a câmera captura o ponteiro): ouve na janela
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [canvas])

  // acendeu (ou saiu da fila): o Octocat anuncia
  const seq = useDisco((s) => s.seq)
  useEffect(() => {
    if (seq === 0 || useDisco.getState().phase !== 'on') return
    const lines = EASTER_LINES.disco
    useUniverse.getState().say(lines[seq === 1 ? 0 : 1], 'happy')
  }, [seq])

  useFrame((_, dt) => dispatchDisco({ type: 'tick', dt, blocked: discoBlockedNow() }))
  return null
}
