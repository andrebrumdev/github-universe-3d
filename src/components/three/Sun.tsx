import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCursor } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import { aberrationLimbPx, fringeRho, sunScreenRadius } from '@/lib/sun/aberration'
import { showcasePlanet } from '@/lib/cameraPoses'
import { selectedPlanet } from '@/lib/interaction'
import { PUPIL, PUPIL_REACH, pupilLook } from '@/lib/sun/face'
import { FACE_AT_REST, faceTarget, stepFaceSpring, wrapAngle, type FaceSpring } from '@/lib/sun/faceSpring'
import { GAZE_AT_START, isAdmiring, limitTurnAway, planetGazeWeight, quantizePupil, stepGaze, type GazeInput, type GazeState } from '@/lib/sun/gaze'
import { kickSquash, SQUASH_AT_REST, SQUASH_TARGET, squashScale, stepSquash, type Squash } from '@/lib/sun/squash'
import {
  CLICK_DURATION,
  INITIAL_SUN_STATE,
  nextBlinkDelay,
  SUN_LOOK,
  sunReducer,
  type SunExpression,
  type SunMode,
  type SunState,
} from '@/lib/sun/sunMachine'
import type { RepoBase } from '@/lib/types'
import { barycenterOffset } from '@/lib/universe/barycenter'
import { planetPosition, SUN_RADIUS, type OrbitSystem, type Vec3 } from '@/lib/universe/orbits'
import { bloomLook, useBloom } from '@/store/bloom'
import { usePresentation } from '@/store/presentation'
import { shipPose } from '@/store/shipPose'
import { simClock } from '@/store/simClock'
import { useTutorial } from '@/store/tutorial'
import { useUniverse } from '@/store/universe'
import { drawSunFace, SUN_TEX_H, SUN_TEX_W } from './sunFace'
import {
  createGlowGeometry,
  createGlowMaterial,
  createHazeGeometry,
  createHazeMaterial,
  createSunGeometry,
  createSunMaterial,
  SUN_UNIFORMS,
  sunGlowOpacity,
  sunHazeOpacity,
  sunLumaCap,
} from './sunMaterial'

const NEAR_DISTANCE = 9
const FOLLOW_MAX = 1.5
/** Brilho e névoa não entram no raycast (são maiores e roubariam o hover do rosto). */
const NO_RAYCAST = () => undefined

/** Para onde o mouse "está" para o olhar: no raio do ponteiro, um pouco à frente do sol (em raios do sol). */
const MOUSE_LOOK_AHEAD = 3

type SunRepo = Pick<RepoBase, 'name' | 'languages' | 'pushedAt'>

/** Planeta em foco na apresentação (parada de repo) ou no passo "tech" do tutorial; leitura só, sem assinar. */
function focusedPlanet(showcase: string | null): string | null {
  const { state, stops } = usePresentation.getState()
  if (state) {
    const stop = stops[state.index]
    return stop?.kind === 'repo' ? stop.name : null
  }
  return useTutorial.getState().step === 'tech' ? showcase : null
}

/**
 * `system`: o sol bamboleia em torno do baricentro (a origem), do lado oposto aos planetas pesados, e olha para os
 * planetas dele. `repos`: o planeta do tutorial e o peso de atividade recente para admirar.
 */
