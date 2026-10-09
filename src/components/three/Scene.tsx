import { useCallback, useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Stats } from '@react-three/drei'
import type { Universe } from '@/lib/types'
import { CAMERA_FAR, starfieldRadius } from '@/lib/cameraPoses'
import { WebGLContextLostError } from '@/lib/sceneError'
import { buildOrbits } from '@/lib/universe/orbits'
import { bodyExtent, MAX_MOONS, maxPlanetWeight, planetRadius } from '@/lib/universe/planets'
import { useBloomEnabled } from '@/hooks/useBloomEnabled'
import { missCanvas } from '@/store/presentation'
import { preToneMapped } from './acesBackground'
import { CameraRig } from './CameraRig'
import { Comets } from './Comets'
import { GlowBloom, PlanetGlowDriver } from './GlowEffects'
import { ShipRig } from './octocat/ShipRig'
import { OrbitLines } from './OrbitLines'
import { Planet } from './Planet'
import { SimClockDriver } from './SimClockDriver'
import { Sun } from './Sun'
import { Starfield } from './Starfield'
import { Trojans } from './Trojans'

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
  if (contextLost) throw new WebGLContextLostError()

  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 40, 70], fov: 50, near: 0.1, far: CAMERA_FAR }} onPointerMissed={missCanvas}>
      {bloom ? <color attach="background" args={BACKGROUND_BLOOM} /> : <color attach="background" args={[BACKGROUND]} />}
      <ContextLossWatcher onLost={onContextLost} />
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
      <ShipRig system={system} repos={universe.repos} profileName={universe.profile.name} />
      {bloom && <GlowBloom />}
      {SHOW_STATS && <Stats />}
    </Canvas>
  )
}
