/**
 * Embalo da volta (a chance da trombada cresce com ele, ver `crashChance`): a maior velocidade da volta normal
 * planejada (lib/ship/returnFlight) — parada na visita ela é a da volta por trás da câmera; no meio de uma viagem rápida,
 * a nave sai com a velocidade que tinha e o embalo vai lá para cima.
 */
import { planReturn, returnLocalVelocity, type ReturnInput } from '../ship/returnFlight'
import type { Vec3 } from '../universe/orbits'

const SAMPLES = 120

/** Maior velocidade (unidades/s, referencial da câmera) da volta planejada para `input`. */
export function returnMomentum(input: ReturnInput): number {
  const plan = planReturn(input)
  const v: Vec3 = [0, 0, 0]
  let peak = 0
  for (let i = 0; i <= SAMPLES; i++) {
    returnLocalVelocity(plan, (i / SAMPLES) * plan.duration, v)
    peak = Math.max(peak, Math.hypot(v[0], v[1], v[2]))
  }
  return peak
}
