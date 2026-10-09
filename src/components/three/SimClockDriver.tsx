import { useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import { discoReversed } from '@/lib/easter/disco'
import { selectedPlanet } from '@/lib/interaction'
import { tutorialFocusesPlanet } from '@/lib/tutorial'
import { advanceClock, clockTarget } from '@/lib/universe/clock'
import { disco } from '@/store/disco'
import { simClock } from '@/store/simClock'
import { useTutorial } from '@/store/tutorial'
import { useUniverse } from '@/store/universe'

export function SimClockDriver() {
  const reducedMotion = useReducedMotion() ?? false
  useFrame((_, dt) => {
    if (reducedMotion) {
      simClock.scale = 0
      return
    }
    const focused = selectedPlanet(useUniverse.getState().selection) !== null
    const target = clockTarget({ reducedMotion, focused, tutorialFocus: tutorialFocusesPlanet(useTutorial.getState().step) })
    // modo disco: as órbitas viram ao contrário (o sentido vira suave em TURN_SECONDS)
    const next = advanceClock(simClock, dt, target, discoReversed(disco.state))
    simClock.time = next.time
    simClock.scale = next.scale
    simClock.turn = next.turn ?? 0
  })
  return null
}
