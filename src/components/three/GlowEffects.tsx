import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { useReducedMotion } from 'framer-motion'
import { ToneMappingMode } from 'postprocessing'
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

/**
 * Bloom barato (mipmap blur) só no desktop: o limiar alto deixa passar só o que emite forte — os quadrados verdes
 * mais movimentados no pico do pulso, os faróis da nave —, não as estrelas, as luas nem a face iluminada dos planetas.
 * O EffectComposer desliga o tone mapping do renderer; o ToneMapping no fim devolve o mesmo ACES Filmic do R3F
 * (que agora pega também o fundo: ver `preToneMapped` no Scene). Monte só quando `useBloomEnabled()`.
 */
export function GlowBloom() {
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur luminanceThreshold={0.8} luminanceSmoothing={0.08} intensity={0.6} radius={0.6} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
