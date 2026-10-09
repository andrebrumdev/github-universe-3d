import { describe, expect, it } from 'vitest'
import { fakeCanvas } from './fakeCanvas'
import { handleRequest, runJob } from './jobs'
import { createJobRunner, tracked, type WorkerLike } from './jobRunner'
import { isJobResponse, type JobRequest, type JobResponse, type SceneJob } from './protocol'

const repos = [
  { name: 'a', stars: 10, forks: 0, languageCount: 2 },
  { name: 'b', stars: 3, forks: 1, languageCount: 1 },
]
const layoutJob: SceneJob = { kind: 'layout', repos }

/** Worker falso: guarda os pedidos e responde quando o teste manda (em qualquer ordem). */
class FakeWorker implements WorkerLike {
  requests: JobRequest[] = []
  terminated = false
  private listeners: Record<string, ((e: { data?: unknown }) => void)[]> = {}
  postMessage(message: JobRequest): void {
    // o worker de verdade recebe uma cópia estruturada
    this.requests.push(structuredClone(message))
  }
  addEventListener(type: string, fn: (e: { data?: unknown }) => void): void {
    ;(this.listeners[type] ??= []).push(fn)
  }
  terminate(): void {
    this.terminated = true
  }
  emit(type: string, data?: unknown): void {
    for (const fn of this.listeners[type] ?? []) fn({ data })
  }
  /** Responde ao pedido `i` rodando a tarefa de verdade (como o worker faria). */
  answer(i: number): void {
    this.emit('message', structuredClone(handleRequest(this.requests[i], fakeCanvas().make).response))
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

function setup(worker: FakeWorker | null) {
  const local: SceneJob[] = []
  const runner = createJobRunner({
    createWorker: () => worker,
    loadLocal: async () => (job) => {
      local.push(job)
      return runJob(job, fakeCanvas().make).output
    },
  })
  return { runner, local }
}

describe('protocolo', () => {
  it('handleRequest devolve uma resposta válida, com o mesmo id', () => {
    const { response } = handleRequest({ id: 7, job: layoutJob }, fakeCanvas().make)
    expect(isJobResponse(response)).toBe(true)
    expect(response).toMatchObject({ id: 7, ok: true })
  })

  it('erro na tarefa vira ok: false (não derruba o worker)', () => {
    const bad = { kind: 'layout', repos: null } as unknown as SceneJob
    const { response } = handleRequest({ id: 3, job: bad }, fakeCanvas().make)
    expect(response.ok).toBe(false)
    expect(isJobResponse(response)).toBe(true)
  })

  it('isJobResponse recusa mensagens estranhas', () => {
    for (const v of [null, 1, 'x', {}, { id: 1 }, { id: 1.5, ok: true, output: 1 }, { id: 1, ok: false }, { id: 1, ok: true }]) {
      expect(isJobResponse(v)).toBe(false)
    }
    expect(isJobResponse({ id: 1, ok: true, output: null } satisfies JobResponse)).toBe(true)
  })
})

describe('createJobRunner', () => {
  it('com worker: a tarefa vai para ele e volta igual à da thread principal', async () => {
    const worker = new FakeWorker()
    const { runner, local } = setup(worker)
    const p = runner.run({ kind: 'layout', repos })
    expect(worker.requests).toHaveLength(1)
    worker.answer(0)
    expect(await p).toEqual(runJob(layoutJob, fakeCanvas().make).output)
    expect(local).toHaveLength(0)
    expect(runner.mode()).toBe('worker')
  })

  it('respostas fora de ordem vão cada uma para o seu pedido (pelo id)', async () => {
    const worker = new FakeWorker()
    const { runner } = setup(worker)
    const first = runner.run({ kind: 'layout', repos: repos.slice(0, 1) })
    const second = runner.run({ kind: 'layout', repos })
    worker.answer(1)
    worker.answer(0)
    expect((await first).system.orbits.map((o) => o.name)).toEqual(['a'])
    expect((await second).system.orbits.map((o) => o.name)).toEqual(['a', 'b'])
  })

  it('resposta repetida ou de id desconhecido é ignorada', async () => {
    const worker = new FakeWorker()
    const { runner } = setup(worker)
    const p = runner.run({ kind: 'layout', repos })
    worker.emit('message', { id: 999, ok: true, output: 'lixo' })
    worker.emit('message', 'não é resposta')
    worker.answer(0)
    worker.emit('message', { id: worker.requests[0].id, ok: true, output: 'atrasada' })
    expect((await p).system.orbits).toHaveLength(2)
  })

  it('sem worker (navegador antigo, testes): roda na thread principal', async () => {
    const { runner, local } = setup(null)
    expect(await runner.run({ kind: 'layout', repos })).toEqual(runJob(layoutJob, fakeCanvas().make).output)
    expect(local).toHaveLength(1)
    expect(runner.mode()).toBe('main')
  })

  it('tarefa que falha no worker é refeita na thread principal; o worker segue para as outras', async () => {
    const worker = new FakeWorker()
    const { runner, local } = setup(worker)
    const p = runner.run({ kind: 'layout', repos })
    worker.emit('message', { id: worker.requests[0].id, ok: false, error: 'sem OffscreenCanvas 2D' })
    expect((await p).system.orbits).toHaveLength(2)
    expect(local).toHaveLength(1)
    runner.run({ kind: 'layout', repos })
    expect(worker.requests).toHaveLength(2)
  })

  it('worker quebrado (script não carregou): pendentes e próximas vão para a thread principal', async () => {
    const worker = new FakeWorker()
    const { runner, local } = setup(worker)
    const pending = runner.run({ kind: 'layout', repos })
    worker.emit('error')
    expect((await pending).system.orbits).toHaveLength(2)
    expect(worker.terminated).toBe(true)
    expect(runner.mode()).toBe('main')
    await runner.run({ kind: 'layout', repos })
    expect(worker.requests).toHaveLength(1)
    expect(local).toHaveLength(2)
    // resposta atrasada do worker morto não resolve nada duas vezes
    worker.answer(0)
    await flush()
  })
})

describe('tracked', () => {
  it('marca status e valor quando assenta (o use() do React lê sem suspender de novo)', async () => {
    const t = tracked(Promise.resolve(5))
    expect(t.status).toBe('pending')
    await t
    await flush()
    expect(t).toMatchObject({ status: 'fulfilled', value: 5 })
  })

  it('erro fica como rejected', async () => {
    const t = tracked(Promise.reject(new Error('x')))
    await t.catch(() => undefined)
    await flush()
    expect(t).toMatchObject({ status: 'rejected', reason: new Error('x') })
  })
})
