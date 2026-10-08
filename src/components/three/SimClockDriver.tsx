import { useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import { selectedPlanet } from '@/lib/interaction'
import { advanceClock, clockTarget } from '@/lib/universe/clock'
import { simClock } from '@/store/simClock'
import { useUniverse } from '@/store/universe'

export function SimClockDriver() {
  const reducedMotion = useReducedMotion() ?? false
  useFrame((_, dt) => {
    if (reducedMotion) {
      simClock.scale = 0
      return
    }
    const focused = selectedPlanet(useUniverse.getState().selection) !== null
    const next = advanceClock(simClock, dt, clockTarget({ reducedMotion, focused, tutorialFocus: false }))
    simClock.time = next.time
    simClock.scale = next.scale
  })
  return null
}
