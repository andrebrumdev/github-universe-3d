import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { Stats } from '@react-three/drei'
import type { Universe } from '@/lib/types'
import { buildOrbits } from '@/lib/universe/orbits'
import { planetRadius } from '@/lib/universe/planets'
import { useUniverse } from '@/store/universe'
import { CameraRig } from './CameraRig'
import { OrbitLines } from './OrbitLines'
import { Planet } from './Planet'
import { SimClockDriver } from './SimClockDriver'
import { Starfield } from './Starfield'

const SHOW_STATS = new URLSearchParams(window.location.search).has('perf')

export function Scene({ universe }: { universe: Universe }) {
  const clearSelection = useUniverse((s) => s.clearSelection)
  const system = useMemo(
    () => buildOrbits(universe.repos.map((r) => ({ name: r.name, radius: planetRadius(r.stars, r.forks) }))),
    [universe.repos],
  )

  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 40, 70], fov: 50, near: 0.1, far: 1000 }} onPointerMissed={clearSelection}>
      <color attach="background" args={['#0a0e27']} />
      <ambientLight intensity={0.25} />
      <pointLight position={[0, 0, 0]} decay={0} intensity={2.2} color="#e0fbff" />
      <Starfield />
      <SimClockDriver />
      <OrbitLines rings={system.rings} />
      {system.orbits.map((orbit, i) => (
        <Planet key={orbit.name} repo={universe.repos[i]} ring={system.rings[orbit.ring]} orbit={orbit} />
      ))}
      <CameraRig system={system} />
      {SHOW_STATS && <Stats />}
    </Canvas>
  )
}
