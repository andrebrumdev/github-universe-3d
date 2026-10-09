import { useEffect, useMemo } from 'react'
import { EffectComposer } from '@react-three/postprocessing'
import { applyBloomLook } from './bloomLook'
import { createGlowBloomEffect, SunMaskToneMappingEffect } from './sunComposer'

/**
 * Bloom barato (mipmap blur) só no desktop: o limiar alto deixa passar só o que emite forte — os quadrados verdes
 * mais movimentados no pico do pulso, os faróis da nave —, não as estrelas, as luas nem a face iluminada dos planetas.
 * O EffectComposer desliga o tone mapping do renderer; o tone mapping no fim devolve o mesmo ACES Filmic do R3F
 * (que agora pega também o fundo: ver `preToneMapped` no Scene). Monte só quando `useBloomEnabled()`.
 * O sol fica fora dos dois (ver `sunComposer.ts`): ele marca alfa 0, o bloom ignora a marca e o tone mapping a deixa
 * passar sem ACES — o rosto sai igual ao `?nobloom` (olhos brancos, amarelo limpo).
 * Montado, liga o visual "com bloom" (opacidades menores para órbitas, atmosferas e halo do sol); desmontado, volta.
 */
export function GlowBloom() {
  // O bloom é criado aqui (e não pelo <Bloom>) para nascer com a luminância mascarada: o sol não floresce.
  // O remendo no shader do postprocessing lança se a lib mudar; aí fica sem bloom, em vez de derrubar a cena.
  const bloom = useMemo(() => {
    try {
      return createGlowBloomEffect()
    } catch (error) {
      console.warn('[bloom] desligado: não deu para mascarar o sol no shader do postprocessing', error)
      return null
    }
  }, [])
  useEffect(() => () => bloom?.dispose(), [bloom])
  const toneMapping = useMemo(() => (bloom ? new SunMaskToneMappingEffect() : null), [bloom])
  useEffect(() => () => toneMapping?.dispose(), [toneMapping])
  useEffect(() => {
    if (!bloom) return
    applyBloomLook(true)
    return () => applyBloomLook(false)
  }, [bloom])
  if (!bloom || !toneMapping) return null
  return (
    <EffectComposer multisampling={4}>
      <primitive object={bloom} />
      <primitive object={toneMapping} />
    </EffectComposer>
  )
}
