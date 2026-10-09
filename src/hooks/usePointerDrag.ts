import { useCallback, useEffect, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { newPointerDrag, stepPointerDrag, type DragInput, type DragOutput } from '@/lib/pointerDrag'
import { acquireCameraLock, releaseCameraLock, type CameraLockOwner } from '@/store/cameraLock'
import { othersDown, pointersDown } from '@/store/pointers'
import { COARSE_POINTER_QUERY, useMediaQuery } from './useMediaQuery'

export interface PointerDragHandlers {
  /** O arrasto começou (a trava da câmera já está pega). `time` em ms. */
  onStart?: (time: number) => void
  /** Arrastando: deslocamento (px) desde o último movimento. */
  onMove?: (dx: number, dy: number, time: number) => void
  /** A peça largou o gesto: soltou (`fling`, com embalo) ou perdeu o ponteiro / virou pinça (sem embalo). */
  onStop?: (fling: boolean, time: number) => void
  /** Foi um toque (soltou rápido, sem andar). */
  onTap?: (x: number, y: number, time: number) => void
}

/**
 * Arrasto de uma peça da cena (lib/pointerDrag) ligado ao DOM e à trava da câmera com dono (store/cameraLock):
 * `begin` no `onPointerDown` da peça pega a trava na hora e captura o ponteiro; o resto do gesto vem da janela.
 * Encerra (soltando a trava, só do dono) em pointerup, pointercancel, lostpointercapture, blur, aba escondida e menu de
 * contexto. Não para a propagação do evento nativo: o CameraControls e os relógios de inatividade continuam vendo.
 */
export function usePointerDrag(owner: CameraLockOwner, handlers: PointerDragHandlers) {
  const coarse = useMediaQuery(COARSE_POINTER_QUERY)
  const drag = useRef(newPointerDrag())
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })
  const detach = useRef<(() => void) | null>(null)

  const dispatch = useCallback(
    (out: DragOutput, x: number, y: number, time: number) => {
      const h = latest.current
      const finish = () => {
        detach.current?.()
        detach.current = null
        releaseCameraLock(owner)
      }
      switch (out.kind) {
        case 'move':
          h.onMove?.(out.dx, out.dy, time)
          return
        case 'release':
          finish()
          h.onStop?.(true, time)
          if (out.tap) h.onTap?.(x, y, time)
          return
        case 'abort':
          finish()
          h.onStop?.(false, time)
          return
        case 'pinch':
          // a peça larga já; a trava (só o giro de um ponteiro) fica até o último dedo sair: a pinça aproxima
          h.onStop?.(false, time)
          return
        case 'end':
          finish()
      }
    },
    [owner],
  )

  const step = useCallback(
    (input: DragInput, x = 0, y = 0) => dispatch(stepPointerDrag(drag.current, input), x, y, performance.now()),
    [dispatch],
  )

  /** Larga o gesto em curso sem embalo (saiu do modo, ficou tonto). */
  const abort = useCallback(() => step({ type: 'interrupt' }), [step])

  const begin = useCallback(
    (e: ThreeEvent<PointerEvent>): boolean => {
      const n = e.nativeEvent
      const time = performance.now()
      const out = stepPointerDrag(drag.current, {
        type: 'down',
        pointerId: n.pointerId,
        pointerType: n.pointerType,
        button: n.button,
        isPrimary: n.isPrimary,
        othersDown: othersDown(n.pointerId),
        coarse,
        x: n.clientX,
        y: n.clientY,
        time,
      })
      if (out.kind !== 'start') return false
      if (!acquireCameraLock(owner)) {
        // outra peça já está com a câmera: este aperto não é dela
        stepPointerDrag(drag.current, { type: 'interrupt' })
        return false
      }
      const target = n.target instanceof Element ? n.target : null
      const id = n.pointerId
      try {
        target?.setPointerCapture(id)
      } catch {
        // ponteiro já solto (o evento chegou atrasado): o resto do gesto vem da janela do mesmo jeito
      }
      const onMove = (ev: PointerEvent) =>
        step({ type: 'move', pointerId: ev.pointerId, x: ev.clientX, y: ev.clientY, buttons: ev.buttons, time: performance.now() })
      const onUp = (ev: PointerEvent) =>
        step({ type: 'up', pointerId: ev.pointerId, x: ev.clientX, y: ev.clientY, time: performance.now(), remaining: pointersDown() }, ev.clientX, ev.clientY)
      const onCancel = (ev: PointerEvent) => step({ type: 'cancel', pointerId: ev.pointerId, remaining: pointersDown() })
      // um segundo ponteiro (outro dedo): pinça, da câmera
      const onDown = (ev: PointerEvent) =>
        step({
          type: 'down',
          pointerId: ev.pointerId,
          pointerType: ev.pointerType,
          button: ev.button,
          isPrimary: ev.isPrimary,
          othersDown: othersDown(ev.pointerId),
          coarse,
          x: ev.clientX,
          y: ev.clientY,
          time: performance.now(),
        })
      const onInterrupt = () => step({ type: 'interrupt' })
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') onInterrupt()
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
      window.addEventListener('pointerdown', onDown, { capture: true })
      window.addEventListener('blur', onInterrupt)
      window.addEventListener('contextmenu', onInterrupt)
      document.addEventListener('visibilitychange', onVisibility)
      target?.addEventListener('lostpointercapture', onCancel as EventListener)
      detach.current = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        window.removeEventListener('pointerdown', onDown, { capture: true })
        window.removeEventListener('blur', onInterrupt)
        window.removeEventListener('contextmenu', onInterrupt)
        document.removeEventListener('visibilitychange', onVisibility)
        target?.removeEventListener('lostpointercapture', onCancel as EventListener)
        try {
          if (target?.hasPointerCapture(id)) target.releasePointerCapture(id)
        } catch {
          // já solto
        }
      }
      latest.current.onStart?.(time)
      return true
    },
    [coarse, owner, step],
  )

  // desmontando no meio de um gesto: solta a trava e os ouvintes
  useEffect(() => () => abort(), [abort])

  return { begin, abort }
}
