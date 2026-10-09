import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { usePointerDrag } from '@/hooks/usePointerDrag'
import { pickPlayLine, type OctocatExpression, type PlayLineGroup } from '@/lib/octocat/lines'
import {
  isDoubleTap,
  pickPart,
  type ShipPart,
  type Tap,
  type TouchedPart,
} from '@/lib/ship/focusGesture'
import { crashWobble } from '@/lib/crash/crashApproach'
import { newDizziness, resetDizziness, stepDizziness } from '@/lib/ship/dizzy'
import { COCKPIT, HEAD } from '@/lib/ship/geometry'
import { BARREL_ROLL_SECONDS, barrelRollAngle, newFidget, REACTION_SECONDS, reactionFor, stepFidget } from '@/lib/ship/play'
import { dragSpin, grabSpin, newSpin, releaseSpin, settleSpin, spinSpeed, stepSpin } from '@/lib/ship/spin'
import { useUniverse } from '@/store/universe'
import type { Gaze } from './octocatFace'

/** Cabeça do piloto no espaço da nave (para o olhar ir até a câmera). */
const HEAD_IN_SHIP = new THREE.Vector3(
  COCKPIT.position[0],
  COCKPIT.position[1] + HEAD.center[1] * COCKPIT.scale,
  COCKPIT.position[2],
)
/** Ângulo (rad) da câmera em relação ao rosto que leva os olhos ao máximo, na horizontal e na vertical. */
const GAZE_YAW = 0.9
const GAZE_PITCH = 0.6
/** Ritmo (1/s) com que os olhos vão para um novo ponto. */
const GAZE_RATE = 10
/** Entrada do usuário que conta para as mexidas de quando ninguém mexe (ver FIDGET_AFTER). */
const INPUT_EVENTS = ['pointerdown', 'pointermove', 'wheel', 'keydown'] as const

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v))

/** A peça de um objeto da nave: a marca dele ou do pai mais perto (`userData.part`), parando na raiz da nave. */
function partOf(object: THREE.Object3D, root: THREE.Object3D): ShipPart | null | undefined {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) {
    const part = o.userData.part as ShipPart | undefined
    if (part) return part
    if (o === root) return null
  }
  // fora da nave (um planeta atrás dela, por exemplo)
  return undefined
}

interface ShipPlayOptions {
  /** A nave está no modo de foco (estacionada, câmera em volta). */
  focused: boolean
  reduced: boolean
  /** Grupo de fora da nave: marca o fim da busca da peça tocada. */
  root: RefObject<THREE.Object3D | null>
  /** Toque no bocal: estouro curto da chama. */
  onBurst: () => void
}


/**
 * Brincadeira com a nave no modo de foco: arrastar na nave gira (com embalo; ver lib/ship/spin), tocar numa peça faz
 * a reação dela (lib/ship/play), dois toques dão um parafuso e, parado, o Octocat olha para quem vê. O arrasto que
 * começa na nave pega a trava da câmera (store/cameraLock: sem o giro de um ponteiro, a pinça segue); fora dela, a
 * câmera orbita como sempre.
 *
 * `update` roda no useFrame da nave (com o passo suavizado dela) e escreve o giro no grupo `spin`.
 */
