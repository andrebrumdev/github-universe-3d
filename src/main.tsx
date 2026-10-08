import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

const OctocatPreview = lazy(() => import('./preview/OctocatPreview').then((m) => ({ default: m.OctocatPreview })))
const showOctocatPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'octocat'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showOctocatPreview ? (
      <Suspense fallback={null}>
        <OctocatPreview />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
