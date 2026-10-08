import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useCursor } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import { GlowHalo } from 'three-low-poly'
import { FACE_AT_REST, faceTarget, stepFaceSpring, type FaceSpring } from '@/lib/sun/faceSpring'
import {
  CLICK_DURATION,
  INITIAL_SUN_STATE,
  nextBlinkDelay,
  SUN_LOOK,
  sunReducer,
  type SunMode,
  type SunState,
} from '@/lib/sun/sunMachine'
import { SUN_RADIUS, type Vec3 } from '@/lib/universe/orbits'
import { useUniverse } from '@/store/universe'
import { drawSunFace, SUN_TEX_H, SUN_TEX_W } from './sunFace'

const NEAR_DISTANCE = 9
const FOLLOW_MAX = 1.5
const HALO_SIZE = SUN_RADIUS * 3.2
const HALO_OPACITY = 0.55

export function Sun() {
  const body = useRef<THREE.Group>(null)
  const bounce = useRef<THREE.Group>(null)
  const face = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  const machine = useRef<SunState>(INITIAL_SUN_STATE)
  const spring = useRef<FaceSpring>(FACE_AT_REST)
  const [mode, setMode] = useState<SunMode>('idle')
  const [blink, setBlink] = useState(false)
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  const select = useUniverse((s) => s.select)
  const reduced = useReducedMotion() ?? false

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = SUN_TEX_W
    canvas.height = SUN_TEX_H
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])

  useEffect(() => {
    const ctx = (texture.image as HTMLCanvasElement).getContext('2d')
    if (!ctx) return
    drawSunFace(ctx, SUN_LOOK[mode].expression, blink)
    texture.needsUpdate = true
  }, [mode, blink, texture])

  useEffect(() => () => texture.dispose(), [texture])

  const halo = useMemo(() => new GlowHalo({ color: '#FFC400', size: HALO_SIZE, opacity: HALO_OPACITY }), [])
  useEffect(() => () => halo.dispose(), [halo])

  useEffect(() => {
    let timer = 0
    const schedule = () => {
      timer = window.setTimeout(() => {
        setBlink(true)
        timer = window.setTimeout(() => {
          setBlink(false)
          schedule()
        }, 140)
      }, nextBlinkDelay() * 1000)
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [])

  // Raycaster próprio: o `state.raycaster` do R3F é o mesmo usado pelos eventos de clique.
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  const goal = useMemo(() => new THREE.Vector3(), [])
  const facePos = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ pointer, camera, clock }, dt) => {
    raycaster.setFromCamera(pointer, camera)
    const near = raycaster.ray.intersectPlane(plane, hit) !== null && hit.length() < NEAR_DISTANCE
    let next = sunReducer(machine.current, { type: near ? 'near' : 'far' })
    next = sunReducer(next, { type: 'tick', dt })
    if (next.mode !== machine.current.mode) setMode(next.mode)
    machine.current = next
    const look = SUN_LOOK[next.mode]
    const t = clock.elapsedTime

    // Corpo segue o mouse com atraso quando ele está perto; senão volta ao centro.
    goal.set(0, 0, 0)
    if (next.mode === 'hover' && !reduced) goal.copy(hit).setY(0).clampLength(0, FOLLOW_MAX)
    body.current?.position.lerp(goal, 1 - Math.exp(-3 * dt))

    if (bounce.current) {
      const progress = next.mode === 'click' ? 1 - next.clickLeft / CLICK_DURATION : 0
      bounce.current.position.y = reduced ? 0 : Math.sin(progress * Math.PI) * 0.8
      bounce.current.position.x = !reduced && next.mode === 'click' ? Math.sin(t * 60) * 0.05 : 0
      bounce.current.scale.setScalar(!reduced && next.mode === 'idle' ? 1 + Math.sin(t * 1.6) * 0.03 : 1)
    }

    // Rosto vira para a câmera com uma mola: atraso, leve balanço e pitch limitado.
    if (face.current) {
      face.current.getWorldPosition(facePos)
      const target = faceTarget(facePos.toArray() as Vec3, camera.position.toArray() as Vec3)
      spring.current = reduced ? { ...FACE_AT_REST, ...target } : stepFaceSpring(spring.current, target, dt)
      const wobble = next.mode === 'hover' && !reduced ? Math.sin(t * 3) * 0.08 : 0
      face.current.rotation.set(-spring.current.pitch, spring.current.yaw, wobble, 'YXZ')
    }

    const k = 1 - Math.exp(-6 * dt)
    halo.setOpacity(halo.opacity + (Math.min(1, HALO_OPACITY * look.glow) - halo.opacity) * k)
    if (light.current) light.current.intensity += (2.2 * look.glow - light.current.intensity) * k
  })

  function handleClick(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation()
    machine.current = sunReducer(machine.current, { type: 'click' })
    setMode('click')
    select({ kind: 'profile' })
  }

  return (
    <group ref={body}>
      <pointLight ref={light} decay={0} intensity={2.2} color="#FFF1C9" />
      <group ref={bounce}>
        <mesh
          ref={face}
          onClick={handleClick}
          onPointerOver={(e) => {
            e.stopPropagation()
            setHovered(true)
          }}
          onPointerOut={() => setHovered(false)}
        >
          <sphereGeometry args={[SUN_RADIUS, 64, 32]} />
          <meshStandardMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={0.7} roughness={0.7} toneMapped={false} />
        </mesh>
        <primitive object={halo} />
      </group>
    </group>
  )
}
