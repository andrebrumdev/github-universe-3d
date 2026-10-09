import { Component, type ReactNode } from 'react'
import { supportsWebGL } from '@/hooks/webgl'
import { retryMode, sceneErrorMessage, sceneFallback, type SceneFallback } from '@/lib/sceneError'
import type { Universe } from '@/lib/types'
import { LoadError } from './LoadError'
import { StaticFallback } from './StaticFallback'

interface SceneBoundaryProps {
  universe: Universe
  /** Remonta a cena (o App troca a `key` deste limite). */
  onRetry: () => void
  children: ReactNode
}

interface SceneBoundaryState {
  error: unknown
  fallback: SceneFallback | null
}

/**
 * Limite de erro em volta da cena 3D e da interface por cima dela: o pedaço do 3D que não baixou, o WebGLRenderer
 * que não criou o contexto, o contexto perdido e qualquer erro no render caem aqui, e não numa página vazia.
 * Sem WebGL, a versão em lista; no resto, o aviso com "Tentar de novo" (ver `lib/sceneError`).
 */
export class SceneBoundary extends Component<SceneBoundaryProps, SceneBoundaryState> {
  state: SceneBoundaryState = { error: null, fallback: null }

  static getDerivedStateFromError(error: unknown): SceneBoundaryState {
    return { error, fallback: sceneFallback(error, supportsWebGL()) }
  }

  private retry = () => {
    if (retryMode(this.state.error) === 'reload') window.location.reload()
    else this.props.onRetry()
  }

  render() {
    const { fallback, error } = this.state
    if (fallback === 'list') return <StaticFallback universe={this.props.universe} />
    if (fallback === 'retry') return <LoadError message={sceneErrorMessage(error)} onRetry={this.retry} />
    return this.props.children
  }
}
