import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { StarGeometry } from 'three-low-poly'
import { SHIP_WORLD_HEIGHT } from '@/lib/ship/escort'
import { showFx } from '@/store/show'
import { shipPose } from '@/store/shipPose'

/** Estrelinhas do confete: quantas, quanto duram (s), tamanho e velocidade (em alturas da nave). */
const COUNT = 28
const LIFE = 1.8
const SIZE = SHIP_WORLD_HEIGHT * 0.07
const SPEED = SHIP_WORLD_HEIGHT * 2.4
/** Freio do ar (1/s) e queda (alturas da nave por s²). */
const DRAG = 2.2
const FALL = SHIP_WORLD_HEIGHT * 1.6
const COLORS = ['#ffd23f', '#ff4fd8', '#22d3ee', '#10b981', '#a78bfa', '#fff3c4'].map((c) => new THREE.Color(c))

/** Estrela de 5 pontas fina (a mesma família das estrelinhas do Octocat tonto). */
const STAR = new StarGeometry({ outerRadius: 1, innerRadius: 0.45, depth: 0.25 }).translate(0, 0, -0.125)

/**
 * Confete do show do botão: um estouro de estrelinhas coloridas saindo da nave, girando, freando e caindo um pouco
 * antes de sumir. Um InstancedMesh só, sem alocar por quadro; dispara a cada `showFx.confetti` (só com movimento: o
 * ShowDriver não solta a deixa sob movimento reduzido).
 */
export function ShowConfetti() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const seen = useRef(showFx.confetti)
  const material = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide }), [])
  useEffect(() => () => material.dispose(), [material])
  /** Estado do estouro em curso (reescrito no lugar a cada quadro). */
  const state = useRef({
    age: LIFE,
    pos: new Float32Array(COUNT * 3),
    vel: new Float32Array(COUNT * 3),
    spin: new Float32Array(COUNT * 2),
    dummy: new THREE.Object3D(),
  })

  useEffect(() => {
    const m = mesh.current
    if (!m) return
    for (let i = 0; i < COUNT; i++) m.setColorAt(i, COLORS[i % COLORS.length])
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [])

  useFrame((_, dt) => {
    const m = mesh.current
    if (!m) return
    const s = state.current
    if (showFx.confetti !== seen.current) {
      seen.current = showFx.confetti
      s.age = 0
      const [x, y, z] = shipPose.position
      for (let i = 0; i < COUNT; i++) {
        // espalha numa esfera, puxado para cima (estouro de festa)
        const u = Math.random() * 2 - 1
        const a = Math.random() * Math.PI * 2
        const ring = Math.sqrt(1 - u * u)
        const v = SPEED * (0.5 + Math.random() * 0.6)
        s.pos[i * 3] = x
        s.pos[i * 3 + 1] = y + SHIP_WORLD_HEIGHT * 0.4
        s.pos[i * 3 + 2] = z
        s.vel[i * 3] = Math.cos(a) * ring * v
        s.vel[i * 3 + 1] = (Math.abs(u) * 0.8 + 0.5) * v
        s.vel[i * 3 + 2] = Math.sin(a) * ring * v
        s.spin[i * 2] = Math.random() * 6
        s.spin[i * 2 + 1] = (Math.random() * 2 - 1) * 9
      }
    }
    m.visible = s.age < LIFE
    if (!m.visible) return
    s.age += dt
    const drag = Math.exp(-DRAG * dt)
    const scale = SIZE * Math.max(0, 1 - Math.pow(s.age / LIFE, 3))
    for (let i = 0; i < COUNT; i++) {
      const k = i * 3
      s.vel[k] *= drag
      s.vel[k + 1] = s.vel[k + 1] * drag - FALL * dt
      s.vel[k + 2] *= drag
      s.pos[k] += s.vel[k] * dt
      s.pos[k + 1] += s.vel[k + 1] * dt
      s.pos[k + 2] += s.vel[k + 2] * dt
      s.dummy.position.set(s.pos[k], s.pos[k + 1], s.pos[k + 2])
      s.dummy.rotation.set(s.spin[i * 2] + s.age * s.spin[i * 2 + 1], s.age * 3 + i, 0)
      s.dummy.scale.setScalar(scale)
      s.dummy.updateMatrix()
      m.setMatrixAt(i, s.dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={mesh} args={[STAR, material, COUNT]} visible={false} frustumCulled={false} raycast={() => null} />
}
