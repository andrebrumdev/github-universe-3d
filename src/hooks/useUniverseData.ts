import { useEffect, useState } from 'react'
import { loadUniverse, UniverseLoadError } from '@/data/loadUniverse'
import type { Universe } from '@/lib/types'
import { prepareScene } from '@/workers/sceneAssets'

export type DataState =
  | { status: 'loading' }
  | { status: 'ready'; universe: Universe }
  | { status: 'error'; message: string }

export function useUniverseData(): { state: DataState; retry: () => void } {
  const [state, setState] = useState<DataState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    loadUniverse()
      .then((universe) => {
        if (!alive) return
        // o worker da cena começa já, em paralelo com o download do pedaço 3D
        prepareScene(universe.repos)
        setState({ status: 'ready', universe })
      })
      .catch((err: unknown) => {
        if (!alive) return
        const message = err instanceof UniverseLoadError ? err.message : 'Não foi possível carregar os dados. Verifique sua conexão.'
        setState({ status: 'error', message })
      })
    return () => {
      alive = false
    }
  }, [attempt])

  return {
    state,
    retry: () => {
      setState({ status: 'loading' })
      setAttempt((a) => a + 1)
    },
  }
}
