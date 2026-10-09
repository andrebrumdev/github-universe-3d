import { describe, expect, it, vi } from 'vitest'
import { SUN_FACE_VARIANTS } from '@/components/three/sunFacePixels'
import { buildSampleUniverse } from '@/lib/github/sample'
import { MAX_MOONS } from '@/lib/universe/planets'
import { fakeCanvas } from './fakeCanvas'
import type { JobRunner } from './jobRunner'
import { runJob } from './jobs'
import type { SceneJob } from './protocol'
import { createSceneAssets } from './sceneAssets'

const flush = () => new Promise((r) => setTimeout(r, 0))
// ícones das luas: o Node não tem Path2D (o canvas falso aceita qualquer coisa)
vi.stubGlobal('Path2D', class {})

/** Executor falso: roda a tarefa de verdade, mas só responde quando o teste solta (`release`), na ordem que quiser. */
function deferredRunner() {
  const jobs: SceneJob[] = []
  const waiting: { job: SceneJob; resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = []
  const runner: JobRunner = {
    run: ((job: SceneJob) =>
      new Promise<unknown>((resolve, reject) => {
        jobs.push(job)
        waiting.push({ job, resolve, reject })
      })) as JobRunner['run'],
    mode: () => 'worker',
  }
  const release = (pick: (job: SceneJob) => boolean = () => true, fail = false) => {
    for (const w of waiting.filter((w) => pick(w.job))) {
      waiting.splice(waiting.indexOf(w), 1)
      if (fail) w.reject(new Error('falhou'))
      else w.resolve(runJob(w.job, fakeCanvas().make).output)
    }
  }
  return { runner, jobs, release, waiting }
}

const universe = buildSampleUniverse()

describe('prepareScene', () => {
  it('pede tudo de uma vez: órbitas, um planeta por repo, cada lua (linguagem e cor) uma vez só, e os rostos do sol', () => {
    const { runner, jobs } = deferredRunner()
    createSceneAssets(runner).prepareScene(universe.repos)
    const moons = new Set(universe.repos.flatMap((r) => r.languages.slice(0, MAX_MOONS).map((l) => `${l.name}|${l.color}`)))
    expect(jobs.filter((j) => j.kind === 'layout')).toHaveLength(1)
    expect(jobs.filter((j) => j.kind === 'planet')).toHaveLength(universe.repos.length)
    expect(jobs.filter((j) => j.kind === 'moon')).toHaveLength(moons.size)
    expect(jobs.filter((j) => j.kind === 'sunFaces')).toHaveLength(1)
  })

  it('a mesma lista de repos não pede de novo (Scene e useUniverseData dividem o pedido)', () => {
    const { runner, jobs } = deferredRunner()
    const assets = createSceneAssets(runner)
    const a = assets.prepareScene(universe.repos)
    const n = jobs.length
    expect(assets.prepareScene(universe.repos)).toBe(a)
    expect(jobs).toHaveLength(n)
  })

  it('as órbitas ficam prontas sozinhas (o canvas monta enquanto o worker pinta)', async () => {
    const { runner, release } = deferredRunner()
    const scene = createSceneAssets(runner).prepareScene(universe.repos)
    release((j) => j.kind === 'layout')
    await flush()
    expect(scene.layout.status).toBe('fulfilled')
    expect(scene.textures.status).toBe('pending')
  })

  it('as texturas só ficam prontas quando TODAS chegaram (nenhum planeta sem textura depois do Loader)', async () => {
    const { runner, release } = deferredRunner()
    const scene = createSceneAssets(runner).prepareScene(universe.repos)
    release((j) => j.kind !== 'planet')
    await flush()
    expect(scene.textures.status).toBe('pending')
    // os planetas chegam fora de ordem
    release((j) => j.kind === 'planet' && j.weeks === universe.repos[3].activity.weeks)
    await flush()
    expect(scene.textures.status).toBe('pending')
    release()
    await flush()
    expect(scene.textures.status).toBe('fulfilled')
  })

  it('cada planeta pega os pixels dele uma vez (depois do upload, um novo upload pinta na thread principal)', async () => {
    const { runner, release } = deferredRunner()
    const assets = createSceneAssets(runner)
    const weeks = universe.repos[0].activity.weeks
    expect(assets.takePlanetPixels(weeks)).toBeNull()
    const scene = assets.prepareScene(universe.repos)
    release()
    await scene.textures
    const pixels = assets.takePlanetPixels(weeks)
    expect(pixels).toBeInstanceOf(Uint8Array)
    expect(assets.takePlanetPixels(weeks)).toBeNull()
    expect(assets.takePlanetPixels([[1]])).toBeNull()
  })

  it('luas e rostos do sol ficam à mão depois de pronta', async () => {
    const { runner, release } = deferredRunner()
    const assets = createSceneAssets(runner)
    const [lang] = universe.repos[0].languages
    expect(assets.sunFaceRegion('happy:open')).toBeNull()
    const scene = assets.prepareScene(universe.repos)
    release()
    await scene.textures
    expect(assets.takeMoonPixels(lang.name, lang.color)).toBeInstanceOf(Uint8Array)
    expect(assets.takeMoonPixels(lang.name, lang.color)).toBeNull()
    for (const v of SUN_FACE_VARIANTS) expect(assets.sunFaceRegion(v.key)).toBeInstanceOf(Uint8Array)
  })

  it('uma textura que falha não segura a cena: fica para a thread principal pintar na hora', async () => {
    const { runner, release } = deferredRunner()
    const assets = createSceneAssets(runner)
    const scene = assets.prepareScene(universe.repos)
    release((j) => j.kind === 'planet', true)
    release()
    await expect(scene.textures).resolves.toBeUndefined()
    expect((await scene.layout).system.orbits).toHaveLength(universe.repos.length)
    expect(assets.takePlanetPixels(universe.repos[0].activity.weeks)).toBeNull()
  })

  it('as órbitas falhando derrubam a cena (o SceneBoundary mostra o erro)', async () => {
    const { runner, release } = deferredRunner()
    const scene = createSceneAssets(runner).prepareScene(universe.repos)
    release((j) => j.kind === 'layout', true)
    release()
    await expect(scene.layout).rejects.toThrow('falhou')
    await expect(scene.textures).resolves.toBeUndefined()
  })

  it('cada textura avisa quando os pixels dela chegaram (o primeiro upload espera), sem esperar as outras', async () => {
    const { runner, release } = deferredRunner()
    const assets = createSceneAssets(runner)
    const [a, b] = universe.repos
    expect(assets.planetReady(a.activity.weeks)).toBeNull()
    const scene = assets.prepareScene(universe.repos)
    let aReady = false
    void assets.planetReady(a.activity.weeks)!.then(() => (aReady = true))
    release((j) => j.kind === 'planet' && j.weeks === a.activity.weeks)
    await flush()
    expect(aReady).toBe(true)
    // os pixels já estão guardados quando o aviso chega
    expect(assets.takePlanetPixels(a.activity.weeks)).toBeInstanceOf(Uint8Array)
    expect(assets.takePlanetPixels(b.activity.weeks)).toBeNull()
    expect(scene.textures.status).toBe('pending')
    const [lang] = b.languages
    expect(assets.moonReady(lang.name, lang.color)).toBeInstanceOf(Promise)
    expect(assets.sunReady()).toBeInstanceOf(Promise)
  })

  it('o worker pinta o sol primeiro, depois os planetas, depois as luas', () => {
    const { runner, jobs } = deferredRunner()
    createSceneAssets(runner).prepareScene(universe.repos)
    const kinds = jobs.map((j) => j.kind)
    expect(kinds[0]).toBe('layout')
    expect(kinds[1]).toBe('sunFaces')
    expect(kinds.lastIndexOf('planet')).toBeLessThan(kinds.indexOf('moon'))
  })
})
