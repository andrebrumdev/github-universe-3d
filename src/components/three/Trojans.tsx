import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { RockGeometry } from 'three-low-poly'
import { formatCount } from '@/lib/format'
import type { Repo } from '@/lib/types'
import type { OrbitSystem, Vec3 } from '@/lib/universe/orbits'
import { seededRandom } from '@/lib/universe/random'
import { systemTrojans, trojanPosition } from '@/lib/universe/trojans'
import { simClock } from '@/store/simClock'

/** Rocha low-poly compartilhada, normalizada para raio 1 (a escala da instância é o raio da rocha). */
const ROCK_GEOMETRY = (() => {
  const g = new RockGeometry({ seed: 11, radius: 1, widthSegments: 5, heightSegments: 4 })
  g.computeBoundingSphere()
  const r = g.boundingSphere?.radius ?? 1
  return g.scale(1 / r, 1 / r, 1 / r)
})()
const ROCK_MATERIAL = new THREE.MeshStandardMaterial({ color: '#7d7062', roughness: 0.95, flatShading: true })

interface Hover {
  index: number
  name: string
  forks: number
}

/**
 * Troianos de todos os planetas com forks, num InstancedMesh só: rochas nos pontos L4/L5 da órbita, com libração
 * lenta. Matrizes atualizadas por frame sem alocar; o giro das rochas segue o relógio da simulação.
 */
export function Trojans({ system, repos }: { system: OrbitSystem; repos: Repo[] }) {
  const trojans = useMemo(() => systemTrojans(system, repos.map((r) => r.forks)), [system, repos])
  // giro próprio de cada rocha: eixo inicial e velocidade (rad/s de simulação)
  const tumble = useMemo(() => {
    const rng = seededRandom('trojan-tumble')
    return trojans.map(() => ({ x: rng() * 6.3, y: rng() * 6.3, z: rng() * 6.3, speed: 0.2 + rng() * 0.6 }))
  }, [trojans])
  const mesh = useRef<THREE.InstancedMesh>(null)
  const label = useRef<THREE.Group>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const hoverIndex = useRef(-1)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const pos = useMemo<Vec3>(() => [0, 0, 0], [])
  const canHover = useMemo(() => typeof window !== 'undefined' && !window.matchMedia('(hover: none)').matches, [])

  useEffect(() => {
    hoverIndex.current = hover?.index ?? -1
  }, [hover])

  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const t = simClock.time
    for (let i = 0; i < trojans.length; i++) {
      const tr = trojans[i]
      trojanPosition(system, tr, t, pos)
      const spin = tumble[i]
      dummy.position.set(pos[0], pos[1], pos[2])
      dummy.rotation.set(spin.x + spin.speed * t, spin.y, spin.z + 0.5 * spin.speed * t)
      dummy.scale.setScalar(tr.size)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      if (i === hoverIndex.current) label.current?.position.set(pos[0], pos[1], pos[2])
    }
    m.instanceMatrix.needsUpdate = true
    // as rochas andam: a esfera de colisão do raycast precisa acompanhar
    if (canHover) m.computeBoundingSphere()
  })

  if (trojans.length === 0) return null

  function handleOver(e: ThreeEvent<PointerEvent>) {
    if (!canHover || e.instanceId === undefined) return
    e.stopPropagation()
    const tr = trojans[e.instanceId]
    const repo = repos[tr.planet]
    if (repo && hover?.index !== e.instanceId) setHover({ index: e.instanceId, name: repo.name, forks: repo.forks })
  }

  return (
    <>
      <instancedMesh
        ref={mesh}
        args={[ROCK_GEOMETRY, ROCK_MATERIAL, trojans.length]}
        frustumCulled={false}
        onPointerOver={handleOver}
        onPointerMove={handleOver}
        onPointerOut={() => setHover(null)}
      />
      <group ref={label}>
        {hover && (
          <Html zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
            <div style={{ transform: 'translate(-50%, calc(-100% - 10px))' }}>
              <div role="tooltip" className="whitespace-nowrap rounded-lg border border-neon/40 bg-panel/95 px-2.5 py-1.5 text-xs text-slate-200 shadow-lg shadow-black/40">
                ⑂ {formatCount(hover.forks)} {hover.forks === 1 ? 'fork' : 'forks'} · <span className="text-neon">{hover.name}</span>
              </div>
            </div>
          </Html>
        )}
      </group>
    </>
  )
}
