import { offscreenCanvas, type MakeCanvas } from '@/components/three/texturePixels'
import { handleRequest } from './jobs'
import type { JobRequest } from './protocol'

/** Pintar aqui só com canvas 2D no worker; sem ele, a tarefa responde erro e a thread principal pinta. */
const canPaint = typeof OffscreenCanvas !== 'undefined' && new OffscreenCanvas(1, 1).getContext('2d') !== null
const makeCanvas: MakeCanvas = (width, height) => {
  if (!canPaint) throw new Error('OffscreenCanvas 2D indisponível no worker')
  return offscreenCanvas(width, height)
}

// Worker da cena: recebe tarefas (protocol.ts), roda a mesma função da thread principal e devolve só dados, com os
// buffers dos pixels transferidos (sem cópia).
self.addEventListener('message', (event: MessageEvent<JobRequest>) => {
  const { response, transfer } = handleRequest(event.data, makeCanvas)
  self.postMessage(response, { transfer })
})
