import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { meteorFade, METEOR_CAP, newMeteorPool, stepMeteors } from '@/lib/easter/meteors'
import { disco } from '@/store/disco'

/** Meteoros por segundo com a festa acesa (o pool segura no máximo METEOR_CAP ao mesmo tempo). */
const RAIN_RATE = 24
/** Distância da câmera em que a chuva cai, em frações do raio da casca de estrelas (atrás do sistema, à frente do céu). */
const RAIN_DEPTH = 0.8
/** Espessura do rastro, em frações da meia-altura da tela naquela distância. */
const STREAK_WIDTH = 0.006

/**
 * Rastro unitário ao longo de +x (cabeça em x = 0,5, cauda em −0,5) que afina para a cauda, com a cor por vértice
 * indo do branco (cabeça) ao preto (cauda): aditivo, o preto some.
 */
function streakGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1, 6, 1)
  const pos = g.attributes.position as THREE.BufferAttribute
  const color: number[] = []
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5
    pos.setY(i, pos.getY(i) * (0.25 + 0.75 * u))
    const c = u * u
    color.push(c, c, c)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3))
  return g
}

const TINTS = ['#ffffff', '#fff3c4', '#a5f3fc', '#f5c2ff'].map((c) => new THREE.Color(c))

/**
 * Chuva de estrelas do modo disco: até METEOR_CAP rastros num InstancedMesh só, presos ao céu da câmera (cruzam a tela
 * de cima à direita para baixo à esquerda de onde quer que se olhe). O pool (lib/easter/meteors) não aloca; as matrizes
 * e as cores são reescritas no lugar. Para de nascer meteoro quando a festa apaga; os que estão no céu terminam.
 */
export function MeteorRain({ radius }: { radius: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const pool = useMemo(() => newMeteorPool(), [])
  const rng = useMemo(() => Math.random, [])
  const geometry = useMemo(() => streakGeometry(), [])
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  )
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  const scratch = useMemo(
    () => ({
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      back: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      side: new THREE.Vector3(),
      head: new THREE.Vector3(),
      center: new THREE.Vector3(),
      basis: new THREE.Matrix4(),
      color: new THREE.Color(),
      zero: new THREE.Matrix4().makeScale(0, 0, 0),
    }),
    [],
  )

  // a cor de cada instância começa preta (o InstancedMesh cria o atributo na primeira escrita)
  useEffect(() => {
    const m = mesh.current
    if (!m) return
    for (let k = 0; k < METEOR_CAP; k++) {
      m.setMatrixAt(k, scratch.zero)
      m.setColorAt(k, scratch.color.setRGB(0, 0, 0))
    }
  }, [scratch])

  useFrame((_, dt) => {
    const m = mesh.current
    if (!m) return
    const aspect = size.width / Math.max(1, size.height)
    stepMeteors(pool, dt, RAIN_RATE * disco.level, rng, aspect)
    const s = scratch
    const depth = radius * RAIN_DEPTH
    const halfH = depth * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360)
    s.right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    s.up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    s.back.set(0, 0, 1).applyQuaternion(camera.quaternion)
    for (let k = 0; k < pool.cap; k++) {
      if (!pool.active[k]) {
        m.setMatrixAt(k, s.zero)
        continue
      }
      const age = pool.age[k]
      const fade = meteorFade(age, pool.life[k])
      const speed = Math.hypot(pool.vx[k], pool.vy[k]) || 1
      // cabeça no céu da câmera, rastro para trás da velocidade (cresce no começo, como quem risca)
      const hx = pool.x[k] + pool.vx[k] * age
      const hy = pool.y[k] + pool.vy[k] * age
      const length = Math.min(pool.length[k], speed * age) * halfH
      s.dir.copy(s.right).multiplyScalar(pool.vx[k] / speed).addScaledVector(s.up, pool.vy[k] / speed)
      s.side.crossVectors(s.back, s.dir)
      s.head.copy(camera.position).addScaledVector(s.back, -depth).addScaledVector(s.right, hx * halfH).addScaledVector(s.up, hy * halfH)
      s.center.copy(s.head).addScaledVector(s.dir, -length / 2)
      const width = STREAK_WIDTH * halfH * (0.6 + 0.8 * pool.depth[k])
      s.basis.makeBasis(s.dir.multiplyScalar(Math.max(length, 1e-3)), s.side.multiplyScalar(width), s.back)
      s.basis.setPosition(s.center)
      m.setMatrixAt(k, s.basis)
      s.color.copy(TINTS[k % TINTS.length]).multiplyScalar(fade * (0.55 + 0.45 * pool.depth[k]))
      m.setColorAt(k, s.color)
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return <instancedMesh ref={mesh} args={[geometry, material, METEOR_CAP]} frustumCulled={false} renderOrder={1} raycast={() => null} />
}
