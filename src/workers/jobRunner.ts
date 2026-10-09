import { isJobResponse, type JobKind, type JobOf, type JobOutput, type JobRequest, type SceneJob } from './protocol'

/** O pedaço do `Worker` que o executor usa (o teste passa um falso). */
export interface WorkerLike {
  postMessage(message: JobRequest, transfer: Transferable[]): void
  addEventListener(type: 'message' | 'error' | 'messageerror', listener: (event: { data?: unknown }) => void): void
  terminate(): void
}

/** Executor da thread principal: a mesma `runJob` do worker, carregada sob demanda. */
export type LocalRunner = (job: SceneJob) => unknown

export interface JobRunnerOptions {
  /** null: sem worker (navegador antigo, testes) — tudo roda na thread principal. */
  createWorker: () => WorkerLike | null
  loadLocal: () => Promise<LocalRunner>
}

export interface JobRunner {
  run<K extends JobKind>(job: JobOf<K>): Promise<JobOutput<K>>
  /** Onde as tarefas rodam agora. */
  mode(): 'worker' | 'main'
}

interface Pending {
  job: SceneJob
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

/**
 * Manda tarefas ao worker e casa cada resposta com o pedido pelo id (a ordem de chegada não importa; resposta
 * repetida ou desconhecida é ignorada). Sem worker, ou com ele quebrado (o script não carregou), a tarefa roda na
 * thread principal com a mesma função; uma tarefa que falha no worker (sem OffscreenCanvas 2D, por exemplo) também.
 */
export function createJobRunner({ createWorker, loadLocal }: JobRunnerOptions): JobRunner {
  let worker: WorkerLike | null = null
  let broken = false
  let started = false
  let nextId = 1
  const pending = new Map<number, Pending>()
  let local: Promise<LocalRunner> | null = null

  const runLocal = (job: SceneJob): Promise<unknown> => (local ??= loadLocal()).then((run) => run(job))

  const settleLocally = (p: Pending) => runLocal(p.job).then(p.resolve, p.reject)

  const breakWorker = () => {
    if (broken) return
    broken = true
    worker?.terminate()
    worker = null
    const left = [...pending.values()]
    pending.clear()
    for (const p of left) void settleLocally(p)
  }

  const ensureWorker = (): WorkerLike | null => {
    if (!started) {
      started = true
      try {
        worker = createWorker()
      } catch {
        worker = null
      }
      if (!worker) broken = true
      worker?.addEventListener('message', ({ data }) => {
        if (!isJobResponse(data)) return
        const p = pending.get(data.id)
        if (!p) return
        pending.delete(data.id)
        if (data.ok) p.resolve(data.output)
        else void settleLocally(p)
      })
      worker?.addEventListener('error', breakWorker)
      worker?.addEventListener('messageerror', breakWorker)
    }
    return broken ? null : worker
  }

  return {
    run<K extends JobKind>(job: JobOf<K>): Promise<JobOutput<K>> {
      const w = ensureWorker()
      if (!w) return runLocal(job) as Promise<JobOutput<K>>
      return new Promise<JobOutput<K>>((resolve, reject) => {
        const id = nextId++
        pending.set(id, { job, resolve: resolve as (v: unknown) => void, reject })
        try {
          w.postMessage({ id, job }, [])
        } catch {
          // dado que não clona: não dá para mandar ao worker, roda aqui
          pending.delete(id)
          void settleLocally({ job, resolve: resolve as (v: unknown) => void, reject })
        }
      })
    },
    mode: () => (ensureWorker() ? 'worker' : 'main'),
  }
}

/** Promise com o estado à vista: o `use()` do React lê `status`/`value` e não suspende de novo quando já assentou. */
export type Tracked<T> = Promise<T> & ({ status: 'pending' } | { status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown })

export function tracked<T>(promise: Promise<T>): Tracked<T> {
  const t = Object.assign(promise, { status: 'pending' }) as Tracked<T>
  // os handlers não devolvem nada: devolver `t` faria a promise derivada adotar a rejeição (e ela ficaria sem dono)
  promise.then(
    (value) => void Object.assign(t, { status: 'fulfilled', value }),
    (reason: unknown) => void Object.assign(t, { status: 'rejected', reason }),
  )
  return t
}
