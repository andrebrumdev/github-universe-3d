import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { bloomLook, useBloom } from '@/store/bloom'
import { flightClock } from '@/store/frameClock'
import { shipPose } from '@/store/shipPose'
import { createPuffMaterial, PUFF_BRIGHTNESS, PuffPool, setPuffOpacity } from './puffParticles'

/** Quadros em que o pool desenha vazio na montagem, para o programa compilar antes do primeiro voo. */
const WARMUP_FRAMES = 3
/** Taxa (1/s) com que a velocidade medida da nave assenta (a volta não tem velocidade analítica). */
const MEASURED_RATE = 10

export type Nozzles = readonly (readonly [number, number, number])[]

/** Estado entre quadros (mutável no lugar). */
class PuffState {
  seq = 0
  frames = 0
  started = false
  flying = false
  readonly last = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  private readonly delta = new THREE.Vector3()

  /** Um voo novo começou (de parada)? O que sobrou do anterior é esvaziado. */
  departed(flying: boolean): boolean {
    const started = flying && !this.flying
    this.flying = flying
    return started
  }

  /** Um puff novo desde o último quadro? */
  fresh(seq: number): boolean {
    const isNew = seq !== this.seq
    this.seq = seq
    return isNew
  }

  /** Velocidade da nave pelo deslocamento (suavizada); a analítica da viagem vale quando existe. */
  measure(position: THREE.Vector3, dt: number, analytic: readonly number[]): THREE.Vector3 {
    if (Math.hypot(analytic[0], analytic[1], analytic[2]) > 1e-6) this.velocity.set(analytic[0], analytic[1], analytic[2])
    else if (this.started && dt > 0) {
      const k = 1 - Math.exp(-MEASURED_RATE * dt)
      this.velocity.lerp(this.delta.copy(position).sub(this.last).multiplyScalar(1 / dt), k)
    }
    this.last.copy(position)
    this.started = true
    return this.velocity
  }

  warming(): boolean {
    return this.frames++ < WARMUP_FRAMES
  }
}

/**
 * Jatinhos de ré da frenagem: a cada puff (`shipPose.puff.seq`), os dois bicos da frente do casco (`nozzles`, espaço
 * do modelo, ao lado dos faróis) soltam um clarão e nuvenzinhas de vapor para a frente, no sentido da viagem
 * (`shipPose.tangent`). Em coordenadas do mundo, como irmão do grupo da nave; sempre montado com movimento (as nuvens
 * somem sozinhas depois da chegada e o programa compila na montagem).
 */
export function RetroPuffs({ ship, nozzles }: { ship: RefObject<THREE.Object3D | null>; nozzles: Nozzles }) {
  const pool = useMemo(() => new PuffPool(), [])
  const material = useMemo(() => createPuffMaterial(), [])
  useEffect(
    () => () => {
      pool.dispose()
      material.dispose()
    },
    [pool, material],
  )
  const state = useMemo(() => new PuffState(), [])
  const mesh = useRef<THREE.Mesh>(null)
  const nozzle = useMemo(() => new THREE.Vector3(), [])
  const forward = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ clock }, rawDt) => {
    const g = ship.current
    if (!g) return
    // o passo com que a nave andou neste quadro (monta depois do ShipRig): a velocidade medida não treme
    const dt = flightClock.step(clock.elapsedTime, rawDt)
    if (state.departed(shipPose.mode === 'traveling' || shipPose.mode === 'returning')) pool.clear()
    const velocity = state.measure(g.position, dt, shipPose.velocity)
    if (state.fresh(shipPose.puff.seq)) {
      // para a frente no sentido do movimento (na volta a nave já vira de frente para a lente; o puff não)
      const [tx, ty, tz] = shipPose.tangent
      if (velocity.lengthSq() > 0.25) forward.copy(velocity).normalize()
      else forward.set(tx, ty, tz).normalize()
      for (const [x, y, z] of nozzles) {
        nozzle.set(x, y, z).multiply(g.scale).applyQuaternion(g.quaternion).add(g.position)
        pool.burst(nozzle, forward, velocity, shipPose.puff.strength, shipPose.puff.scale)
      }
    }
    pool.update(dt)
    const warm = state.warming()
    if (mesh.current) mesh.current.visible = pool.count > 0 || warm
    setPuffOpacity(material, PUFF_BRIGHTNESS * bloomLook(useBloom.getState().active).puff)
  })

  return <mesh ref={mesh} geometry={pool.geometry} material={material} frustumCulled={false} raycast={() => null} />
}
