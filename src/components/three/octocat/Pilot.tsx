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
import { applyImpulse, setRest, type VerletOptions } from '@/lib/ship/verlet'
import { flightClock } from '@/store/frameClock'
import { FlexRod, type InertiaFrame, PILOT_INERTIA, useInertiaProbe } from './flexRod'
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
  /** Parâmetro da curva em cada estação da varredura: a espinha da física amostra a curva nesses pontos. */
  ts: number[]
}

const TOP_COLOR = new THREE.Color(COLORS.body)
const UNDER_COLOR = new THREE.Color(COLORS.tentacleUnder)

/**
 * Tentáculo low-poly: `sweep` de um hexágono pela curva dos pontos (transporte paralelo com a normal
 * começando em +z), afinando com `tentacleRadius`. Uma face do hexágono fica centrada no ângulo `under`:
 * é a face de baixo (cor clara + ventosas). Coordenadas do piloto. É a pose de descanso: a física (FlexRod)
 * dobra cópias destas malhas a cada quadro.
 */
function tentacleParts({ points, under }: Tentacle): TentacleParts {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
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

  return {
    tube,
    suckers: merged,
    tip: stations[last].position.toArray() as Vec3,
    tipRadius: tentacleRadius(1),
    ts: Array.from({ length: TENTACLE.segments + 1 }, (_, i) => curve.getUtoTmapping(i / TENTACLE.segments, 0)),
  }
}

/**
 * Física de cada tentáculo (cadeia de Verlet semeada pelos pontos, raiz presa no corpo). Rigidez em 1/s²
 * (ω² da mola de descanso), da raiz à ponta: as pontas são mais soltas. O braço livre é duro o bastante
 * para o aceno (7 rad/s) ficar bem abaixo da ressonância: a física só dá o arrasto da ponta. O do manche
 * fica preso no ombro e na volta em torno da empunhadura: só o trecho do meio balança.
 */
interface TentacleSpec {
  tentacle: Tentacle
  parts: TentacleParts
  physics: VerletOptions
}
const FREE_SPEC: TentacleSpec = {
  tentacle: FREE_TENTACLE,
  parts: tentacleParts(FREE_TENTACLE),
  physics: { stiffness: 420, tipStiffness: 220, damping: 6 },
}
const OTHER_SPECS: TentacleSpec[] = [
  {
    tentacle: STICK_TENTACLE,
    parts: tentacleParts(STICK_TENTACLE),
    physics: { stiffness: 160, damping: 5, pinned: STICK_TENTACLE.points.map((_, i) => i).filter((i) => i !== 1) },
  },
  // braço parado no painel e as duas pernas: mesmo construtor, a mesma família
  { tentacle: DASH_TENTACLE, parts: tentacleParts(DASH_TENTACLE), physics: { stiffness: 150, tipStiffness: 70, damping: 4 } },
  ...LEG_TENTACLES.map((tentacle) => ({
    tentacle,
    parts: tentacleParts(tentacle),
    physics: { stiffness: 140, tipStiffness: 60, damping: 4 },
  })),
]
/** O braço livre acena girando em z em torno do ombro (a pose de descanso da cadeia gira junto). */
const FREE_SHOULDER = FREE_TENTACLE.points[0]

/** Tranco do botão "Sacudir" (unidades do piloto/s), um sentido por tentáculo para não balançarem iguais. */
const SHAKE_IMPULSES: Vec3[] = [
  [2.4, 2.6, -1.4],
  [-1.2, 1.6, 1.2],
  [1.8, -2.2, 1.6],
  [-2.2, 1.8, -1.6],
  [2.2, 1.6, 1.8],
]

/** Tentáculos de uma instância do piloto: cópias das malhas de descanso, dobradas pela física. */
function createTentacleRods() {
  return [FREE_SPEC, ...OTHER_SPECS].map(({ tentacle, parts, physics }) => {
    const tube = parts.tube.clone()
    const suckers = parts.suckers.clone()
    return { rod: new FlexRod(tentacle.points, parts.ts, [tube, suckers], physics), tube, suckers, tipRadius: parts.tipRadius, tip: parts.tip }
  })
}
type TentacleRods = ReturnType<typeof createTentacleRods>

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

interface PilotProps {
  expression: OctocatExpression
  blinking: boolean
  armMode: ArmMode
  /** Muda a cada clique em "Sacudir" (preview): um tranco nos tentáculos. */
  shake?: number
  /** Referencial da inércia (ver useInertiaProbe): `world` no preview, onde a câmera orbita a nave parada. */
  inertiaFrame?: InertiaFrame
}

