import { lazy, Suspense, useCallback, useState } from 'react'
import { ActivityTooltip } from '@/components/ui/ActivityTooltip'
import { BackButton } from '@/components/ui/BackButton'
import { LoadError } from '@/components/ui/LoadError'
import { Loader } from '@/components/ui/Loader'
import { OctocatSpeech } from '@/components/ui/OctocatSpeech'
import { PlanetPanel } from '@/components/ui/PlanetPanel'
import { PresentationButton } from '@/components/ui/PresentationButton'
import { PresentationCard } from '@/components/ui/PresentationCard'
import { ProfilePanel } from '@/components/ui/ProfilePanel'
import { SceneBoundary } from '@/components/ui/SceneBoundary'
import { StaticFallback } from '@/components/ui/StaticFallback'
import { Tutorial } from '@/components/ui/Tutorial'
import { TutorialButton } from '@/components/ui/TutorialButton'
import { useSafeAreaSync } from '@/hooks/useSafeAreaSync'
import { useUniverseData } from '@/hooks/useUniverseData'
import { supportsWebGL } from '@/hooks/webgl'
import { useSceneReady } from '@/store/sceneReady'

const Scene = lazy(() => import('@/components/three/Scene').then((m) => ({ default: m.Scene })))

export function App() {
  const { state, retry } = useUniverseData()
  const [webgl] = useState(supportsWebGL)
  // "Tentar de novo" do SceneBoundary: uma key nova remonta a cena (canvas e contexto WebGL novos).
  const [sceneAttempt, setSceneAttempt] = useState(0)
  const retryScene = useCallback(() => setSceneAttempt((n) => n + 1), [])
  const sceneReady = useSceneReady((s) => s.ready)
  useSafeAreaSync()

  if (state.status === 'error') return <LoadError message={state.message} onRetry={retry} />
  if (state.status === 'loading') return <Loader />
  if (!webgl) return <StaticFallback universe={state.universe} />
  const { universe } = state

  return (
    <SceneBoundary key={sceneAttempt} universe={universe} onRetry={retryScene}>
      <main className="fixed inset-0 overflow-hidden bg-space text-slate-100">
        <Suspense fallback={null}>
          <Scene universe={universe} />
        </Suspense>
        {/* Até o primeiro quadro da cena (o pedaço do 3D pode demorar numa rede lenta), o Loader cobre tudo. */}
        {!sceneReady && <Loader />}
        <ActivityTooltip />
        <BackButton />
        <PlanetPanel universe={universe} />
        <ProfilePanel profile={universe.profile} />
        <OctocatSpeech profileName={universe.profile.name} />
        {/* na ordem em que aparecem na tela (da esquerda para a direita) */}
        <PresentationButton universe={universe} />
        <TutorialButton />
        <Tutorial profileName={universe.profile.name} />
        <PresentationCard universe={universe} />
      </main>
    </SceneBoundary>
  )
}
