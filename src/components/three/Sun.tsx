import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCursor } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import { aberrationLimbPx, fringeRho, sunScreenRadius } from '@/lib/sun/aberration'
import { showcasePlanet } from '@/lib/cameraPoses'
import { selectedPlanet } from '@/lib/interaction'
import { dizzyStars, hasEyes, hasSparkle, PUPIL, PUPIL_REACH, pupilLook, zzzState } from '@/lib/sun/face'
import { FACE_AT_REST, faceTarget, stepFaceSpring, wrapAngle, type FaceSpring } from '@/lib/sun/faceSpring'
import { headOffset, limitTurn, MOTION_AT_REST, quantizePupil, stepGazeMotion, type GazeMotion } from '@/lib/sun/gaze'
import { CALM, MOOD_AT_START, moodFor, stepMood, type MoodContext, type MoodState } from '@/lib/sun/mood'
import { deriveSunEvents, isClosePass, newSunEvents, newSunEventState, newSunSnapshot } from '@/lib/sun/sunEvents'
import {
  dragReducer,
  dragSpin,
  DRAG_IDLE,
  newDizziness,
  newSpin,
  releaseSpin,
  spinFlatten,
  stepDizziness,
  stepSpin,
  type DragEvent,
  type DragState,
} from '@/lib/sun/spin'
import { kickSquash, SQUASH_AT_REST, SQUASH_TARGET, squashScale, stepSquash, type Squash } from '@/lib/sun/squash'
import {
  CLICK_DURATION,
  INITIAL_SUN_STATE,
  nextBlinkDelay,
  SUN_LOOK,
  sunReducer,
  type SunExpression,
  type SunState,
} from '@/lib/sun/sunMachine'
import type { RepoBase } from '@/lib/types'
import { barycenterOffset } from '@/lib/universe/barycenter'
import { buildComets, cometPosition } from '@/lib/universe/comets'
import { planetPosition, SUN_RADIUS, type OrbitSystem, type Vec3 } from '@/lib/universe/orbits'
import { crashApology, crashTimeline } from '@/store/crash'
import { bloomLook, useBloom } from '@/store/bloom'
import { useCameraLock } from '@/store/cameraLock'
import { flightClock } from '@/store/frameClock'
import { usePresentation } from '@/store/presentation'
import { shipPose } from '@/store/shipPose'
import { simClock } from '@/store/simClock'
import { useTutorial } from '@/store/tutorial'
import { useUniverse } from '@/store/universe'
import { HitProxy } from './HitProxy'
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
  sunMask,
} from './sunMaterial'

const NEAR_DISTANCE = 9
const FOLLOW_MAX = 1.5
/** Brilho e névoa não entram no raycast (são maiores e roubariam o hover do rosto). */
const NO_RAYCAST = () => undefined

/** Para onde o mouse "está" para o olhar: no raio do ponteiro, um pouco à frente do sol (em raios do sol). */
const MOUSE_LOOK_AHEAD = 3
/** Nave "bem de lado" para quem vê: mais que isto entre a direção da nave e a da câmera, vistas do sol. */
const FAR_SIDE = (60 * Math.PI) / 180
/** Cometa "perto do periélio": a menos disto × o periélio do sol. */
const COMET_NEAR = 1.4
/** Sol tonto: balanço da cabeça (rad) e do corpo, e a fala do Octocat (pelo balão de falas livres). */
const DIZZY_WOBBLE = { yaw: 0.25, pitch: 0.12, roll: 0.08 }
const DIZZY_LINE = 'Coitado do sol…'
/** Piscada de transição entre humores (ms). */
const TRANSITION_BLINK_MS = 130

type SunRepo = Pick<RepoBase, 'name' | 'languages' | 'pushedAt' | 'lastCommit'>