const Z_AXIS = new THREE.Vector3(0, 0, 1)

/**
 * Gira a pose de descanso do braço livre `angle` rad em z, em torno do ombro, e leva o giro para a raiz da
 * espinha: a seção (facetas, face de baixo, ventosas) gira junto com o braço em vez de rolar em volta dele.
 */
function poseFreeArm({ rod }: TentacleRods[number], angle: number): void {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const ox = FREE_SHOULDER[0]
  const oy = FREE_SHOULDER[1]
  const points = FREE_TENTACLE.points
  for (let i = 0; i < points.length; i++) {
    const dx = points[i][0] - ox
    const dy = points[i][1] - oy
    setRest(rod.chain, i, ox + c * dx - s * dy, oy + s * dx + c * dy, points[i][2])
  }
  rod.rootTurn.setFromAxisAngle(Z_AXIS, angle)
}

export function Pilot({ expression, blinking, armMode, shake = 0, inertiaFrame = 'auto' }: PilotProps) {
  const root = useRef<THREE.Group>(null)
  const tips = useRef<(THREE.Mesh | null)[]>([])
  const armAngle = useRef(0)
  const reduced = useReducedMotion() ?? false

  const tentacles = useMemo(() => createTentacleRods(), [])
  useEffect(() => () => tentacles.forEach(({ rod }) => rod.dispose()), [tentacles])
  const probe = useInertiaProbe(PILOT_INERTIA, inertiaFrame)

  // Movimento reduzido: sem física, tudo na pose de descanso (o braço livre ainda aponta, sem balanço).
  useEffect(() => {
    if (!reduced) return
    probe.reset()
    for (const { rod } of tentacles) rod.pose()
  }, [reduced, probe, tentacles])

  // só reage a um clique novo (remontar com o mesmo contador não sacode)
  const lastShake = useRef(shake)
  useEffect(() => {
    if (shake === lastShake.current) return
    lastShake.current = shake
    if (reduced) return
    tentacles.forEach(({ rod }, i) => applyImpulse(rod.chain, ...SHAKE_IMPULSES[i % SHAKE_IMPULSES.length]))
  }, [shake, reduced, tentacles])

  useFrame(({ clock }, delta) => {
    // o mesmo passo suavizado com que a nave anda (store/frameClock); a amostra de inércia mede o deslocamento do
    // último render, que veio do passo anterior — com o delta cru, o tremido viraria tranco falso nos tentáculos
    const dt = flightClock.step(clock.elapsedTime, delta)
    // braço livre: o aceno/apontar gira a pose de descanso em torno do ombro (para cima/baixo ou para o lado)
    const goal = armMode === 'point' ? POINT_ANGLE : 0
    if (armMode === 'wave' && !reduced) armAngle.current = waveAngle(clock.elapsedTime)
    else armAngle.current += (goal - armAngle.current) * (1 - Math.exp(-8 * dt))
    poseFreeArm(tentacles[0], armAngle.current)

    if (reduced) tentacles[0].rod.pose()
    else if (root.current) {
      const input = probe.sample(root.current, flightClock.previousStep || dt)
      for (let i = 0; i < tentacles.length; i++) tentacles[i].rod.step(dt, input)
    }
    for (let i = 0; i < tentacles.length; i++) {
      const tip = tips.current[i]
      if (tip) tentacles[i].rod.tip(tip.position)
    }
  })

  const texture = useMemo(() => createFaceTexture(), [])
  useEffect(() => paintFace(texture, expression, blinking), [expression, blinking, texture])
  useEffect(() => () => texture.dispose(), [texture])

  return (
    <group ref={root}>
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

      {/* tentáculos: o livre (acena), o enrolado na empunhadura do manche (que fica na nave), o do painel e as
          duas pernas. Malhas dobradas pela física a cada quadro; a ponta arredondada segue o fim da espinha */}
      {tentacles.map(({ tube, suckers, tipRadius, tip }, i) => (
        <group key={i}>
          <mesh geometry={tube} material={TENTACLE_MATERIAL} />
          <mesh geometry={suckers} material={SUCKER_MATERIAL} />
          <mesh
            ref={(mesh) => {
              tips.current[i] = mesh
            }}
            geometry={TIP_GEOMETRY}
            material={BODY_MATERIAL}
            position={tip}
            scale={tipRadius}
          />
        </group>
      ))}

      {expression === 'thinking' &&
        THOUGHTS.map(([x, y, z, r], i) => (
          <mesh key={i} geometry={BALL_GEOMETRY} material={THOUGHT_MATERIAL} position={[x, y, z]} scale={r} />
        ))}
    </group>
  )
}
