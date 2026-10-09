import { useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import { GLOW_UNIFORMS } from './planetGlow'

/** Relógio do pulso dos quadrados verdes, um só para todos os planetas; parado sob movimento reduzido. */
export function PlanetGlowDriver() {
  const reduced = useReducedMotion() ?? false
  useFrame(({ clock }) => {
    GLOW_UNIFORMS.uGlowPulse.value = reduced ? 0 : 1
    if (!reduced) GLOW_UNIFORMS.uGlowTime.value = clock.elapsedTime
  })
  return null
}
