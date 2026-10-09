import type { SunFaceRegions } from '@/components/three/sunFacePixels'
import type { RepoBase } from '@/lib/types'
import { MAX_MOONS } from '@/lib/universe/planets'
import type { SystemLayout } from '@/lib/universe/systemLayout'
import { createJobRunner, tracked, type JobRunner, type Tracked, type WorkerLike } from './jobRunner'

/** O que a cena precisa antes do primeiro quadro, calculado fora da thread principal. */
export interface SceneJobs {
  /** Órbitas e casca de estrelas: a Scene monta o canvas assim que chegam. */
  layout: Tracked<SystemLayout>
  /**
   * Superfícies dos planetas, luas e rostos do sol: pintadas enquanto o canvas monta e compila os materiais (que
   * esperam o primeiro upload, ver `planetReady`); o sinal de pronto (que tira o Loader) espera por todas. Nunca
   * rejeita: uma textura que falha fica para a thread principal pintar na hora.
   */
  textures: Tracked<void>
}

type SceneRepo = Pick<RepoBase, 'name' | 'stars' | 'forks' | 'languages'> & { activity: { weeks: number[][] } }

export interface SceneAssetStore {
  /**
   * Começa (uma vez por lista de repos) tudo o que a cena calcula antes do primeiro quadro: órbitas, a superfície de
   * cada planeta, cada lua e os rostos do sol (ver SceneJobs).
   */
  prepareScene(repos: readonly SceneRepo[]): SceneJobs
  /** Assenta quando os pixels do planeta chegaram (ou falharam); null se ninguém os pediu (sem `prepareScene`). */
  planetReady(weeks: number[][]): Promise<void> | null
  /** Idem, da lua. */
  moonReady(language: string, color: string): Promise<void> | null
  /** Idem, dos rostos do sol. */
  sunReady(): Promise<void> | null
  /** Pixels do planeta vindos do worker, uma vez só (o upload os solta; um upload novo pinta na thread principal). */
  takePlanetPixels(weeks: number[][]): Uint8Array | null
  /** Idem, da lua da linguagem. */
  takeMoonPixels(language: string, color: string): Uint8Array | null
  /** Pedaço do rosto do sol (`faceKey`) pré-pintado no worker; fica guardado (as trocas copiam dele). */
  sunFaceRegion(key: string): Uint8Array | null
}

const moonKey = (language: string, color: string) => `${language}|${color}`

export function createSceneAssets(runner: JobRunner): SceneAssetStore {
  const scenes = new WeakMap<readonly SceneRepo[], SceneJobs>()
  const planets = new WeakMap<number[][], Uint8Array>()
  const planetsReady = new WeakMap<number[][], Promise<void>>()
  const moons = new Map<string, Uint8Array>()
  const moonsReady = new Map<string, Promise<void>>()
  let sunFaces: SunFaceRegions | null = null
  let sunReady: Promise<void> | null = null
  // textura que falha fica sem pixels guardados: o componente pinta na thread principal, como antes
  const optional = <T>(p: Promise<T>, keep: (value: T) => void): Promise<void> => p.then(keep).catch(() => undefined)

  return {
    prepareScene(repos) {
      let scene = scenes.get(repos)
      if (scene) return scene
      const layout = runner.run({
        kind: 'layout',
        repos: repos.map((r) => ({ name: r.name, stars: r.stars, forks: r.forks, languageCount: r.languages.length })),
      })
      // o worker atende na ordem: o sol (pequeno, já na primeira tela) antes dos planetas e das luas
      sunReady ??= optional(runner.run({ kind: 'sunFaces' }), (faces) => void (sunFaces = faces))
      const textures: Promise<void>[] = [sunReady]
      for (const r of repos) {
        const weeks = r.activity.weeks
        const ready = optional(runner.run({ kind: 'planet', weeks }), (px) => void planets.set(weeks, px))
        planetsReady.set(weeks, ready)
        textures.push(ready)
      }
      for (const r of repos) {
        for (const { name, color } of r.languages.slice(0, MAX_MOONS)) {
          const key = moonKey(name, color)
          if (moonsReady.has(key)) continue
          const ready = optional(runner.run({ kind: 'moon', language: name, color }), (px) => void moons.set(key, px))
          moonsReady.set(key, ready)
          textures.push(ready)
        }
      }
      scene = { layout: tracked(layout), textures: tracked(Promise.all(textures).then(() => undefined)) }
      scenes.set(repos, scene)
      return scene
    },
    planetReady: (weeks) => planetsReady.get(weeks) ?? null,
    moonReady: (language, color) => moonsReady.get(moonKey(language, color)) ?? null,
    sunReady: () => sunReady,
    takePlanetPixels(weeks) {
      const px = planets.get(weeks) ?? null
      planets.delete(weeks)
      return px
    },
    takeMoonPixels(language, color) {
      const key = moonKey(language, color)
      const px = moons.get(key) ?? null
      moons.delete(key)
      return px
    },
    sunFaceRegion: (key) => sunFaces?.[key] ?? null,
  }
}

/** Worker só onde dá para pintar nele (OffscreenCanvas); senão tudo roda na thread principal, como antes. */
function sceneWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null
  return new Worker(new URL('./scene.worker.ts', import.meta.url), { type: 'module', name: 'cena' }) as WorkerLike
}

let store: SceneAssetStore | null = null
/** O depósito da página: um worker só, criado no primeiro pedido. */
function sceneAssets(): SceneAssetStore {
  store ??= createSceneAssets(
    createJobRunner({
      createWorker: sceneWorker,
      loadLocal: () =>
        Promise.all([import('./jobs'), import('@/components/three/texturePixels')]).then(([jobs, px]) => (job) => jobs.runJob(job, px.domCanvas).output),
    }),
  )
  return store
}

/**
 * Chamado assim que os dados chegam (useUniverseData), em paralelo com o download do pedaço 3D; a Scene espera os
 * resultados com `use()` atrás do Loader.
 */
export const prepareScene = (repos: readonly SceneRepo[]) => sceneAssets().prepareScene(repos)
export const planetReady = (weeks: number[][]) => sceneAssets().planetReady(weeks)
export const moonReady = (language: string, color: string) => sceneAssets().moonReady(language, color)
export const sunReady = () => sceneAssets().sunReady()
export const takePlanetPixels = (weeks: number[][]) => sceneAssets().takePlanetPixels(weeks)
export const takeMoonPixels = (language: string, color: string) => sceneAssets().takeMoonPixels(language, color)
export const sunFaceRegion = (key: string) => sceneAssets().sunFaceRegion(key)
