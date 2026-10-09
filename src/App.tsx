import { lazy, Suspense, useState } from 'react'
import { ActivityTooltip } from '@/components/ui/ActivityTooltip'
import { BackButton } from '@/components/ui/BackButton'
import { LoadError } from '@/components/ui/LoadError'
import { Loader } from '@/components/ui/Loader'
import { OctocatSpeech } from '@/components/ui/OctocatSpeech'
import { PlanetPanel } from '@/components/ui/PlanetPanel'
import { PresentationButton } from '@/components/ui/PresentationButton'
import { PresentationCard } from '@/components/ui/PresentationCard'
import { ProfilePanel } from '@/components/ui/ProfilePanel'
import { StaticFallback } from '@/components/ui/StaticFallback'
import { Tutorial } from '@/components/ui/Tutorial'
import { TutorialButton } from '@/components/ui/TutorialButton'
import { useUniverseData } from '@/hooks/useUniverseData'
import { supportsWebGL } from '@/hooks/webgl'

const Scene = lazy(() => import('@/components/three/Scene').then((m) => ({ default: m.Scene })))

export function App() {
  const { state, retry } = useUniverseData()
  const [webgl] = useState(supportsWebGL)

  if (state.status === 'error') return <LoadError message={state.message} onRetry={retry} />
  if (state.status === 'loading') return <Loader />
  if (!webgl) return <StaticFallback universe={state.universe} />
  const { universe } = state

  return (
    <main className="fixed inset-0 overflow-hidden bg-space text-slate-100">
      <Suspense fallback={<Loader />}>
        <Scene universe={universe} />
      </Suspense>
      <ActivityTooltip />
      <BackButton />
      <PlanetPanel universe={universe} />
      <ProfilePanel profile={universe.profile} />
      <OctocatSpeech profileName={universe.profile.name} />
      <TutorialButton />
      <PresentationButton universe={universe} />
      <Tutorial profileName={universe.profile.name} />
      <PresentationCard universe={universe} />
    </main>
  )
}
