import { useReducedMotion } from 'framer-motion'
import type { OrbitSystem } from '@/lib/universe/orbits'
import { useDisco } from '@/store/disco'
import { DiscoBeams } from './DiscoBeams'
import { MeteorRain } from './MeteorRain'

/**
 * Fachos do globo e chuva de estrelas do modo disco: montam só enquanto a festa está acesa ou apagando (fora dela não
 * custam nada) e nunca com movimento reduzido (aí fica só o sol-globo parado e a fala).
 */
export function DiscoEffects({ system, starRadius }: { system: OrbitSystem; starRadius: number }) {
  const reduced = useReducedMotion() ?? false
  const lit = useDisco((s) => s.phase === 'on' || s.phase === 'fading')
  if (reduced || !lit) return null
  return (
    <>
      <DiscoBeams system={system} />
      <MeteorRain radius={starRadius} />
    </>
  )
}
