import { useEffect, useLayoutEffect, useMemo } from 'react'
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
 * MSAA de 2 amostras (com o DPR do canvas em até 1,5×, ver `canvasDpr`): o alvo multiamostrado em meio float é o
 * maior gasto de GPU da cena, e a marca do sol no alfa só precisa de a borda misturar (ver `sunComposer.ts`).
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
  // No mesmo commit em que o EffectComposer monta, antes de qualquer quadro: ele só cria o compositor no efeito passivo
  // dele e só desenha no quadro seguinte, então nenhum quadro sai pelo compositor com o visual sem bloom. O fundo
  // (useBloom.active) também troca aqui: a atualização de um layout effect re-renderiza na hora, antes do próximo quadro.
  // Na volta, o mesmo: a limpeza roda no commit que desmonta o compositor.
  useLayoutEffect(() => {
    if (!bloom) return
    applyBloomLook(true)
    return () => applyBloomLook(false)
  }, [bloom])
  if (!bloom || !toneMapping) return null
  return (
    <EffectComposer multisampling={2}>
      <primitive object={bloom} />
      <primitive object={toneMapping} />
    </EffectComposer>
  )
}
