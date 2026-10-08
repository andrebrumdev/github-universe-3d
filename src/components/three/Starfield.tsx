import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import { StarField } from 'three-low-poly'
import { STARFIELD_DEPTH } from '@/lib/cameraPoses'

/**
 * Casca de estrelas de raio interno `radius` (ver `starfieldRadius`) e espessura STARFIELD_DEPTH, presa à câmera.
 * 'radial' funciona no WebGLRenderer. `sizeMin`/`sizeMax` são tamanhos angulares (rad a 1 unidade), multiplicados
 * pela distância de cada estrela: com a casca maior, as estrelas aparecem do mesmo tamanho na tela.
 * O plano far da câmera (CAMERA_FAR) cobre a borda externa no pior caso.
 */
export function Starfield({ radius }: { radius: number }) {
  const reducedMotion = useReducedMotion() ?? false
  const outer = radius + STARFIELD_DEPTH
  const field = useMemo(
    () =>
      new StarField({
        orientation: 'radial',
        count: 5000,
        minRadius: radius,
        maxRadius: outer,
        seed: 7,
        sizeMin: 0.002,
        sizeMax: 0.007,
        twinkle: !reducedMotion,
      }),
    [radius, outer, reducedMotion],
  )
  useEffect(() => () => field.dispose(), [field])
  useFrame(({ clock }) => {
    if (!reducedMotion) field.update(clock.elapsedTime)
  })
  return <primitive object={field} />
}