/** O que só o Sun sabe (clique, entrada do usuário, aba); as transições do resto ficam em `deriveSunEvents`. */
interface SunInputs {
  started: boolean
  clickAt: number
  clickPending: boolean
  /** Quanto a aba ficou escondida (ms), informado uma vez no quadro seguinte à volta. */
  tabHiddenMs: number
  /** performance.now() da última entrada do usuário ou evento. */
  lastActivity: number
}

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
  const [blink, setBlink] = useState(false)
  // O rosto e a área de toque em volta (HitProxy) marcam o hover cada um no seu.
  const [faceHovered, setFaceHovered] = useState(false)
  const [proxyHovered, setProxyHovered] = useState(false)
  const hovered = faceHovered || proxyHovered
  // Humor coerente com o que acontece (mood.ts); o movimento pequeno do olhar vem de gaze.ts.
  const mood = useRef<MoodState>(MOOD_AT_START)
  const motion = useRef<GazeMotion>(MOTION_AT_REST)
  const moodCtx = useRef<MoodContext>({ ...CALM })
  const events = useRef<SunInputs>({ started: false, clickAt: -Infinity, clickPending: false, tabHiddenMs: 0, lastActivity: 0 })
  // Girar o sol arrastando (lib/sun/spin): o gesto, o giro com inércia e a tontura.
  const drag = useRef<DragState>(DRAG_IDLE)
  const spin = useRef(newSpin())
  const dizzy = useRef(newDizziness())
  const dragInput = useRef({ lastX: 0, dx: 0, spinAngle: 0 })
  const squashGoal = useRef({ puff: 0, stretch: 0 })
  const stars = useRef(dizzyStars(0))
  // Retrato da cena, estado e saída das transições (lib/sun/sunEvents): reaproveitados a cada quadro, sem alocar.
  const eventState = useRef(newSunEventState())
  const snapshotRef = useRef(newSunSnapshot())
  const sunEvents = useRef(newSunEvents())
  // Expressão do humor; repinta só quando muda. Começa acordado (cumprimentando), nunca dormindo.
  const [expression, setExpression] = useState<SunExpression>(MOOD_AT_START.mood.expression)
  const expressionNow = useRef<SunExpression>(MOOD_AT_START.mood.expression)
  // Toda troca de humor passa por uma piscada rápida (fechado → aberto: uma repintura por mudança visível).
  const [waking, setWaking] = useState(false)
  const wakeTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(wakeTimer.current), [])
  // Fechado só piscando e com olhos (viajando não tem): a textura só é refeita quando o desenho muda (ver `faceKey`).
  const closed = (blink || waking) && hasEyes(expression)
  const showcase = useMemo(() => showcasePlanet(repos), [repos])
  // Os mesmos cometas do Comets (a lista é fixa enquanto a página fica aberta), só para saber quando um passa perto.
  const [loadedAt] = useState(() => new Date())
  const comets = useMemo(() => buildComets(system, repos, loadedAt), [system, repos, loadedAt])
  const orbitByName = useMemo(() => new Map(system.orbits.map((o) => [o.name, o])), [system])
  useCursor(hovered)
  const select = useUniverse((s) => s.select)
  const reduced = useReducedMotion() ?? false
  const reducedRef = useRef(reduced)
  useEffect(() => {
    reducedRef.current = reduced
  }, [reduced])
  const bloomActive = useBloom((s) => s.active)
  const bloom = bloomLook(bloomActive)
  useEffect(() => {
    SUN_UNIFORMS.uSunMask.value = sunMask(bloomActive)
  }, [bloomActive])

  // Entrada do usuário (qualquer uma) adia o sono; a aba voltando depois de >10 s escondida acorda o sol.
  useEffect(() => {
    const ev = events.current
    const onInput = () => {
      ev.lastActivity = performance.now()
    }
    let hiddenAt = 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = performance.now()
      else if (hiddenAt) {
        // quanto ficou escondida: o próximo quadro passa para deriveSunEvents; zera para não contar duas vezes
        ev.tabHiddenMs = performance.now() - hiddenAt
        hiddenAt = 0
      }
    }
    const inputs = ['pointermove', 'pointerdown', 'wheel', 'keydown'] as const
    for (const name of inputs) window.addEventListener(name, onInput, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      for (const name of inputs) window.removeEventListener(name, onInput)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // Gesto de girar: começa no aperto sobre o sol (onSunPointerDown); o resto do gesto vem da janela.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current
      if (d.kind !== 'pending' && d.kind !== 'spin') return
      drag.current = dragReducer(d, { type: 'move', x: e.clientX, y: e.clientY })
      if (drag.current.kind === 'spin') dragInput.current.dx += e.clientX - dragInput.current.lastX
      dragInput.current.lastX = e.clientX
    }
    const onUp = () => {
      if (drag.current.kind === 'idle') return
      drag.current = dragReducer(drag.current, { type: 'up' })
      if (drag.current.released === 'spin') spin.current = releaseSpin(spin.current, reducedRef.current)
      useCameraLock.setState({ sunDrag: false })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      useCameraLock.setState({ sunDrag: false })
    }
  }, [])

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
    drawSunFace(ctx, expression, closed)
    // oxlint-disable-next-line react/immutability -- API imperativa de textura do Three.js
    texture.needsUpdate = true
  }, [expression, closed, texture])

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
  const zzz = useMemo(() => zzzState(0, false), [])
  const lookAt = useMemo(() => new THREE.Vector3(), [])
  const planetAt = useMemo<Vec3>(() => [0, 0, 0], [])
  const cometAt = useMemo<Vec3>(() => [0, 0, 0], [])
  const nearComet = useMemo(() => new THREE.Vector3(), [])
  const toShip = useMemo(() => new THREE.Vector3(), [])
  const toCamera = useMemo(() => new THREE.Vector3(), [])

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
    if (next.mode !== machine.current.mode && !reduced) squash.current = kickSquash(squash.current, next.mode)
    machine.current = next
    const look = SUN_LOOK[next.mode]
    const t = clock.elapsedTime
    // Um relógio só para o balanço, as manchas, a textura e a névoa; parado sob movimento reduzido.
    if (!reduced) SUN_UNIFORMS.uSunTime.value = t

    // Girar o sol: arrastando segue o mouse; solto, inércia e freio (passo suavizado da cena, igual em qualquer fps).
    const sdt = flightClock.step(t, dt)
    if (drag.current.kind === 'spin') {
      spin.current = dragSpin(spin.current, dragInput.current.dx, sdt, reduced)
      dragInput.current.dx = 0
    } else spin.current = stepSpin(spin.current, sdt, reduced)
    // movimento reduzido: o arrasto gira direto e, solto, o rosto volta na hora (sem inércia nem mola)
    if (reduced && drag.current.kind !== 'spin') spin.current = newSpin()
    const spinStep = spin.current.angle - dragInput.current.spinAngle
    dragInput.current.spinAngle = spin.current.angle
    const wasDizzy = dizzy.current.dizzyLeft > 0
    dizzy.current = stepDizziness(dizzy.current, spin.current.velocity, sdt, reduced)
    const dizzyNow = dizzy.current.dizzyLeft > 0
    // ficou tonto: o Octocat comenta (pelo balão de falas livres que já existe)
    if (dizzyNow && !wasDizzy) useUniverse.getState().say(DIZZY_LINE, 'surprised')
    const wobbleW = dizzyNow ? Math.min(1, dizzy.current.dizzyLeft / 0.5) : 0

    // Squash & stretch: "puff" no hover, achata-estica-assenta no clique, murcha no away; girando rápido, achata.
    const baseGoal = SQUASH_TARGET[next.mode]
    squashGoal.current.puff = baseGoal.puff
    squashGoal.current.stretch = baseGoal.stretch + spinFlatten(spin.current.velocity)
    squash.current = reduced ? SQUASH_AT_REST : stepSquash(squash.current, squashGoal.current, dt)
    squashGroup.current?.scale.fromArray(squashScale(squash.current, scaleOut))

    // Corpo segue o mouse com atraso quando ele está perto; senão volta ao centro.
    goal.set(0, 0, 0)
    // girando o sol, o corpo fica no lugar (não corre atrás do mouse)
    if (next.mode === 'hover' && !reduced && drag.current.kind === 'idle') goal.copy(hit).setY(0).clampLength(0, FOLLOW_MAX)
    body.current?.position.lerp(goal, 1 - Math.exp(-3 * dt))

    if (bounce.current) {
      const progress = next.mode === 'click' ? 1 - next.clickLeft / CLICK_DURATION : 0
      bounce.current.position.y = reduced ? 0 : Math.sin(progress * Math.PI) * 0.8
      bounce.current.position.x = !reduced && next.mode === 'click' ? Math.sin(t * 60) * 0.05 : 0
      bounce.current.scale.setScalar(!reduced && next.mode === 'idle' ? 1 + Math.sin(t * 1.6) * 0.03 : 1)
      // tonto: o corpo balança
      bounce.current.rotation.z = DIZZY_WOBBLE.roll * wobbleW * Math.sin(t * 5)
    }

    // Humor coerente com o que acontece: retrato da cena (stores, nave, trombada, cometas, aba) → eventos → tabela.
    const ev = events.current
    if (!ev.started) {
      ev.started = true
      ev.lastActivity = performance.now()
    }
    if (ev.clickPending) {
      ev.clickPending = false
      ev.clickAt = t
    }
    const { selection } = useUniverse.getState()
    const traveling = shipPose.mode === 'traveling' || shipPose.mode === 'returning'
    toShip.fromArray(shipPose.position).sub(sunAt)
    toCamera.copy(camera.position).sub(sunAt)
    // cometa perto do periélio (o mais perto)
    let cometNear = false
    let best = Infinity
    for (const c of comets) {
      cometPosition(c, simClock.time, cometAt)
      const d = Math.hypot(cometAt[0] - sunAt.x, cometAt[1] - sunAt.y, cometAt[2] - sunAt.z)
      if (d < COMET_NEAR * c.a * (1 - c.e) && d < best) {
        best = d
        cometNear = true
        nearComet.fromArray(cometAt)
      }
    }
    const snapshot = snapshotRef.current
    snapshot.t = t
    snapshot.profileOpen = selection.kind === 'profile'
    snapshot.mode = next.mode
    snapshot.shipMode = shipPose.mode
    snapshot.shipTarget = shipPose.target?.kind === 'planet' ? shipPose.target.name : null
    snapshot.crashActive = crashTimeline.since >= 0 && crashTimeline.cancelledAt < 0
    snapshot.apologies = crashApology.count
    snapshot.cometNear = cometNear
    snapshot.tabHiddenMs = ev.tabHiddenMs
    ev.tabHiddenMs = 0
    const happened = deriveSunEvents(eventState.current, snapshot, sunEvents.current)
    const ctx = moodCtx.current
    ctx.hover = next.mode === 'hover'
    ctx.dizzy = dizzyNow
    ctx.sinceClick = t - ev.clickAt
    ctx.crash = happened.crash
    ctx.shipTraveling = traveling
    // brincando com a nave em foco: o sol fica de olho (só lê o modo da nave)
    ctx.shipPlay = shipPose.mode === 'focus'
    // raspão (cobre o estilingue): só pela distância, sem depender do sinal da nave
    ctx.closePass = isClosePass(traveling, toShip.length() / SUN_RADIUS)
    ctx.shipFarSide = toShip.angleTo(toCamera) > FAR_SIDE
    ctx.sinceArrival = happened.sinceArrival
    ctx.arrivalPlanet = happened.arrivalPlanet
    ctx.focusPlanet = selectedPlanet(selection) ?? focusedPlanet(showcase)
    ctx.profileOpen = snapshot.profileOpen
    ctx.cometNear = cometNear
    ctx.sinceCometNear = happened.sinceCometNear
    ctx.sinceTabReturn = happened.sinceTabReturn
    ctx.sinceStart = happened.sinceStart
    ctx.tutorialWelcome = useTutorial.getState().step === 'welcome'
    ctx.sinceLeave = happened.sinceLeave
    // qualquer evento conta como atividade: o sono só vem com nada acontecendo
    ctx.idleFor = 0
    if (moodFor(ctx).rank > 0) ev.lastActivity = performance.now()
    ctx.idleFor = (performance.now() - ev.lastActivity) / 1000
    mood.current = stepMood(mood.current, ctx, dt)
    const m = mood.current.mood
    motion.current = stepGazeMotion(motion.current, reduced, dt, Math.random)
    const nowExpression = m.expression
    if (nowExpression !== expressionNow.current) {
      if (!reduced && hasEyes(nowExpression)) {
        setWaking(true)
        window.clearTimeout(wakeTimer.current)
        wakeTimer.current = window.setTimeout(() => setWaking(false), TRANSITION_BLINK_MS)
      }
      expressionNow.current = nowExpression
      setExpression(nowExpression)
    }
    SUN_UNIFORMS.uSunSparkle.value = hasSparkle(nowExpression) ? 1 : 0
    // "Z z z" do sol dormindo: aparece e some suave; parado ("Z z z") sob movimento reduzido.
    const sleepy = SUN_UNIFORMS.uSunBubble
    sleepy.value += ((nowExpression === 'viajando' ? 1 : 0) - sleepy.value) * (1 - Math.exp(-8 * dt))
    zzzState(SUN_UNIFORMS.uSunTime.value, reduced, zzz)
    for (let i = 0; i < 3; i++) SUN_UNIFORMS.uSunZ.value[i].set(zzz[i].x, zzz[i].y, zzz[i].size, zzz[i].alpha)
    // tonto: estrelinhas girando acima das sobrancelhas (no shader, sem repintar)
    const dizzyGlow = SUN_UNIFORMS.uSunDizzy
    dizzyGlow.value += ((nowExpression === 'tonto' ? 1 : 0) - dizzyGlow.value) * (1 - Math.exp(-8 * dt))
    dizzyStars(t, stars.current)
    for (let i = 0; i < 3; i++) SUN_UNIFORMS.uSunStars.value[i].set(stars.current[i].x, stars.current[i].y, stars.current[i].size, stars.current[i].alpha)

    if (face.current) {
      face.current.getWorldPosition(facePos)
      // o alvo do humor: quem vê (e à deriva, dormindo), o mouse, a nave, o planeta ou o cometa
      lookAt.copy(camera.position)
      if (m.target === 'mouse') {
        const ahead = Math.max(1, camera.position.distanceTo(facePos) - MOUSE_LOOK_AHEAD * SUN_RADIUS)
        raycaster.ray.at(ahead, lookAt)
      } else if (m.target === 'ship') lookAt.fromArray(shipPose.position)
      else if (m.target === 'comet') lookAt.copy(nearComet)
      else if (m.target === 'planet' && m.planet) {
        const orbit = orbitByName.get(m.planet)
        if (orbit) lookAt.fromArray(planetPosition(system.rings[orbit.ring], orbit, simClock.time, planetAt))
      }
      const from = facePos.toArray() as Vec3
      const target = faceTarget(from, lookAt.toArray() as Vec3)
      const [offsetYaw, offsetPitch] = headOffset(motion.current, m.target === 'drift')
      // tonto: a cabeça balança
      target.yaw += offsetYaw + DIZZY_WOBBLE.yaw * wobbleW * Math.sin(t * 6)
      target.pitch += offsetPitch + DIZZY_WOBBLE.pitch * wobbleW * Math.sin(t * 4.3)
      // Olhando longe, o rosto desliza pela esfera até 55° de quem vê (pitch limitado); os olhos vão até o alvo.
      const toViewer = faceTarget(from, camera.position.toArray() as Vec3)
      const head = limitTurn(target, toViewer)
      // girando, o rosto vai junto com o corpo (a mola segura o atraso e o traz de volta quando o giro freia)
      if (reduced) spring.current = { ...FACE_AT_REST, ...head, yaw: head.yaw + spin.current.angle }
      else {
        if (spinStep !== 0) spring.current = { ...spring.current, yaw: wrapAngle(spring.current.yaw + spinStep) }
        spring.current = stepFaceSpring(spring.current, head, dt)
      }
      const wobble = next.mode === 'hover' && !reduced ? Math.sin(t * 3) * 0.08 : 0
      face.current.rotation.set(-spring.current.pitch, spring.current.yaw, wobble, 'YXZ')
      // As pupilas vão na frente: andam para o alvo enquanto a mola ainda vira o rosto, em degraus (sem tremer).
      // De olho/admirando, a pupila corre para a borda do lado para onde a cabeça já virou.
      const rest = PUPIL[nowExpression]
      pupilLook(
        nowExpression,
        wrapAngle(target.yaw - spring.current.yaw),
        target.pitch - spring.current.pitch,
        pupilOut,
        wrapAngle(spring.current.yaw - toViewer.yaw),
        spring.current.pitch - toViewer.pitch,
      )
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

  // Aperto sobre o sol: começa um gesto (pode virar giro ou clique) e trava a rotação da câmera até soltar.
  function onSunPointerDown(e: ThreeEvent<PointerEvent>) {
    // No modo de foco na nave, o arrasto é da câmera em volta dela: o sol não gira nem trava a câmera (o clique nele
    // ainda seleciona o perfil e sai do modo).
    if (useUniverse.getState().selection.kind === 'ship') return
    e.stopPropagation()
    const event: DragEvent = { type: 'down', onSun: true, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
    drag.current = dragReducer(drag.current, event)
    dragInput.current.lastX = e.nativeEvent.clientX
    dragInput.current.dx = 0
    events.current.lastActivity = performance.now()
    useCameraLock.setState({ sunDrag: true })
  }

  function handleClick(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation()
    // o gesto foi um giro, não um clique: não seleciona
    if (drag.current.released === 'spin') return
    machine.current = sunReducer(machine.current, { type: 'click' })
    events.current.clickPending = true
    events.current.lastActivity = performance.now()
    if (!reduced) squash.current = kickSquash(squash.current, 'click')
    select({ kind: 'profile' })
  }

  return (
    <group ref={center}>
      {/* na visão geral do celular o sol tem ~10 px: a área de toque tem no mínimo ~44 px de diâmetro */}
      <HitProxy
        radius={SUN_RADIUS}
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation()
          setProxyHovered(true)
        }}
        onPointerOut={() => setProxyHovered(false)}
        onPointerDown={onSunPointerDown}
      />
      <group ref={body}>
        <pointLight ref={light} decay={0} intensity={2.2} color="#FFF1C9" />
        <group ref={bounce}>
          <group ref={squashGroup}>
            <mesh
              ref={face}
              geometry={sunGeometry}
              material={sunMaterial}
              onClick={handleClick}
              onPointerDown={onSunPointerDown}
              onPointerOver={(e) => {
                e.stopPropagation()
                setFaceHovered(true)
              }}
              onPointerOut={() => setFaceHovered(false)}
            />
            <mesh geometry={glowGeometry} material={glowMaterial} raycast={NO_RAYCAST} />
          </group>
          <mesh geometry={hazeGeometry} material={hazeMaterial} raycast={NO_RAYCAST} />
        </group>
      </group>
    </group>
  )
}
