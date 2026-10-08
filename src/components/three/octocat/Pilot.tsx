import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { circleProfile, curvePath, sweep, transportFrames } from 'three-low-poly'
import type { OctocatExpression } from '@/lib/octocat/expression'
import {
  COLORS,
  DASH_TENTACLE,
  EAR,
  FACE_PATCH,
  FREE_TENTACLE,
  HEAD,
  headFrontZ,
  LEG_TENTACLES,
  STICK_TENTACLE,
  type Tentacle,
  TENTACLE,
  tentacleRadius,
  THOUGHTS,
  TORSO,
  WHISKER_RADIUS,
  WHISKERS,
} from '@/lib/ship/geometry'
import { POINT_ANGLE, waveAngle } from '@/lib/ship/motion'
import { drawOctocatFace, FACE_TEX_H, FACE_TEX_W } from './octocatFace'

export type ArmMode = 'rest' | 'wave' | 'point'

type Vec3 = [number, number, number]

// Geometrias compartilhadas (frame do piloto), construídas uma vez e nunca descartadas.

/** Corpo e cabeça: esferas de poucas faces; o facetado vem do flatShading. */
const TORSO_GEOMETRY = new THREE.SphereGeometry(1, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2)
const HEAD_GEOMETRY = new THREE.SphereGeometry(1, 16, 10)
/** Bolhas de pensamento: icosaedro subdividido uma vez (80 faces). */
const BALL_GEOMETRY = new THREE.IcosahedronGeometry(1, 1)
/** Ponta arredondada do tentáculo: é pequena, o icosaedro simples (20 faces) basta. */
const TIP_GEOMETRY = new THREE.IcosahedronGeometry(1, 0)

/** O rosto fica sobre a cabeça inflada este tanto (folga na direção da normal, sem brigar com as facetas). */
const FACE_LIFT = 0.015
const FACE_GLOW = 0.45

/**
 * Pedaço curvado que leva a textura do rosto: a elipse FACE_PATCH projetada sobre a frente da cabeça.
 * Os UVs do RingGeometry são planares (projeção de frente), então o desenho não deforma.
 */
function facePatchGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.RingGeometry(0, 1, 24, 5)
  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) * FACE_PATCH.rx
    const y = FACE_PATCH.center[1] + position.getY(i) * FACE_PATCH.ry
    position.setXYZ(i, x, y, headFrontZ(x, y, FACE_LIFT))
  }
  geometry.computeVertexNormals()
  return geometry
}
const FACE_GEOMETRY = facePatchGeometry()

/**
 * Orelha de gato: pirâmide de base retangular (faces de frente e de lado), base em y = 0 e ponta em y = 1.
 * A escala dá a base (EAR.radius de meia largura, EAR.depth dela em z) e o comprimento.
 */
const EAR_GEOMETRY = new THREE.ConeGeometry(Math.SQRT2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0)
const EAR_LENGTH = Math.hypot(EAR.tip[0] - EAR.root[0], EAR.tip[1] - EAR.root[1])
const EAR_TILT = Math.atan2(EAR.tip[0] - EAR.root[0], EAR.tip[1] - EAR.root[1])

/**
 * Miolo da orelha: triângulo um pouco à frente da face da frente da pirâmide (que vai de z = radius·depth na
 * base a 0 na ponta), mais claro, para a orelha ler contra o fundo escuro. Coordenadas da orelha já em escala.
 */
function innerEarGeometry(): THREE.BufferGeometry {
  const [r, len, k] = [EAR.radius, EAR_LENGTH, EAR.inner]
  const frontZ = (y: number) => r * EAR.depth * (1 - y / len) + 0.006
  const [y0, y1] = [len * (1 - k) * 0.35, len * (1 - (1 - k) * 0.4)]
  const half = r * (1 - y0 / len) * k
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-half, y0, frontZ(y0), half, y0, frontZ(y0), 0, y1, frontZ(y1)], 3),
  )
  geometry.computeVertexNormals()
  return geometry
}
const INNER_EAR_GEOMETRY = innerEarGeometry()

/** Bigode: cilindro de 4 lados de altura 1 em y, orientado de uma ponta à outra. */
const WHISKER_GEOMETRY = new THREE.CylinderGeometry(1, 1, 1, 4, 1)
function whiskerTransform([a, b]: [Vec3, Vec3]) {
  const [from, to] = [new THREE.Vector3(...a), new THREE.Vector3(...b)]
  const dir = to.clone().sub(from)
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  return { position: from.add(to).multiplyScalar(0.5), quaternion, scale: new THREE.Vector3(WHISKER_RADIUS, dir.length(), WHISKER_RADIUS) }
}
const WHISKER_PARTS = [1, -1].flatMap((side) =>
  WHISKERS.map(([a, b]) => whiskerTransform([[side * a[0], a[1], a[2]], [side * b[0], b[1], b[2]]])),
)

