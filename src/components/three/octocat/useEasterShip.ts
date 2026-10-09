import { useMemo, useRef } from 'react'
import type * as THREE from 'three'
import { discoDance } from '@/lib/easter/disco'
import { disco } from '@/store/disco'

/**
 * A nave nos easter eggs (store/disco): a dancinha do modo disco (quique, balanço e um parafuso ao acender). No grupo
 * de dentro da nave (o giro e o tranco), por cima do que a brincadeira do modo de foco já escreveu: a posição da nave
 * no caminho não muda. Parada com movimento reduzido.
 *
 * `update` roda no useFrame da nave, depois do `play.update`.
 */
export function useEasterShip({ reduced }: { reduced: boolean }) {
  const timers = useRef({ dance: 0 })
  const dance = useMemo(() => ({ bob: 0, sway: 0, roll: 0 }), [])

  const update = (dt: number, spin: THREE.Object3D | null, jolt: THREE.Object3D | null) => {
    const t = timers.current
    // disco: o relógio da dança anda enquanto a festa está acesa (ou apagando) e recomeça na próxima
    const level = disco.level
    t.dance = level > 0 ? t.dance + dt : 0
    discoDance(t.dance, level, reduced, dance)
    if (spin) spin.rotation.z += dance.roll + dance.sway
    if (jolt) jolt.position.y = dance.bob
  }

  return { update }
}
