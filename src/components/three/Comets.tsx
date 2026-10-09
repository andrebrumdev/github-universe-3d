import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useCursor } from '@react-three/drei'
import * as THREE from 'three'
import { GlowHalo, randomTransformVertices } from 'three-low-poly'
import type { Repo } from '@/lib/types'
import { barycenterOffset } from '@/lib/universe/barycenter'
import {
  buildComets,
  cometPosition,
  cometVelocity,
  daysAgoLabel,
  tailDirections,
  tailLength,
  type Comet as CometSpec,
} from '@/lib/universe/comets'
import type { OrbitSystem, Vec3 } from '@/lib/universe/orbits'
import { seededRandom } from '@/lib/universe/random'
import { DUST_MATERIAL, ION_MATERIAL } from './cometLook'
import { bloomLook, useBloom } from '@/store/bloom'
import { simClock } from '@/store/simClock'
import { useUniverse } from '@/store/universe'

/** Núcleo gelado low-poly compartilhado, normalizado para raio 1. */
const NUCLEUS_GEOMETRY = (() => {
  const g = randomTransformVertices(new THREE.IcosahedronGeometry(1, 1), undefined, 0.8, 1.15, seededRandom('comet-nucleus'))
  g.computeBoundingSphere()
  const r = g.boundingSphere?.radius ?? 1
  return g.scale(1 / r, 1 / r, 1 / r)
})()
const NUCLEUS_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#dff4ff',
  emissive: '#9fdcff',
  emissiveIntensity: 0.35,
  roughness: 0.5,
  flatShading: true,
})
const HIT_GEOMETRY = new THREE.SphereGeometry(1, 8, 6)
const HIT_RADIUS = 1.4

/**
 * Cone unitário ao longo de +y (ápice no núcleo, y = 0; boca em y = 1, raio 1), com alfa por vértice que some na
 * ponta. `curve` desvia o eixo em +x (∝ y²): a cauda de poeira se curva para trás da velocidade.
 */