/** Ventosa: esfera de poucas faces, achatada e alongada ao longo do tentáculo. */
const SUCKER_GEOMETRY = new THREE.SphereGeometry(1, 6, 2)

interface TentacleParts {
  /** Tubo hexagonal afinando, com cor por vértice: em cima a do corpo, a face de baixo mais clara. */
  tube: THREE.BufferGeometry
  /** Fila de ventosas na face de baixo, numa geometria só. */
  suckers: THREE.BufferGeometry
  /** Ponta arredondada (centro e raio). */
  tip: Vec3
  tipRadius: number
}

const TOP_COLOR = new THREE.Color(COLORS.body)
const UNDER_COLOR = new THREE.Color(COLORS.tentacleUnder)

/**
 * Tentáculo low-poly: `sweep` de um hexágono pela curva dos pontos (transporte paralelo com a normal
 * começando em +z), afinando com `tentacleRadius`. Uma face do hexágono fica centrada no ângulo `under`:
 * é a face de baixo (cor clara + ventosas). Coordenadas relativas a `origin` (o pivô do grupo).
 */
function tentacleParts({ points, under }: Tentacle, origin: Vec3): TentacleParts {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, y, z]) => new THREE.Vector3(x - origin[0], y - origin[1], z - origin[2])),
    false,
    'centripetal',
  )
  const stations = transportFrames(curvePath(curve, TENTACLE.segments), new THREE.Vector3(0, 0, 1))
  const last = stations.length - 1
  const underAt = (i: number) =>
    stations[i].normal.clone().multiplyScalar(Math.cos(under)).addScaledVector(stations[i].binormal, Math.sin(under))

  // os vértices do hexágono ficam em under ± 30°: a face entre eles aponta para `under`
  const tube = sweep(circleProfile(1, 6, under + Math.PI / 6), stations, { scale: tentacleRadius, cap: true }).toNonIndexed()
  const position = tube.attributes.position
  const colors = new Float32Array(position.count * 3)
  const [a, b, c, normal, centroid] = [0, 0, 0, 0, 0].map(() => new THREE.Vector3())
  for (let v = 0; v < position.count; v += 3) {
    a.fromBufferAttribute(position, v)
    b.fromBufferAttribute(position, v + 1)
    c.fromBufferAttribute(position, v + 2)
    normal.subVectors(c, b).cross(a.clone().sub(b)).normalize()
    centroid.copy(a).add(b).add(c).divideScalar(3)
    let nearest = 0
    for (let i = 1; i <= last; i++) {
      if (stations[i].position.distanceToSquared(centroid) < stations[nearest].position.distanceToSquared(centroid)) nearest = i
    }
    const color = normal.dot(underAt(nearest)) > 0.75 ? UNDER_COLOR : TOP_COLOR
    for (let k = 0; k < 3; k++) color.toArray(colors, (v + k) * 3)
  }
  tube.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  tube.computeVertexNormals()

  const suckers = Array.from({ length: TENTACLE.suckers }, (_, k) => {
    const i = Math.round((0.12 + (0.78 * k) / (TENTACLE.suckers - 1)) * last)
    const r = tentacleRadius(i / last)
    const { position: p, tangent } = stations[i]
    const up = underAt(i).normalize()
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize()
    const basis = new THREE.Matrix4().makeBasis(tangent.clone().normalize(), up, side)
    // centro na face de baixo do hexágono (apótema = r·cos 30°): metade da ventosa fica para fora
    basis.setPosition(p.clone().addScaledVector(up, r * Math.cos(Math.PI / 6)))
    return SUCKER_GEOMETRY.clone().scale(r * 0.66, r * 0.18, r * 0.44).applyMatrix4(basis)
  })
  const merged = mergeGeometries(suckers)
  for (const s of suckers) s.dispose()

  return { tube, suckers: merged, tip: stations[last].position.toArray() as Vec3, tipRadius: tentacleRadius(1) }
}

/** O tentáculo livre é desenhado a partir do ombro, para a Parte D girá-lo em torno dele. */
const FREE_SHOULDER = FREE_TENTACLE.points[0]
const FREE_PARTS = tentacleParts(FREE_TENTACLE, FREE_SHOULDER)
const STICK_PARTS = tentacleParts(STICK_TENTACLE, [0, 0, 0])
/** Braço parado no painel e as duas pernas: mesmo construtor, a mesma família. */
const STATIC_PARTS = [DASH_TENTACLE, ...LEG_TENTACLES].map((tentacle) => tentacleParts(tentacle, [0, 0, 0]))

