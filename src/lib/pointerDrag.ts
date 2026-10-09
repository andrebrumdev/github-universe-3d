/**
 * Arrasto de um ponteiro sobre uma peça da cena (girar a nave no modo de foco, girar o sol), como máquina pura: quem
 * usa traduz os eventos do DOM em `DragInput` e age pela saída. Regras:
 * - Só começa com o ponteiro primário, o botão esquerdo (ou o dedo/caneta) e nenhum outro ponteiro já na tela.
 * - Segue um ponteiro só (`pointerId`): movimentos e solturas de outro não contam.
 * - Dentro da folga é indeciso; passou dela, é arrasto. Soltou rápido sem andar: toque.
 * - Fim perdido (pointercancel, lostpointercapture, blur, aba escondida, menu de contexto, ou um movimento sem botão
 *   apertado): encerra sem embalo (`abort`).
 * - Um segundo ponteiro no meio: a peça larga o gesto na hora (`pinch`, sem embalo); ele fica com a câmera (a pinça
 *   aproxima) e só acaba (`end`) quando todos os ponteiros saem, para um dedo que sobra não girar nem orbitar.
 * Mutável no lugar. Puro, imports relativos.
 */
import { TAP_MAX_MS, tapSlop } from './ship/focusGesture'

export type DragPhase = 'idle' | 'pending' | 'drag' | 'pinch'

export interface PointerDrag {
  phase: DragPhase
  pointerId: number
  coarse: boolean
  x0: number
  y0: number
  lastX: number
  lastY: number
  /** ms (a hora do aperto). */
  startTime: number
}

export type DragInput =
  | {
      type: 'down'
      pointerId: number
      pointerType: string
      button: number
      isPrimary: boolean
      /** Outros ponteiros já apertados na tela agora. */
      othersDown: number
      coarse: boolean
      x: number
      y: number
      time: number
    }
  | { type: 'move'; pointerId: number; x: number; y: number; buttons: number; time: number }
  /** `remaining`: ponteiros ainda apertados depois desta soltura. */
  | { type: 'up'; pointerId: number; x: number; y: number; time: number; remaining: number }
  /** pointercancel ou lostpointercapture. */
  | { type: 'cancel'; pointerId: number; remaining: number }
  /** blur da janela, aba escondida, menu de contexto. */
  | { type: 'interrupt' }

export type DragOutput =
  | { kind: 'none' }
  /** Começou: pegue a trava da câmera e a peça. */
  | { kind: 'start' }
  /** Arrastando: o deslocamento desde o último movimento (px). */
  | { kind: 'move'; dx: number; dy: number }
  /** Soltou: o giro continua com o embalo; `tap` se foi um toque. Solte a trava. */
  | { kind: 'release'; tap: boolean }
  /** Fim perdido: pare o giro sem embalo e solte a trava. */
  | { kind: 'abort' }
  /** Segundo ponteiro: pare o giro sem embalo; a trava fica (só tira o giro de um ponteiro) até `end`. */
  | { kind: 'pinch' }
  /** A pinça acabou: solte a trava. */
  | { kind: 'end' }

const NONE: DragOutput = { kind: 'none' }

export function newPointerDrag(): PointerDrag {
  return { phase: 'idle', pointerId: -1, coarse: false, x0: 0, y0: 0, lastX: 0, lastY: 0, startTime: 0 }
}

/** Toque: soltou dentro da folga e rápido. */
export function isTap(distPx: number, elapsedMs: number, coarse: boolean): boolean {
  return distPx <= tapSlop(coarse) && elapsedMs <= TAP_MAX_MS
}

function toIdle(d: PointerDrag): void {
  d.phase = 'idle'
  d.pointerId = -1
}

export function stepPointerDrag(d: PointerDrag, e: DragInput): DragOutput {
  switch (e.type) {
    case 'down': {
      if (d.phase === 'idle') {
        const mainButton = e.pointerType !== 'mouse' || e.button === 0
        if (!e.isPrimary || !mainButton || e.othersDown > 0) return NONE
        Object.assign(d, { phase: 'pending', pointerId: e.pointerId, coarse: e.coarse, x0: e.x, y0: e.y, lastX: e.x, lastY: e.y, startTime: e.time })
        return { kind: 'start' }
      }
      if (d.phase === 'pinch' || e.pointerId === d.pointerId) return NONE
      d.phase = 'pinch'
      return { kind: 'pinch' }
    }
    case 'move': {
      if ((d.phase !== 'pending' && d.phase !== 'drag') || e.pointerId !== d.pointerId) return NONE
      if ((e.buttons & 1) === 0) {
        toIdle(d)
        return { kind: 'abort' }
      }
      if (d.phase === 'pending') {
        if (Math.hypot(e.x - d.x0, e.y - d.y0) <= tapSlop(d.coarse)) return NONE
        d.phase = 'drag'
      }
      const out: DragOutput = { kind: 'move', dx: e.x - d.lastX, dy: e.y - d.lastY }
      d.lastX = e.x
      d.lastY = e.y
      return out
    }
    case 'up':
    case 'cancel': {
      if (d.phase === 'pinch') {
        if (e.remaining > 0) return NONE
        toIdle(d)
        return { kind: 'end' }
      }
      if (d.phase === 'idle' || e.pointerId !== d.pointerId) return NONE
      if (e.type === 'cancel') {
        toIdle(d)
        return { kind: 'abort' }
      }
      const tap = d.phase === 'pending' && isTap(Math.hypot(e.x - d.x0, e.y - d.y0), e.time - d.startTime, d.coarse)
      toIdle(d)
      return { kind: 'release', tap }
    }
    case 'interrupt': {
      if (d.phase === 'idle') return NONE
      const wasPinch = d.phase === 'pinch'
      toIdle(d)
      return { kind: wasPinch ? 'end' : 'abort' }
    }
  }
}
