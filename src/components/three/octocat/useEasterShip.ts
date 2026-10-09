import { useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import { discoDance } from '@/lib/easter/disco'
import { BARREL_ROLL_SECONDS, barrelRollAngle, REACTION_SECONDS } from '@/lib/ship/play'
import { disco } from '@/store/disco'
import { showFx } from '@/store/show'

/**
 * A nave nos easter eggs (store/show e store/disco): as deixas do show do botão "Não clique aqui" (parafuso, estouro da chama,
 * pulinho do Clawd, aceno) e a dancinha do modo disco (quique, balanço e um parafuso ao acender). Tudo no grupo de
 * dentro da nave (o giro e o tranco), por cima do que a brincadeira do modo de foco já escreveu: a posição da nave no
 * caminho não muda. Parado com movimento reduzido.
 *
 * `update` roda no useFrame da nave, depois do `play.update`.
 */
export function useEasterShip({ onBurst, reduced }: { onBurst: () => void; reduced: boolean }) {
  const clock = useThree((s) => s.clock)
  const seen = useRef({ ...showFx })
  const [hop, setHop] = useState(0)
  const [waving, setWaving] = useState(false)
  const timers = useRef({ rollStart: -1, waveUntil: -1, waving: false, dance: 0 })
  const dance = useMemo(() => ({ bob: 0, sway: 0, roll: 0 }), [])

  const update = (dt: number, spin: THREE.Object3D | null, jolt: THREE.Object3D | null) => {
    const now = clock.elapsedTime
    const s = seen.current
    const t = timers.current
    if (showFx.roll !== s.roll) {
      s.roll = showFx.roll
      if (!reduced) t.rollStart = now
    }
    if (showFx.burst !== s.burst) {
      s.burst = showFx.burst
      if (!reduced) onBurst()
    }
    if (showFx.hop !== s.hop) {
      s.hop = showFx.hop
      if (!reduced) setHop((n) => n + 1)
    }
    if (showFx.wave !== s.wave) {
      s.wave = showFx.wave
      if (!reduced) {
        t.waveUntil = now + REACTION_SECONDS
        t.waving = true
        setWaving(true)
      }
    }
    if (t.waving && now > t.waveUntil) {
      t.waving = false
      setWaving(false)
    }
    let roll = 0
    if (t.rollStart >= 0) {
      roll = barrelRollAngle(now - t.rollStart)
      if (now - t.rollStart > BARREL_ROLL_SECONDS) t.rollStart = -1
    }
    // disco: o relógio da dança anda enquanto a festa está acesa (ou apagando) e recomeça na próxima
    const level = disco.level
    t.dance = level > 0 ? t.dance + dt : 0
    discoDance(t.dance, level, reduced, dance)
    if (spin) spin.rotation.z += roll + dance.roll + dance.sway
    if (jolt) jolt.position.y = dance.bob
  }

  return { update, hop, waving }
}