export function useShipPlay({ focused, reduced, root, onBurst }: ShipPlayOptions) {
  const clock = useThree((s) => s.clock)
  const camera = useThree((s) => s.camera)
  const spin = useMemo(() => newSpin(), [])
  const fidget = useMemo(() => newFidget(), [])
  /** Olhar lido pelo piloto a cada quadro (sem re-render). */
  const gaze = useRef<Gaze>({ x: 0, y: 0 })
  const local = useMemo(() => new THREE.Vector3(), [])
  const [hop, setHop] = useState(0)
  const [wiggle, setWiggle] = useState({ seq: 0, index: 0 })
  const [waving, setWaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  // Tonto de tanto girar (lib/ship/dizzy): rosto em espiral, estrelinhas, bambeio e, ao voltar, a balançada de cabeça.
  const dizziness = useMemo(() => newDizziness(), [])
  const wobble = useMemo(() => ({ roll: 0, pitch: 0 }), [])
  const [dizzy, setDizzy] = useState(false)
  const [headShake, setHeadShake] = useState(0)
  /** s desde que ficou tonto (−1: não está), lido pelas estrelinhas a cada quadro. */
  const dizzySince = useRef(-1)
  const timers = useRef({ waveUntil: -1, lookUpUntil: -1, rollStart: -1 })
  const lastInput = useRef(0)
  const lastTap = useRef<Tap | null>(null)
  const lastLines = useRef<Partial<Record<PlayLineGroup, string>>>({})

  // sem entrada por um tempo: as mexidas (o relógio só conta no modo)
  useEffect(() => {
    if (!focused) return
    lastInput.current = performance.now()
    const mark = () => {
      lastInput.current = performance.now()
    }
    // na captura: o toque na nave para no canvas (ver onPointerDown) e não subiria até a janela
    for (const event of INPUT_EVENTS) window.addEventListener(event, mark, { passive: true, capture: true })
    return () => {
      for (const event of INPUT_EVENTS) window.removeEventListener(event, mark, { capture: true })
    }
  }, [focused])

  const say = useCallback((group: PlayLineGroup, expression: OctocatExpression) => {
    const text = pickPlayLine(group, lastLines.current[group] ?? null, Math.random)
    lastLines.current[group] = text
    useUniverse.getState().play(text, expression)
  }, [])

  const react = useCallback(
    (part: TouchedPart, tap: Tap) => {
      const now = clock.elapsedTime
      const double = isDoubleTap(lastTap.current, tap)
      lastTap.current = double ? null : tap
      if (double && !reduced) {
        // parafuso: uma volta em torno do eixo da nave
        timers.current.rollStart = now
        say('roll', 'happy')
        return
      }
      const r = reactionFor(part, reduced, Math.random)
      say(r.lines, r.expression)
      if (r.wave) {
        timers.current.waveUntil = now + REACTION_SECONDS
        setWaving(true)
      }
      if (r.lookUp) timers.current.lookUpUntil = now + REACTION_SECONDS
      if (r.hop) setHop((n) => n + 1)
      const tentacle = r.wiggle
      if (tentacle !== null) setWiggle((w) => ({ seq: w.seq + 1, index: tentacle }))
      if (r.burst) onBurst()
    },
    [clock, reduced, say, onBurst],
  )

  /** Peça apertada no começo do gesto (o toque reage nela). */
  const pressed = useRef<TouchedPart>('hull')
  // Arrasto na nave (lib/pointerDrag + trava da câmera com dono): gira; um toque reage; um segundo dedo vira pinça.
  const drag = usePointerDrag('ship', {
    onStart: (time) => {
      grabSpin(spin, time)
      setDragging(true)
    },
    onMove: (dx, dy, time) => {
      dragSpin(spin, dx, dy, time, reduced)
    },
    onStop: (fling, time) => {
      // sem embalo (fim perdido, pinça, tontura): soltar "muito depois" do último movimento
      releaseSpin(spin, fling ? time : Infinity, reduced)
      setDragging(false)
    },
    onTap: (x, y, time) => react(pressed.current, { time, x, y }),
  })
  // saindo do modo no meio de um arrasto: larga a nave e a trava
  useEffect(() => {
    if (!focused) drag.abort()
  }, [focused, drag])

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const ship = root.current
      if (!ship) return
      // nada atrás da nave (o sol, um planeta) leva este aperto; o evento nativo segue (câmera e inatividade o veem)
      e.stopPropagation()
      // fora do modo, ou tonto (até voltar a si): a nave não gira; o arrasto é da câmera, que orbita como no vazio
      if (!focused || dizziness.state !== 'ok') return
      pressed.current = pickPart(e.intersections.map((hit) => partOf(hit.object, ship)).filter((part) => part !== undefined))
      drag.begin(e)
    },
    [focused, root, dizziness, drag],
  )

  /** Um quadro: giro (solto ou voltando à pose de frente), olhar e parafuso, escritos em `spinGroup`. */
  const update = (dt: number, spinGroup: THREE.Object3D | null) => {
    const now = clock.elapsedTime
    const t = timers.current
    if (focused) {
      const event = stepDizziness(dizziness, spinSpeed(spin, performance.now()), dt, reduced)
      if (event === 'dizzy') {
        // girou demais: larga a nave na mão, o embalo para e ele reclama (o rosto em espiral vem do estado)
        // larga a nave na mão (sem embalo: o giro para) e solta a trava
        drag.abort()
        releaseSpin(spin, Infinity, reduced)
        say('dizzy', 'neutral')
        setDizzy(true)
      } else if (event === 'recovering') {
        setDizzy(false)
        setHeadShake((n) => n + 1)
      }
      stepSpin(spin, dt, reduced)
      stepFidget(fidget, (performance.now() - lastInput.current) / 1000, dt, Math.random)
    } else {
      if (dizziness.state !== 'ok') setDizzy(false)
      resetDizziness(dizziness)
      settleSpin(spin, dt, reduced)
      stepFidget(fidget, 0, dt, Math.random)
      t.rollStart = -1
      t.lookUpUntil = -1
    }
    dizzySince.current = dizziness.state === 'ok' ? -1 : dizziness.since
    // bambeio de bêbado enquanto tonto: o mesmo da volta depois da trombada
    crashWobble(dizziness.state === 'ok' ? -1 : dizziness.since, wobble)
    if (waving && now > t.waveUntil) setWaving(false)

    // olhar: para o Clawd (em cima), para a câmera ou em volta (parado), ou para a frente
    let gx = 0
    let gy = 0
    if (now < t.lookUpUntil) gy = -1
    else if (fidget.active && fidget.look !== 'camera') {
      gx = fidget.look.x
      gy = fidget.look.y
    } else if (fidget.active && spinGroup) {
      spinGroup.worldToLocal(local.copy(camera.position)).sub(HEAD_IN_SHIP)
      gx = clamp1(Math.atan2(local.x, local.z) / GAZE_YAW)
      gy = clamp1(-Math.atan2(local.y, Math.hypot(local.x, local.z)) / GAZE_PITCH)
    }
    const k = reduced ? 1 : 1 - Math.exp(-GAZE_RATE * dt)
    const g = gaze.current
    g.x += (gx - g.x) * k
    g.y += (gy - g.y) * k

    let roll = 0
    if (t.rollStart >= 0) {
      roll = barrelRollAngle(now - t.rollStart)
      if (now - t.rollStart > BARREL_ROLL_SECONDS) t.rollStart = -1
    }
    spinGroup?.rotation.set(spin.tilt + wobble.pitch, spin.yaw, roll + wobble.roll, 'YXZ')
  }

  return { onPointerDown, update, gaze, hop, wiggle, waving, dragging, dizzy, dizzySince, headShake }
}
