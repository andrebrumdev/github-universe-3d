import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import type * as THREE from 'three'
import { useBloom } from '@/store/bloom'
import { createPlumeGeometry, createPlumeMaterial } from './CoastPlume'
import { CONTRAIL_CAPACITY, CONTRAIL_SAMPLE_INTERVAL, CONTRAIL_SECONDS, contrailHalfWidth, createContrailMaterial } from './contrailMaterial'
import { createPuffMaterial, PuffPool } from './puffParticles'
import { Ribbon } from './trailRibbon'

/** Quadros em que as peças vazias desenham a cada aquecimento (o primeiro já compila; os outros cobrem um pulado). */
const WARMUP_FRAMES = 3

/**
 * Pré-compila os programas do vapor das asas, da pluma da chama-piloto e dos puffs de ré, como o TrailWarmup faz com
 * o rastro de fogo: cada um desenha vazio (faixa sem pontos, pluma de opacidade 0, nenhum puff) com um material do
 * mesmo tipo nos primeiros quadros, e de novo quando o bloom liga ou desliga — com ele a cena desenha no alvo do
 * EffectComposer e a chave do programa muda, e o bloom monta depois da cena. Depois fica invisível e montado:
 * enquanto estes materiais vivem, o three guarda os programas, e o Contrails, o CoastPlume e o RetroPuffs os
 * reaproveitam no primeiro voo em vez de compilar no meio dele. Sem movimento, esses efeitos nem montam.
 */
export function FlightWarmup() {
  const reduced = useReducedMotion() ?? false
  return reduced ? null : <FlightWarmupParts />
}

function FlightWarmupParts() {
  const parts = useMemo(() => {
    const contrail = new Ribbon({
      seconds: CONTRAIL_SECONDS,
      capacity: CONTRAIL_CAPACITY,
      sampleInterval: CONTRAIL_SAMPLE_INTERVAL,
      halfWidth: contrailHalfWidth,
    })
    const puffs = new PuffPool()
    return [
      { geometry: contrail.geometry, material: createContrailMaterial() },
      { geometry: createPlumeGeometry(), material: createPlumeMaterial() },
      { geometry: puffs.geometry, material: createPuffMaterial() },
    ]
  }, [])
  useEffect(
    () => () => {
      for (const { geometry, material } of parts) {
        geometry.dispose()
        material.dispose()
      }
    },
    [parts],
  )
  const group = useRef<THREE.Group>(null)
  const frames = useRef(0)
  const bloomActive = useBloom((s) => s.active)
  useEffect(() => {
    frames.current = 0
    if (group.current) group.current.visible = true
  }, [bloomActive])
  useFrame(() => {
    if (frames.current > WARMUP_FRAMES || !group.current) return
    frames.current++
    if (frames.current > WARMUP_FRAMES) group.current.visible = false
  })
  return (
    <group ref={group}>
      {parts.map(({ geometry, material }, i) => (
        <mesh key={i} geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />
      ))}
    </group>
  )
}
