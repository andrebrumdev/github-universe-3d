import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { Stats } from '@react-three/drei'
import type { Universe } from '@/lib/types'
import { CAMERA_FAR, starfieldRadius } from '@/lib/cameraPoses'
import { buildOrbits } from '@/lib/universe/orbits'
import { bodyExtent, MAX_MOONS, maxPlanetWeight, planetRadius } from '@/lib/universe/planets'
import { useBloomEnabled } from '@/hooks/useBloomEnabled'
import { useUniverse } from '@/store/universe'
import { preToneMapped } from './acesBackground'
import { CameraRig } from './CameraRig'
import { GlowBloom, PlanetGlowDriver } from './GlowEffects'
import { ShipRig } from './octocat/ShipRig'
import { OrbitLines } from './OrbitLines'
import { Planet } from './Planet'
import { SimClockDriver } from './SimClockDriver'
import { Sun } from './Sun'
import { Starfield } from './Starfield'

const SHOW_STATS = new URLSearchParams(window.location.search).has('perf')
/** Igual ao fundo da página (index.css). */
const BACKGROUND = '#03050d'
/** Com o bloom, o fundo passa pelo ACES do ToneMapping: entra pré-compensado para sair o mesmo BACKGROUND. */
const BACKGROUND_BLOOM = preToneMapped(BACKGROUND)

export function Scene({ universe }: { universe: Universe }) {
  const clearSelection = useUniverse((s) => s.clearSelection)
  const system = useMemo(() => {
    // tamanho relativo ao próprio perfil: o repo de maior peso fica com o raio máximo
    const maxWeight = maxPlanetWeight(universe.repos)
    return buildOrbits(
      universe.repos.map((r) => {
        const radius = planetRadius(r.stars, r.forks, maxWeight)
        // o espaçamento reserva o planeta com as luas (uma por linguagem, até MAX_MOONS)
        return { name: r.name, radius, extent: bodyExtent(radius, Math.min(MAX_MOONS, r.languages.length)) }
      }),
    )
  }, [universe.repos])
  // a casca de estrelas cresce com o sistema (só muda quando o sistema muda)
  const starRadius = useMemo(() => starfieldRadius(system), [system])
  const bloom = useBloomEnabled()

  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 40, 70], fov: 50, near: 0.1, far: CAMERA_FAR }} onPointerMissed={clearSelection}>
      {bloom ? <color attach="background" args={BACKGROUND_BLOOM} /> : <color attach="background" args={[BACKGROUND]} />}
      <ambientLight intensity={0.25} />
      <hemisphereLight args={['#9bd8ff', '#1a2350', 0.2]} />
      <Starfield radius={starRadius} />
      <SimClockDriver />
      <PlanetGlowDriver />
      <Sun />
      <OrbitLines rings={system.rings} />
      {system.orbits.map((orbit, i) => (
        <Planet key={orbit.name} repo={universe.repos[i]} ring={system.rings[orbit.ring]} orbit={orbit} />
      ))}
      <CameraRig system={system} repos={universe.repos} />
      <ShipRig system={system} repos={universe.repos} profileName={universe.profile.name} />
      {bloom && <GlowBloom />}
      {SHOW_STATS && <Stats />}
    </Canvas>
  )
}
