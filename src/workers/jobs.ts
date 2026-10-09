import { layoutSystem, planetSlots } from '@/lib/universe/systemLayout'
import type { JobRequest, JobResponse, SceneJob } from './protocol'

export interface JobResult {
  output: unknown
  /** Buffers que vão por transferência (sem cópia) no postMessage. */
  transfer: Transferable[]
}

/** Executa uma tarefa da cena. Pura: o worker e o caminho sem worker (thread principal) chamam esta mesma função. */
export function runJob(job: SceneJob): JobResult {
  switch (job.kind) {
    case 'layout':
      return { output: layoutSystem(planetSlots(job.repos)), transfer: [] }
  }
}

/** Pedido → resposta; um erro vira `ok: false` (quem pediu refaz a tarefa na thread principal). */
export function handleRequest(request: JobRequest): { response: JobResponse; transfer: Transferable[] } {
  try {
    const { output, transfer } = runJob(request.job)
    return { response: { id: request.id, ok: true, output }, transfer }
  } catch (err) {
    return { response: { id: request.id, ok: false, error: err instanceof Error ? err.message : String(err) }, transfer: [] }
  }
}
