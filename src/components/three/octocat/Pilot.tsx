import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { circleProfile, curvePath, sweep, transportFrames } from 'three-low-poly'
import type { OctocatExpression } from '@/lib/octocat/expression'
import {
  ARM_RADIUS,
  ARM_Z,
  COLORS,
  FACE,
  FREE_ARM,
  HAND_RADIUS,
  HEAD,
  headFrontZ,
  JOYSTICK,
  STICK_ARM,
  THOUGHTS,
  TORSO,
} from '@/lib/ship/geometry'
import { drawOctocatFace, FACE_TEX_H, FACE_TEX_W } from './octocatFace'

export type ArmMode = 'rest' | 'wave' | 'point'

// Geometrias compartilhadas (coordenadas do SVG do piloto), construídas uma vez e nunca descartadas.

/** Corpo e cabeça: esferas de poucas faces; o facetado vem do flatShading. */
const TORSO_GEOMETRY = new THREE.SphereGeometry(1, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2)
const HEAD_GEOMETRY = new THREE.SphereGeometry(1, 16, 10)
/** Mão, bola do manche e bolhas de pensamento: icosaedro subdividido uma vez (80 faces). */
const BALL_GEOMETRY = new THREE.IcosahedronGeometry(1, 1)
const STICK_GEOMETRY = new THREE.CylinderGeometry(0.04, 0.04, JOYSTICK.height, 6)

/** O rosto fica sobre a cabeça inflada este tanto (folga na direção da normal, sem brigar com as facetas). */
const FACE_LIFT = 0.015
const FACE_GLOW = 0.3

/**
 * Disco do rosto (elipse FACE) curvado sobre a frente da cabeça. O RingGeometry de raio interno 0 dá anéis
 * internos para a curva; os UVs dele são planares (projeção de frente), então a textura não deforma.
 */
function faceGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.RingGeometry(0, 1, 32, 6)
  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) * FACE.rx
    const y = FACE.center[1] + position.getY(i) * FACE.ry
    position.setXYZ(i, x, y, headFrontZ(x, y, FACE_LIFT))
  }
  geometry.computeVertexNormals()
  return geometry
}
const FACE_GEOMETRY = faceGeometry()

/** Braço facetado: seção hexagonal varrida por 5 trechos da curva do SVG (cotovelos visíveis). */
function armGeometry(arm: { from: readonly number[]; control: readonly number[]; to: readonly number[] }, origin: readonly number[]) {
  const point = ([x, y]: readonly number[]) => new THREE.Vector3(x - origin[0], y - origin[1], 0)
  const curve = new THREE.QuadraticBezierCurve3(point(arm.from), point(arm.control), point(arm.to))
  return sweep(circleProfile(ARM_RADIUS, 6), transportFrames(curvePath(curve, 5)), { cap: true })
}

/** Braço livre desenhado a partir do ombro, para a Parte D girá-lo em torno dele. */
const FREE_ARM_GEOMETRY = armGeometry(FREE_ARM, FREE_ARM.from)
const STICK_ARM_GEOMETRY = armGeometry(STICK_ARM, [0, 0])
const HAND_OFFSET: [number, number, number] = [FREE_ARM.to[0] - FREE_ARM.from[0], FREE_ARM.to[1] - FREE_ARM.from[1], 0]

const solid = (color: string, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness, flatShading: true })
const BODY_MATERIAL = solid(COLORS.body)
const STICK_MATERIAL = solid(COLORS.stick, 0.5)
const KNOB_MATERIAL = solid(COLORS.hat, 0.55)
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
}

export function Pilot({ expression, blinking }: PilotProps) {
  const freeArm = useRef<THREE.Group>(null)
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
      {/* rosto: textura desenhada do SVG, sem flatShading (o desenho fica liso); a própria textura
          como emissivo fraco mantém a pele clara atrás do vidro e na parte de baixo, que pega menos luz */}
      <mesh geometry={FACE_GEOMETRY}>
        <meshStandardMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={FACE_GLOW} roughness={0.8} />
      </mesh>

      {/* braço livre, com pivô no ombro */}
      <group ref={freeArm} position={[FREE_ARM.from[0], FREE_ARM.from[1], ARM_Z]}>
        <mesh geometry={FREE_ARM_GEOMETRY} material={BODY_MATERIAL} />
        <mesh geometry={BALL_GEOMETRY} material={BODY_MATERIAL} position={HAND_OFFSET} scale={HAND_RADIUS} />
      </group>

      {/* braço no manche e o manche */}
      <mesh geometry={STICK_ARM_GEOMETRY} material={BODY_MATERIAL} position={[0, 0, ARM_Z]} />
      <mesh geometry={STICK_GEOMETRY} material={STICK_MATERIAL} position={[JOYSTICK.base[0], JOYSTICK.base[1], ARM_Z]} />
      <mesh
        geometry={BALL_GEOMETRY}
        material={KNOB_MATERIAL}
        position={[JOYSTICK.knob[0], JOYSTICK.knob[1], ARM_Z]}
        scale={JOYSTICK.knobRadius}
      />

      {expression === 'thinking' &&
        THOUGHTS.map(([x, y, z, r], i) => (
          <mesh key={i} geometry={BALL_GEOMETRY} material={THOUGHT_MATERIAL} position={[x, y, z]} scale={r} />
        ))}
    </group>
  )
}
