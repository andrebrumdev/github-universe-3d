import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import { bloomLook, useBloom } from '@/store/bloom'
import { flightClock } from '@/store/frameClock'
import { shipPose } from '@/store/shipPose'
import { BURN_TRAIL_SPEED, createTrailMaterial, createTrailParams, easeSlingshot, trailParams, updateTrailMaterial } from './trailMaterial'
import { TrailRibbon } from './trailRibbon'

/** Taxa (1/s) com que a velocidade medida pelo deslocamento do bocal assenta (só vale fora da viagem: a volta). */
const MEASURED_SPEED_RATE = 6

/**
 * Rastro de fogo da nave, em coordenadas do mundo: monte como irmão do grupo da nave (mesmo pai, sem transformação) e
 * só em voo. Monta vazio (sem semear pontos) e cresce do bocal.
 *
 * O bocal sai de `ship` (posição, rotação e escala do grupo) e de `nozzle` (no espaço local da nave), calculado aqui e
 * não por `localToWorld` (a matrixWorld só é refeita no render, um quadro atrasada). O useFrame daqui roda depois do
 * da nave porque este componente monta depois (o R3F mantém a ordem de inscrição na mesma prioridade).
 *
 * A velocidade vem de `shipPose.velocity` (analítica, na viagem); na volta para a escolta ela é zero, e vale a
 * velocidade medida pelo deslocamento do bocal. O estilingue vem de `shipPose.slingshot`. A emissão vem do motor
 * (`shipPose.engine`, ver `burnPhase`): forte nas queimas; na planagem nada novo sai quente e o que saiu esfria e some.
 * Material e geometria são deste rastro e são descartados ao desmontar.
 */
export function FireTrail({ ship, nozzle }: { ship: RefObject<THREE.Object3D | null>; nozzle: readonly [number, number, number] }) {
  const reduced = useReducedMotion() ?? false
  const ribbon = useMemo(() => new TrailRibbon(), [])
  const material = useMemo(() => createTrailMaterial(), [])
  useEffect(
    () => () => {
      ribbon.dispose()
      material.dispose()
    },
    [ribbon, material],
  )
  const params = useMemo(() => createTrailParams(), [])
  const head = useMemo(() => new THREE.Vector3(), [])
  const lastHead = useMemo(() => new THREE.Vector3(), [])
  const state = useRef({ boost: 0, measured: 0, started: false })

  useFrame(({ camera, clock }, rawDt) => {
    const g = ship.current
    if (!g) return
    // o passo com que a nave andou neste quadro (store/frameClock): a velocidade medida do bocal não treme
    const dt = flightClock.step(clock.elapsedTime, rawDt)
    const st = state.current
    head.set(nozzle[0], nozzle[1], nozzle[2]).multiply(g.scale).applyQuaternion(g.quaternion).add(g.position)
    if (st.started && dt > 0) st.measured += (head.distanceTo(lastHead) / dt - st.measured) * (1 - Math.exp(-MEASURED_SPEED_RATE * dt))
    lastHead.copy(head)
    st.started = true

    const [vx, vy, vz] = shipPose.velocity
    const analytic = Math.hypot(vx, vy, vz)
    const speed = analytic > 1e-6 ? analytic : st.measured
    // o fogo segue o motor: quente nas queimas (mesmo saindo devagar da partida), nada novo na planagem
    const engine = shipPose.engine
    trailParams(Math.max(speed, engine * BURN_TRAIL_SPEED), 0, params)
    // o estilingue cai na planagem: sobrevoo de graça, motor na chama-piloto, o fogo não esquenta
    st.boost = easeSlingshot(st.boost, shipPose.slingshot && engine > 0, dt)
    ribbon.update(head, clock.elapsedTime, camera.position, params.heat + 0.4 * st.boost, engine)
    updateTrailMaterial(material, params, st.boost, bloomLook(useBloom.getState().active).trail, reduced ? 0 : dt)
  })

  // Atrás da chama: desenhado antes dela (renderOrder −1) e sem escrever profundidade, como ela; os dois são aditivos,
  // então o rastro só soma luz e nunca cobre o cone da chama no bocal.
  return <mesh geometry={ribbon.geometry} material={material} frustumCulled={false} renderOrder={-1} raycast={() => null} />
}

/** Quadros em que o aquecimento fica visível (o primeiro já compila; os outros cobrem um quadro pulado). */
const WARMUP_FRAMES = 3

/**
 * Compila o programa do rastro logo depois da montagem, para o primeiro voo não travar compilando um shader no meio
 * do clique: uma faixa vazia (drawRange 0, nada aparece) com o mesmo material renderiza nos primeiros quadros, no
 * mesmo caminho do render de verdade (com ou sem o EffectComposer, então a chave do programa é a mesma). Depois fica
 * invisível e montada: enquanto este material vive, o three guarda o programa, e o FireTrail de cada voo o reaproveita.
 * O programa muda com o bloom (com ele, a cena desenha no alvo do EffectComposer: sem tone mapping e em sRGB linear),
 * e o bloom monta depois da cena: quando ele liga ou desliga, aquece de novo. Sem isso, cada voo compilava o programa
 * do rastro e o largava na chegada.
 */
export function TrailWarmup() {
  const ribbon = useMemo(() => new TrailRibbon(), [])
  const material = useMemo(() => createTrailMaterial(), [])
  useEffect(
    () => () => {
      ribbon.dispose()
      material.dispose()
    },
    [ribbon, material],
  )
  const mesh = useRef<THREE.Mesh>(null)
  const frames = useRef(0)
  const bloomActive = useBloom((s) => s.active)
  useEffect(() => {
    frames.current = 0
    if (mesh.current) mesh.current.visible = true
  }, [bloomActive])
  useFrame(() => {
    if (frames.current > WARMUP_FRAMES || !mesh.current) return
    frames.current++
    if (frames.current > WARMUP_FRAMES) mesh.current.visible = false
  })
  return <mesh ref={mesh} geometry={ribbon.geometry} material={material} frustumCulled={false} raycast={() => null} />
}