const solid = (color: string, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness, flatShading: true })
const BODY_MATERIAL = solid(COLORS.body)
const TENTACLE_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true })
const SUCKER_MATERIAL = new THREE.MeshStandardMaterial({
  color: COLORS.sucker,
  emissive: COLORS.sucker,
  emissiveIntensity: 0.15,
  roughness: 0.5,
  flatShading: true,
})
const WHISKER_MATERIAL = solid(COLORS.whisker, 0.8)
const INNER_EAR_MATERIAL = new THREE.MeshStandardMaterial({
  color: COLORS.tentacleUnder,
  emissive: COLORS.tentacleUnder,
  emissiveIntensity: 0.8,
  roughness: 0.7,
  flatShading: true,
})
const THOUGHT_MATERIAL = solid(COLORS.thought, 0.7)

function createFaceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = FACE_TEX_W
  canvas.height = FACE_TEX_H
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function paintFace(texture: THREE.CanvasTexture, expression: OctocatExpression, blinking: boolean): void {
  const ctx = (texture.image as HTMLCanvasElement).getContext('2d')
  if (!ctx) return
  drawOctocatFace(ctx, expression, blinking)
  texture.needsUpdate = true
}

function TentacleMesh({ parts }: { parts: TentacleParts }) {
  return (
    <>
      <mesh geometry={parts.tube} material={TENTACLE_MATERIAL} />
      <mesh geometry={parts.suckers} material={SUCKER_MATERIAL} />
      <mesh geometry={TIP_GEOMETRY} material={BODY_MATERIAL} position={parts.tip} scale={parts.tipRadius} />
    </>
  )
}

interface PilotProps {
  expression: OctocatExpression
  blinking: boolean
  armMode: ArmMode
}

export function Pilot({ expression, blinking, armMode }: PilotProps) {
  const freeArm = useRef<THREE.Group>(null)
  const reduced = useReducedMotion() ?? false

  // rotação em z gira o tentáculo no plano do corpo, em torno do ombro: acena para cima/baixo ou estica para o lado
  useFrame(({ clock }, dt) => {
    const arm = freeArm.current
    if (!arm) return
    const goal = armMode === 'point' ? POINT_ANGLE : 0
    if (armMode === 'wave' && !reduced) arm.rotation.z = waveAngle(clock.elapsedTime)
    else arm.rotation.z += (goal - arm.rotation.z) * (1 - Math.exp(-8 * dt))
  })

  const texture = useMemo(() => createFaceTexture(), [])
  useEffect(() => paintFace(texture, expression, blinking), [expression, blinking, texture])
  useEffect(() => () => texture.dispose(), [texture])

  return (
    <group>
      <mesh
        geometry={TORSO_GEOMETRY}
        material={BODY_MATERIAL}
        position={[0, TORSO.base[1], 0]}
        scale={[TORSO.rx, TORSO.ry, TORSO.rz]}
      />
      <mesh geometry={HEAD_GEOMETRY} material={BODY_MATERIAL} position={[0, HEAD.center[1], 0]} scale={[HEAD.rx, HEAD.ry, HEAD.rz]} />
      {[1, -1].map((side) => (
        <group key={side} position={[side * EAR.root[0], EAR.root[1], 0]} rotation={[0, 0, -side * EAR_TILT]}>
          <mesh geometry={EAR_GEOMETRY} material={BODY_MATERIAL} scale={[EAR.radius, EAR_LENGTH, EAR.radius * EAR.depth]} />
          <mesh geometry={INNER_EAR_GEOMETRY} material={INNER_EAR_MATERIAL} />
        </group>
      ))}
      {/* rosto: textura desenhada (mancha pêssego, olhos, boca), sem flatShading; fora da mancha o canvas é
          transparente e o alphaTest descarta. A própria textura como emissivo fraco mantém a pele clara
          atrás do vidro e na parte de baixo, que pega menos luz */}
      <mesh geometry={FACE_GEOMETRY}>
        <meshStandardMaterial
          map={texture}
          emissiveMap={texture}
          emissive="#ffffff"
          emissiveIntensity={FACE_GLOW}
          roughness={0.8}
          alphaTest={0.5}
          toneMapped={false}
        />
      </mesh>
      {WHISKER_PARTS.map(({ position, quaternion, scale }, i) => (
        <mesh key={i} geometry={WHISKER_GEOMETRY} material={WHISKER_MATERIAL} position={position} quaternion={quaternion} scale={scale} />
      ))}

      {/* tentáculo livre, com pivô no ombro */}
      <group ref={freeArm} position={FREE_SHOULDER}>
        <TentacleMesh parts={FREE_PARTS} />
      </group>

      {/* tentáculo enrolado na empunhadura do manche (que fica na nave), o braço no painel e as duas pernas */}
      <TentacleMesh parts={STICK_PARTS} />
      {STATIC_PARTS.map((parts, i) => (
        <TentacleMesh key={i} parts={parts} />
      ))}

      {expression === 'thinking' &&
        THOUGHTS.map(([x, y, z, r], i) => (
          <mesh key={i} geometry={BALL_GEOMETRY} material={THOUGHT_MATERIAL} position={[x, y, z]} scale={r} />
        ))}
    </group>
  )
}
