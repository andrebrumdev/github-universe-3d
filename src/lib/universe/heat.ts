import { solveKepler, type PlanetOrbit, type Ring } from './orbits'

/**
 * Onde o aquecimento começa, em x = (r_afélio − r)/(r_afélio − r_periélio) (0 no afélio, 1 no periélio).
 * 0,5 é a distância média (r = a): da metade do caminho para fora o planeta fica frio; para dentro, esquenta.
 */
export const HEAT_START = 0.5

/**
 * Quanto o planeta está aquecido no instante t, de 0 (frio) a 1 (no periélio), pela distância ao sol de agora contra
 * as do periélio e do afélio do anel. A curva é um smoothstep de HEAT_START a 1: sem degrau na entrada e plana no
 * periélio, então o pico dura um pouco (o planeta passa rápido por lá).
 * A distância é a de `planetPosition(ring, orbit, t)`: a precessão só gira ω (a elipse em volta do sol), não muda r,
 * então o periélio que esquenta é sempre o do instante. Puro e sem alocação: roda por quadro.
 */
export function heatFactor(ring: Ring, orbit: PlanetOrbit, t: number): number {
  if (ring.e <= 0) return 0
  const M = orbit.phase + (2 * Math.PI * t) / ring.period
  // r = a(1 − e·cos E); x = (r_af − r)/(r_af − r_pe) = (1 + cos E)/2
  const x = (1 + Math.cos(solveKepler(M, ring.e))) / 2
  const u = Math.min(1, Math.max(0, (x - HEAT_START) / (1 - HEAT_START)))
  return u * u * (3 - 2 * u)
}
