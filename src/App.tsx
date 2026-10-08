import { useState } from 'react'
import { LoadError } from '@/components/ui/LoadError'
import { Loader } from '@/components/ui/Loader'
import { StaticFallback } from '@/components/ui/StaticFallback'
import { useUniverseData } from '@/hooks/useUniverseData'
import { supportsWebGL } from '@/hooks/webgl'

export function App() {
  const { state, retry } = useUniverseData()
  const [webgl] = useState(supportsWebGL)

  if (state.status === 'error') return <LoadError message={state.message} onRetry={retry} />
  if (state.status === 'loading') return <Loader />
  if (!webgl) return <StaticFallback universe={state.universe} />
  return (
    <main className="fixed inset-0 grid place-items-center bg-space text-slate-300">
      {state.universe.repos.length} planetas carregados
    </main>
  )
}
