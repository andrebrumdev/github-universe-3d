import { planetPixels } from '@/components/three/grid'
import { moonPixels } from '@/components/three/moonPaint'
import { paintSunFaceRegions } from '@/components/three/sunFacePixels'
import type { MakeCanvas } from '@/components/three/texturePixels'
import { layoutSystem, planetSlots } from '@/lib/universe/systemLayout'
import type { JobRequest, JobResponse, SceneJob } from './protocol'

export interface JobResult {
  output: unknown
  /** Buffers que vão por transferência (sem cópia) no postMessage. */
  transfer: Transferable[]
}

/**
 * Executa uma tarefa da cena. Pura: o worker (com OffscreenCanvas) e o caminho sem worker (thread principal, com o
 * canvas do DOM) chamam esta mesma função, então os pixels saem do mesmo desenho.
 */
export function runJob(job: SceneJob, makeCanvas: MakeCanvas): JobResult {
  switch (job.kind) {
    case 'layout':
      return { output: layoutSystem(planetSlots(job.repos)), transfer: [] }
    case 'planet': {
      const pixels = planetPixels(job.weeks, makeCanvas)
      return { output: pixels, transfer: [pixels.buffer] }
    }
    case 'moon': {
      const pixels = moonPixels(job.language, job.color, makeCanvas)
      return { output: pixels, transfer: [pixels.buffer] }
    }
    case 'sunFaces': {
      const regions = paintSunFaceRegions(makeCanvas)
      return { output: regions, transfer: Object.values(regions).map((r) => r.buffer) }
    }
  }
}

/** Pedido → resposta; um erro vira `ok: false` (quem pediu refaz a tarefa na thread principal). */
export function handleRequest(request: JobRequest, makeCanvas: MakeCanvas): { response: JobResponse; transfer: Transferable[] } {
  try {
    const { output, transfer } = runJob(request.job, makeCanvas)
    return { response: { id: request.id, ok: true, output }, transfer }
  } catch (err) {
    return { response: { id: request.id, ok: false, error: err instanceof Error ? err.message : String(err) }, transfer: [] }
  }
}
