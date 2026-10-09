import type { RepoBase } from '@/lib/types'
import type { SystemLayout } from '@/lib/universe/systemLayout'
import { createJobRunner, tracked, type JobRunner, type Tracked, type WorkerLike } from './jobRunner'

/** O que a cena precisa antes do primeiro quadro, calculado fora da thread principal. */
export interface SceneAssets {
  layout: SystemLayout
}

/** Worker só onde dá para pintar nele (OffscreenCanvas); senão tudo roda na thread principal, como antes. */
function sceneWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null
  return new Worker(new URL('./scene.worker.ts', import.meta.url), { type: 'module', name: 'cena' }) as WorkerLike
}

let runner: JobRunner | null = null
function jobs(): JobRunner {
  runner ??= createJobRunner({
    createWorker: sceneWorker,
    loadLocal: () => import('./jobs').then((m) => (job) => m.runJob(job).output),
  })
  return runner
}

const scenes = new WeakMap<readonly RepoBase[], Tracked<SceneAssets>>()

/**
 * Começa (uma vez por lista de repos) tudo o que a cena calcula antes do primeiro quadro. Chamado assim que os
 * dados chegam (useUniverseData), em paralelo com o download do pedaço 3D; a Scene espera o resultado com `use()`
 * atrás do Loader.
 */
export function prepareScene(repos: readonly RepoBase[]): Tracked<SceneAssets> {
  let scene = scenes.get(repos)
  if (!scene) {
    const layout = jobs().run({
      kind: 'layout',
      repos: repos.map((r) => ({ name: r.name, stars: r.stars, forks: r.forks, languageCount: r.languages.length })),
    })
    scene = tracked(layout.then((l) => ({ layout: l })))
    scenes.set(repos, scene)
  }
  return scene
}