function tailGeometry(curve: number): THREE.BufferGeometry {
  const RADIAL = 8
  const STEPS = 10
  const pos: number[] = []
  const color: number[] = []
  const index: number[] = []
  for (let s = 0; s <= STEPS; s++) {
    const y = s / STEPS
    const alpha = Math.pow(1 - y, 1.4) * Math.min(1, y * 6 + 0.25)
    for (let k = 0; k <= RADIAL; k++) {
      const a = (k / RADIAL) * Math.PI * 2
      pos.push(curve * y * y + Math.cos(a) * y, y, Math.sin(a) * y)
      color.push(1, 1, 1, alpha)
    }
  }
  for (let s = 0; s < STEPS; s++) {
    for (let k = 0; k < RADIAL; k++) {
      const i = s * (RADIAL + 1) + k
      const j = i + RADIAL + 1
      index.push(i, j, i + 1, i + 1, j, j + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 4))
  g.setIndex(index)
  return g
}

const ION_GEOMETRY = tailGeometry(0)
const DUST_GEOMETRY = tailGeometry(0.22)
const UP = new THREE.Vector3(0, 1, 0)
const BLOOM_LOOK_PLAIN_COMA = bloomLook(false).coma

function Comet({ comet, system }: { comet: CometSpec; system: OrbitSystem }) {
  const root = useRef<THREE.Group>(null)
  const ion = useRef<THREE.Mesh>(null)
  const dust = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  const select = useUniverse((s) => s.select)
  const halo = useMemo(() => new GlowHalo({ color: '#bfe9ff', size: 2.2, opacity: BLOOM_LOOK_PLAIN_COMA }), [])
  useEffect(() => () => halo.dispose(), [halo])
  // com o bloom, a coma (aditiva) cai como o halo do sol
  const comaOpacity = bloomLook(useBloom((s) => s.active)).coma
  useEffect(() => halo.setOpacity(comaOpacity), [halo, comaOpacity])
  const scratch = useMemo(
    () => ({
      pos: [0, 0, 0] as Vec3,
      vel: [0, 0, 0] as Vec3,
      sun: [0, 0, 0] as Vec3,
      ion: [0, 0, 0] as Vec3,
      dust: [0, 0, 0] as Vec3,
      dir: new THREE.Vector3(),
      x: new THREE.Vector3(),
      z: new THREE.Vector3(),
      basis: new THREE.Matrix4(),
    }),
    [],
  )

  useFrame(() => {
    const t = simClock.time
    const s = scratch
    cometPosition(comet, t, s.pos)
    cometVelocity(comet, t, s.vel)
    barycenterOffset(system, t, s.sun)
    root.current?.position.set(s.pos[0], s.pos[1], s.pos[2])
    tailDirections(s.pos, s.sun, s.vel, s.ion, s.dust)
    const r = Math.hypot(s.pos[0] - s.sun[0], s.pos[1] - s.sun[1], s.pos[2] - s.sun[2])
    const L = tailLength(comet, r)
    if (ion.current) {
      ion.current.quaternion.setFromUnitVectors(UP, s.dir.set(s.ion[0], s.ion[1], s.ion[2]))
      ion.current.scale.set(0.12 + 0.05 * L, L, 0.12 + 0.05 * L)
    }
    if (dust.current) {
      // y = direção da poeira; x = para trás da velocidade (o lado para onde ela se curva); z fecha a base
      s.dir.set(s.dust[0], s.dust[1], s.dust[2])
      s.x.set(-s.vel[0], -s.vel[1], -s.vel[2])
      s.x.addScaledVector(s.dir, -s.x.dot(s.dir))
      if (s.x.lengthSq() < 1e-12) s.x.set(1, 0, 0).addScaledVector(s.dir, -s.dir.x)
      s.x.normalize()
      s.z.crossVectors(s.x, s.dir)
      dust.current.quaternion.setFromRotationMatrix(s.basis.makeBasis(s.x, s.dir, s.z))
      const D = 0.75 * L
      dust.current.scale.set(0.25 + 0.16 * D, D, 0.25 + 0.16 * D)
    }
    // a coma cresce perto do sol
    halo.scale.setScalar(1.6 + 0.12 * L)
  })

  return (
    <group ref={root}>
      <mesh geometry={NUCLEUS_GEOMETRY} material={NUCLEUS_MATERIAL} scale={comet.nucleus} raycast={() => null} />
      <primitive object={halo} />
      <mesh ref={ion} geometry={ION_GEOMETRY} material={ION_MATERIAL} renderOrder={2} raycast={() => null} />
      <mesh ref={dust} geometry={DUST_GEOMETRY} material={DUST_MATERIAL} renderOrder={2} raycast={() => null} />
      {/* área de toque maior que o núcleo, invisível */}
      <mesh
        geometry={HIT_GEOMETRY}
        scale={HIT_RADIUS}
        onClick={(e) => {
          e.stopPropagation()
          select({ kind: 'planet', name: comet.name })
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
      >
        <meshBasicMaterial visible={false} />
      </mesh>
      {hovered && (
        <Html zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{ transform: 'translate(-50%, calc(-100% - 14px))' }}>
            <div role="tooltip" className="whitespace-nowrap rounded-lg border border-neon/40 bg-panel/95 px-2.5 py-1.5 text-xs text-slate-200 shadow-lg shadow-black/40">
              ☄ commit recente em <span className="text-neon">{comet.name}</span> · {daysAgoLabel(comet.daysAgo)}
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}

/** Cometas da atividade recente (push ou commit em 7 dias, até 3): órbitas muito excêntricas e inclinadas. */
export function Comets({ system, repos }: { system: OrbitSystem; repos: Repo[] }) {
  // "agora" fixo na montagem: a lista de cometas não muda enquanto a página fica aberta
  const [now] = useState(() => new Date())
  const comets = useMemo(() => buildComets(system, repos, now), [system, repos, now])
  return (
    <>
      {comets.map((c) => (
        <Comet key={c.name} comet={c} system={system} />
      ))}
    </>
  )
}
