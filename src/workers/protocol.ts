import type { SunFaceRegions } from '@/components/three/sunFacePixels'
import type { LayoutRepo, SystemLayout } from '@/lib/universe/systemLayout'

/**
 * Protocolo do worker da cena: cada tarefa tem entrada e saída só de dados (atravessam o postMessage). A mesma
 * função (`runJob`, em jobs.ts) roda no worker e, sem ele, na thread principal.
 */
export interface JobMap {
  /** Tamanhos, órbitas e casca de estrelas (`planetSlots` + `layoutSystem`). */
  layout: { input: { repos: LayoutRepo[] }; output: SystemLayout }
  /** Superfície do planeta: grade de cor + brilho no alfa, RGBA de baixo para cima (`planetPixels`). */
  planet: { input: { weeks: number[][] }; output: Uint8Array }
  /** Lua de uma linguagem (`moonPixels`). */
  moon: { input: { language: string; color: string }; output: Uint8Array }
  /** Todos os rostos do sol, só o pedaço do rosto (`paintSunFaceRegions`). */
  sunFaces: { input: object; output: SunFaceRegions }
}

export type JobKind = keyof JobMap
export type SceneJob = { [K in JobKind]: { kind: K } & JobMap[K]['input'] }[JobKind]
export type JobOf<K extends JobKind> = Extract<SceneJob, { kind: K }>
export type JobOutput<K extends JobKind> = JobMap[K]['output']

export interface JobRequest {
  id: number
  job: SceneJob
}

export type JobResponse = { id: number; ok: true; output: unknown } | { id: number; ok: false; error: string }

/** Resposta bem formada do worker (qualquer outra mensagem é ignorada). */
export function isJobResponse(value: unknown): value is JobResponse {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'number' || !Number.isInteger(v.id)) return false
  if (v.ok === true) return 'output' in v
  return v.ok === false && typeof v.error === 'string'
}