export function Sun({ system, repos }: { system: OrbitSystem; repos: SunRepo[] }) {
  const center = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const bounce = useRef<THREE.Group>(null)
  const squashGroup = useRef<THREE.Group>(null)
  const squash = useRef<Squash>(SQUASH_AT_REST)
  const face = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  const machine = useRef<SunState>(INITIAL_SUN_STATE)
  const spring = useRef<FaceSpring>(FACE_AT_REST)
  const [mode, setMode] = useState<SunMode>('idle')
  const [blink, setBlink] = useState(false)
  const [hovered, setHovered] = useState(false)
  const gaze = useRef<GazeState>(GAZE_AT_START)
  const [admiring, setAdmiring] = useState(false)
  const admiringNow = useRef(false)
  const expression: SunExpression = admiring && mode === 'idle' ? 'admiring' : SUN_LOOK[mode].expression
  const showcase = useMemo(() => showcasePlanet(repos), [repos])
  // Planetas que o sol admira: os grandes e os com push recente (a hora do carregamento basta).
  const [loadedAt] = useState(() => Date.now())
  const planets = useMemo(
    () =>
      system.orbits.map((o) => ({
        name: o.name,
        weight: planetGazeWeight(o.radius, repos.find((r) => r.name === o.name)?.pushedAt ?? null, loadedAt),
      })),
    [system, repos, loadedAt],
  )
  const orbitByName = useMemo(() => new Map(system.orbits.map((o) => [o.name, o])), [system])
  useCursor(hovered)
  const select = useUniverse((s) => s.select)
  const reduced = useReducedMotion() ?? false
  const bloomActive = useBloom((s) => s.active)
  const bloom = bloomLook(bloomActive)
  useEffect(() => {
    SUN_UNIFORMS.uSunLumaCap.value = sunLumaCap(bloomActive)
  }, [bloomActive])

  // O `pointer` do R3F começa em (0,0) e nunca zera: só há "perto" com um ponteiro real no canvas.
  const gl = useThree((s) => s.gl)
  const pointerPresent = useRef(false)
  useEffect(() => {
    const el = gl.domElement
    const onMove = (e: PointerEvent) => {
      pointerPresent.current = e.pointerType !== 'touch'
    }
    const onGone = () => {
      pointerPresent.current = false
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onGone)
    el.addEventListener('pointercancel', onGone)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onGone)
      el.removeEventListener('pointercancel', onGone)
    }
  }, [gl])

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = SUN_TEX_W
    canvas.height = SUN_TEX_H
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    // o rosto fica de lado quando a câmera gira: sobrancelhas e boca continuam nítidas
    tex.anisotropy = 8
    return tex
  }, [])

  useEffect(() => {
    const ctx = (texture.image as HTMLCanvasElement).getContext('2d')
    if (!ctx) return
    drawSunFace(ctx, expression, blink)
    // oxlint-disable-next-line react/immutability -- API imperativa de textura do Three.js
    texture.needsUpdate = true
  }, [expression, blink, texture])

  useEffect(() => () => texture.dispose(), [texture])

  const sunGeometry = useMemo(() => createSunGeometry(), [])
  const sunMaterial = useMemo(() => createSunMaterial(texture), [texture])
  const glowGeometry = useMemo(() => createGlowGeometry(), [])
  const glowMaterial = useMemo(() => createGlowMaterial(), [])
  const hazeGeometry = useMemo(() => createHazeGeometry(), [])
  const hazeMaterial = useMemo(() => createHazeMaterial(), [])
  useEffect(
    () => () => {
      for (const d of [sunGeometry, sunMaterial, glowGeometry, glowMaterial, hazeGeometry, hazeMaterial]) d.dispose()
    },
    [sunGeometry, sunMaterial, glowGeometry, glowMaterial, hazeGeometry, hazeMaterial],
  )
  useEffect(() => {
    // oxlint-disable-next-line react/immutability -- uniforms do Three.js são mutáveis por design
    hazeMaterial.uniforms.uOpacity.value = sunHazeOpacity(bloom)
  }, [hazeMaterial, bloom])

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
  const offset = useMemo<Vec3>(() => [0, 0, 0], [])
  const sunAt = useMemo(() => new THREE.Vector3(), [])
  const scaleOut = useMemo<[number, number, number]>(() => [1, 1, 1], [])
  const pupilOut = useMemo<[number, number, number]>(() => [0, 0, 0], [])
  const lookAt = useMemo(() => new THREE.Vector3(), [])
  const planetAt = useMemo<Vec3>(() => [0, 0, 0], [])
  const gazeInput = useRef<GazeInput>({
    mode: 'idle',
    pointer: false,
    shipTraveling: false,
    focusPlanet: null,
    selectedPlanet: null,
    planets: [],
    reduced: false,
  })

  useFrame(({ pointer, camera, clock, size, viewport }, dt) => {
    // Bamboleio em torno do baricentro: segue o relógio da simulação, como os planetas.
    barycenterOffset(system, simClock.time, offset)
    sunAt.fromArray(offset)
    center.current?.position.copy(sunAt)
    // "Perto" e o ponto que o corpo segue são medidos a partir do sol, no plano horizontal que passa por ele.
    plane.constant = -sunAt.y
    raycaster.setFromCamera(pointer, camera)
    const near = pointerPresent.current && raycaster.ray.intersectPlane(plane, hit) !== null && hit.sub(sunAt).length() < NEAR_DISTANCE
    let next = sunReducer(machine.current, { type: near ? 'near' : 'far' })
    next = sunReducer(next, { type: 'tick', dt })
    if (next.mode !== machine.current.mode) {
      setMode(next.mode)
      if (!reduced) squash.current = kickSquash(squash.current, next.mode)
    }
    machine.current = next
    const look = SUN_LOOK[next.mode]
    const t = clock.elapsedTime
    // Um relógio só para o balanço, as manchas, a textura e a névoa; parado sob movimento reduzido.
    if (!reduced) SUN_UNIFORMS.uSunTime.value = t

    // Squash & stretch: "puff" no hover, achata-estica-assenta no clique, murcha no away.
    squash.current = reduced ? SQUASH_AT_REST : stepSquash(squash.current, SQUASH_TARGET[next.mode], dt)
    squashGroup.current?.scale.fromArray(squashScale(squash.current, scaleOut))

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

    // Olhar com personalidade: o diretor escolhe o alvo (câmera, mouse, nave, planeta); a mola suaviza a virada.
    const input = gazeInput.current
    input.mode = next.mode
    input.pointer = pointerPresent.current
    input.shipTraveling = shipPose.mode === 'traveling' || shipPose.mode === 'returning'
    input.focusPlanet = focusedPlanet(showcase)
    input.selectedPlanet = selectedPlanet(useUniverse.getState().selection)
    input.planets = planets
    input.reduced = reduced
    gaze.current = stepGaze(gaze.current, input, dt, Math.random)
    const g = gaze.current
    const nowAdmiring = isAdmiring(g, next.mode)
    if (nowAdmiring !== admiringNow.current) {
      admiringNow.current = nowAdmiring
      setAdmiring(nowAdmiring)
    }

    if (face.current) {
      face.current.getWorldPosition(facePos)
      lookAt.copy(camera.position)
      if (g.gaze.kind === 'mouse') {
        const ahead = Math.max(1, camera.position.distanceTo(facePos) - MOUSE_LOOK_AHEAD * SUN_RADIUS)
        raycaster.ray.at(ahead, lookAt)
      } else if (g.gaze.kind === 'ship') lookAt.fromArray(shipPose.position)
      else if (g.gaze.kind === 'planet' && g.gaze.planet) {
        const orbit = orbitByName.get(g.gaze.planet)
        if (orbit) lookAt.fromArray(planetPosition(system.rings[orbit.ring], orbit, simClock.time, planetAt))
      }
      const from = facePos.toArray() as Vec3
      const target = faceTarget(from, lookAt.toArray() as Vec3)
      target.yaw += g.saccadeYaw
      target.pitch += g.saccadePitch
      // A cabeça vira no máximo três-quartos para longe de quem vê (o rosto nunca some); os olhos vão até o alvo.
      const head = { yaw: limitTurnAway(target.yaw, faceTarget(from, camera.position.toArray() as Vec3).yaw), pitch: target.pitch }
      spring.current = reduced ? { ...FACE_AT_REST, ...head } : stepFaceSpring(spring.current, head, dt)
      const wobble = next.mode === 'hover' && !reduced ? Math.sin(t * 3) * 0.08 : 0
      face.current.rotation.set(-spring.current.pitch, spring.current.yaw, wobble, 'YXZ')
      // As pupilas vão na frente: andam para o alvo enquanto a mola ainda vira o rosto, em degraus (sem tremer).
      const pupilExpression = nowAdmiring ? 'admiring' : look.expression
      const rest = PUPIL[pupilExpression]
      pupilLook(pupilExpression, wrapAngle(target.yaw - spring.current.yaw), target.pitch - spring.current.pitch, pupilOut)
      SUN_UNIFORMS.uSunPupil.value.set(
        rest.x + quantizePupil(pupilOut[0] - rest.x, PUPIL_REACH),
        rest.y + quantizePupil(pupilOut[1] - rest.y, PUPIL_REACH),
        pupilOut[2],
      )
      // Aberração: ~1–2 px no limbo na visão geral, travada no close-up (cresce com o raio do sol na tela).
      const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180
      const screenRadius = sunScreenRadius(SUN_RADIUS, camera.position.distanceTo(facePos), fov, size.height * viewport.dpr)
      const limbPx = aberrationLimbPx(screenRadius)
      SUN_UNIFORMS.uSunAberration.value = limbPx
      SUN_UNIFORMS.uSunFringe.value = fringeRho(limbPx, screenRadius)
    }

    const k = 1 - Math.exp(-6 * dt)
    const glow = glowMaterial.uniforms.uOpacity
    // oxlint-disable-next-line react/immutability -- uniforms do Three.js são mutáveis por design
    glow.value += (sunGlowOpacity(bloom, look.glow) - glow.value) * k
    if (light.current) light.current.intensity += (2.2 * look.glow - light.current.intensity) * k
  })

  function handleClick(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation()
    machine.current = sunReducer(machine.current, { type: 'click' })
    if (!reduced) squash.current = kickSquash(squash.current, 'click')
    setMode('click')
    select({ kind: 'profile' })
  }

  return (
    <group ref={center}>
      <group ref={body}>
        <pointLight ref={light} decay={0} intensity={2.2} color="#FFF1C9" />
        <group ref={bounce}>
          <group ref={squashGroup}>
            <mesh
              ref={face}
              geometry={sunGeometry}
              material={sunMaterial}
              onClick={handleClick}
              onPointerOver={(e) => {
                e.stopPropagation()
                setHovered(true)
              }}
              onPointerOut={() => setHovered(false)}
            />
            <mesh geometry={glowGeometry} material={glowMaterial} raycast={NO_RAYCAST} />
          </group>
          <mesh geometry={hazeGeometry} material={hazeMaterial} raycast={NO_RAYCAST} />
        </group>
      </group>
    </group>
  )
}
