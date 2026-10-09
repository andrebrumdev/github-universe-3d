import { handleRequest } from './jobs'
import type { JobRequest } from './protocol'

// Worker da cena: recebe tarefas (protocol.ts), roda a mesma função da thread principal e devolve só dados.
self.addEventListener('message', (event: MessageEvent<JobRequest>) => {
  const { response, transfer } = handleRequest(event.data)
  self.postMessage(response, { transfer })
})
