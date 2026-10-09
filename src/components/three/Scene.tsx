import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Stats } from '@react-three/drei'
import type { Universe } from '@/lib/types'
import { CAMERA_FAR, starfieldRadius } from '@/lib/cameraPoses'
import { WebGLContextLostError } from '@/lib/sceneError'
import { buildOrbits } from '@/lib/universe/orbits'
import { bodyExtent, MAX_MOONS, maxPlanetWeight, planetRadius } from '@/lib/universe/planets'
import { useBloomEnabled } from '@/hooks/useBloomEnabled'
import { FINE_POINTER_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { canvasDpr } from '@/lib/renderBudget'
import { useBloom } from '@/store/bloom'
import { missCanvas } from '@/store/presentation'
import { useSceneReady } from '@/store/sceneReady'
import { preToneMapped } from './acesBackground'
import { CameraRig } from './CameraRig'
import { Comets } from './Comets'
import { ShipRig } from './octocat/ShipRig'
import { OrbitLines } from './OrbitLines'
import { Planet } from './Planet'
import { PlanetGlowDriver } from './PlanetGlowDriver'
import { RenderInfo } from './RenderInfo'
import { SimClockDriver } from './SimClockDriver'
import { Sun } from './Sun'
import { Starfield } from './Starfield'
import { Trojans } from './Trojans'

const BLOOM_OFF_WARNING = '[bloom] desligado: o pós-processamento não carregou; a cena segue sem bloom'
const NoBloom = () => null

/**
 * O bloom (e a lib de pós-processamento) só baixa quando monta: celular e tablet nunca pagam por ele. Se o pedaço não
 * baixa (offline, hash velho depois de um deploy), fica sem bloom: o import que falha vira um componente vazio, sem
 * erro (o R3F reportaria até um erro pego por uma boundary como erro da página).
 */
const GlowBloom = lazy(() =>
  import('./GlowEffects').then(
    (m) => ({ default: m.GlowBloom }),
    (error: unknown) => {
      console.warn(BLOOM_OFF_WARNING, error)
      return { default: NoBloom }
    },
  ),
)

/**
 * O bloom é enfeite: se ele lança ao montar ou depois, fica sem ele e a cena segue (sem esta boundary, o erro subiria
 * até o SceneBoundary e trocaria a cena inteira pelo aviso). O visual com bloom só liga dentro do GlowBloom montado,
 * então aqui ele fica no sem bloom, ou volta para ele: desmontar o GlowBloom desliga o visual no mesmo commit.
 */
class BloomBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  componentDidCatch(error: unknown): void {
    console.warn(BLOOM_OFF_WARNING, error)
  }
  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

const SHOW_STATS = new URLSearchParams(window.location.search).has('perf')
/** Igual ao fundo da página (index.css). */
const BACKGROUND = '#03050d'
/** Com o bloom, o fundo passa pelo ACES do ToneMapping: entra pré-compensado para sair o mesmo BACKGROUND. */
const BACKGROUND_BLOOM = preToneMapped(BACKGROUND)

/** Avisa quando o navegador derruba o contexto WebGL do canvas (GPU reiniciada, aba em segundo plano no celular). */
function ContextLossWatcher({ onLost }: { onLost: () => void }) {
  const canvas = useThree((s) => s.gl.domElement)
  useEffect(() => {
    canvas.addEventListener('webglcontextlost', onLost)
    return () => canvas.removeEventListener('webglcontextlost', onLost)
  }, [canvas, onLost])
  return null
}

/** Marca a cena como pronta no primeiro quadro (e desfaz ao desmontar, no "Tentar de novo"). */
function SceneReadySignal() {
  const setReady = useSceneReady((s) => s.setReady)
  const signaled = useRef(false)
  useFrame(() => {
    if (signaled.current) return
    signaled.current = true
    setReady(true)
  })
  useEffect(() => () => setReady(false), [setReady])
  return null
}

export function Scene({ universe }: { universe: Universe }) {
  // Contexto perdido: a cena lança e o SceneBoundary do App mostra o aviso com "Tentar de novo" (que remonta o canvas).
  const [contextLost, setContextLost] = useState(false)
  const onContextLost = useCallback(() => setContextLost(true), [])
  const system = useMemo(() => {
    // tamanho relativo ao próprio perfil: o repo de maior peso fica com o raio máximo
    const maxWeight = maxPlanetWeight(universe.repos)
    return buildOrbits(
      universe.repos.map((r) => {
        const radius = planetRadius(r.stars, r.forks, maxWeight)
        // o espaçamento reserva o planeta com as luas (uma por linguagem, até MAX_MOONS)
        // repo com forks ganha troianos em L4/L5: o anel abre espaço para as nuvens
        return { name: r.name, radius, extent: bodyExtent(radius, Math.min(MAX_MOONS, r.languages.length)), trojans: r.forks > 0 }
      }),
    )
  }, [universe.repos])
  // a casca de estrelas cresce com o sistema (só muda quando o sistema muda)
  const starRadius = useMemo(() => starfieldRadius(system), [system])
  const bloom = useBloomEnabled()
  // O fundo segue o bloom que de fato montou: se o remendo do shader falhar, o GlowBloom não monta e não há ACES.
  const bloomActive = useBloom((s) => s.active)
  // Segue o bloom que de fato montou: se o pedaço dele não carregar, a cena fica sem bloom e com o DPR de sempre.
  const dpr = canvasDpr(useMediaQuery(FINE_POINTER_QUERY), bloomActive)
  if (contextLost) throw new WebGLContextLostError()

  return (
    <Canvas dpr={dpr} camera={{ position: [0, 40, 70], fov: 50, near: 0.1, far: CAMERA_FAR }} onPointerMissed={missCanvas}>
      {bloomActive ? <color attach="background" args={BACKGROUND_BLOOM} /> : <color attach="background" args={[BACKGROUND]} />}
      <ContextLossWatcher onLost={onContextLost} />
      <SceneReadySignal />
      <ambientLight intensity={0.25} />
      <hemisphereLight args={['#9bd8ff', '#1a2350', 0.2]} />
      <Starfield radius={starRadius} />
      <SimClockDriver />
      <PlanetGlowDriver />
      <Sun system={system} repos={universe.repos} />
      <OrbitLines rings={system.rings} />
      {system.orbits.map((orbit, i) => (
        <Planet key={orbit.name} repo={universe.repos[i]} ring={system.rings[orbit.ring]} orbit={orbit} />
      ))}
      <Trojans system={system} repos={universe.repos} />
      <Comets system={system} repos={universe.repos} />
      <CameraRig system={system} repos={universe.repos} />
      <ShipRig system={system} repos={universe.repos} />
      {bloom && (
        <BloomBoundary>
          <Suspense fallback={null}>
            <GlowBloom />
          </Suspense>
        </BloomBoundary>
      )}
      {SHOW_STATS && <Stats />}
      {SHOW_STATS && <RenderInfo />}
    </Canvas>
  )
}
