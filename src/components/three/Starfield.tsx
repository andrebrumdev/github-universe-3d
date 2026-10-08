import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import { StarField } from 'three-low-poly'

/** Casca de estrelas (raio ~300, espessura ~80). 'radial' funciona no WebGLRenderer. */
export function Starfield() {
  const reducedMotion = useReducedMotion() ?? false
  const field = useMemo(
    () =>
      new StarField({
        orientation: 'radial',
        count: 5000,
        minRadius: 260,
        maxRadius: 340,
        seed: 7,
        sizeMin: 0.002,
        sizeMax: 0.007,
        twinkle: !reducedMotion,
      }),
    [reducedMotion],
  )
  useEffect(() => () => field.dispose(), [field])
  useFrame(({ clock }) => {
    if (!reducedMotion) field.update(clock.elapsedTime)
  })
  return <primitive object={field} />
}
