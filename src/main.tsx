import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

// Só no dev: no build o ramo some e o pedaço do preview nem é gerado.
const OctocatPreview = import.meta.env.DEV ? lazy(() => import('./preview/OctocatPreview').then((m) => ({ default: m.OctocatPreview }))) : null
const showOctocatPreview = new URLSearchParams(window.location.search).get('preview') === 'octocat'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {OctocatPreview && showOctocatPreview ? (
      <Suspense fallback={null}>
        <OctocatPreview />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
