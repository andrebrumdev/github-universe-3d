import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { MAX_FRAME_DT } from '@/lib/ship/motion'
import { bloomLook, useBloom } from '@/store/bloom'
import { shipPose } from '@/store/shipPose'
import {
  CONTRAIL_BRIGHTNESS,
  CONTRAIL_CAPACITY,
  CONTRAIL_SAMPLE_INTERVAL,
  CONTRAIL_SECONDS,
  contrailHalfWidth,
  createContrailMaterial,
  easeContrail,
  setContrailOpacity,
} from './contrailMaterial'
import { Ribbon } from './trailRibbon'

/** Quadros em que as faixas desenham vazias na montagem, para o programa compilar antes do primeiro voo. */
const WARMUP_FRAMES = 3

/** Ponta de cada asa no espaço do modelo da nave: a luzinha de trás de cada uma (perto da ponta, ver WINGS). */
export type WingTips = readonly (readonly [number, number, number])[]

/** Estado do vapor entre quadros (mutável no lugar). */
class ContrailState {
  emit = 0
  /** Último instante em que alguma asa soltou vapor (s do relógio): passado CONTRAIL_SECONDS, a faixa esvazia. */
  lastEmit = -Infinity
  flying = false
  frames = 0
  /** Um voo novo começou (de parada): esvazia o que sobrou do anterior. */
  departed(flying: boolean): boolean {
    const started = flying && !this.flying
    this.flying = flying
    return started
  }

  /** Avança a emissão em direção a `on`; devolve se ainda há vapor para desenhar. */
  step(on: boolean, dt: number, now: number): boolean {
    this.emit = easeContrail(this.emit, on, dt)
    if (this.emit > 0) this.lastEmit = now
    return now - this.lastEmit <= CONTRAIL_SECONDS + 0.1
  }

  /** Nos primeiros quadros as faixas desenham (vazias) para o programa compilar. */
  warming(): boolean {
    return this.frames++ < WARMUP_FRAMES
  }
}

/**
 * Rastro de vapor das pontas das asas: só na planagem (`shipPose.coasting`, motor principal na chama-piloto entre as queimas),
 * acendendo devagar quando ela começa e parando de soltar quando a queima de chegada acende — o que já saiu some
 * sozinho em CONTRAIL_SECONDS. Em coordenadas do mundo: monte como irmão do grupo da nave (mesmo pai, sem
 * transformação), sempre montado com movimento (o vapor some depois da chegada e o programa compila na montagem).
 * As pontas saem de `ship` (posição, rotação e escala do grupo) e de `tips` (espaço do modelo), como o bocal do
 * FireTrail.
 */
export function Contrails({ ship, tips }: { ship: RefObject<THREE.Object3D | null>; tips: WingTips }) {
  const ribbons = useMemo(
    () =>
      tips.map(
        () =>
          new Ribbon({
            seconds: CONTRAIL_SECONDS,
            capacity: CONTRAIL_CAPACITY,
            sampleInterval: CONTRAIL_SAMPLE_INTERVAL,
            halfWidth: contrailHalfWidth,
          }),
      ),
    [tips],
  )
  const material = useMemo(() => createContrailMaterial(), [])
  useEffect(
    () => () => {
      for (const r of ribbons) r.dispose()
      material.dispose()
    },
    [ribbons, material],
  )
  const state = useMemo(() => new ContrailState(), [])
  const meshes = useRef<(THREE.Mesh | null)[]>([])
  const tip = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ camera, clock }, rawDt) => {
    const g = ship.current
    if (!g) return
    const dt = Math.min(rawDt, MAX_FRAME_DT)
    const now = clock.elapsedTime
    // todo voo: viagem (troca de destino, apresentação, tutorial) e a volta para a escolta
    const flying = shipPose.mode === 'traveling' || shipPose.mode === 'returning'
    if (state.departed(flying)) for (const r of ribbons) r.clear()
    const live = state.step(flying && shipPose.coasting, dt, now)
    const warm = state.warming()
    for (let i = 0; i < ribbons.length; i++) {
      const mesh = meshes.current[i]
      if (mesh) mesh.visible = live || warm
      if (!live) continue
      const [x, y, z] = tips[i]
      tip.set(x, y, z).multiply(g.scale).applyQuaternion(g.quaternion).add(g.position)
      ribbons[i].update(tip, now, camera.position, 0, state.emit)
    }
    setContrailOpacity(material, CONTRAIL_BRIGHTNESS * bloomLook(useBloom.getState().active).contrail)
  })

  return (
    <>
      {ribbons.map((r, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshes.current[i] = m
          }}
          geometry={r.geometry}
          material={material}
          frustumCulled={false}
          raycast={() => null}
        />
      ))}
    </>
  )
}
