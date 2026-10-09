import { planetPosition, type OrbitSystem, type Vec3 } from './orbits'

/**
 * Massa do sol nas mesmas unidades de `planetMass` (raio³ em unidades de cena). Escolhida para o sol bambolear
 * ~0,2–0,6 na amostra: sutil, mas visível de perto.
 */
export const SUN_MASS = 1800
/** Maior afastamento do sol em relação ao baricentro (a origem): nada que mira o sol sai do lugar de verdade. */
export const MAX_WOBBLE = 0.6

/** Massa de um planeta: densidade igual para todos, então ∝ r³. */
export function planetMass(radius: number): number {
  return radius * radius * radius
}

const scratch: Vec3 = [0, 0, 0]

/**
 * Onde o sol fica no instante t, com o baricentro do sistema parado na origem: do lado oposto à soma dos planetas
 * ponderada pela massa, −Σ mᵢ·pᵢ / M_sol, limitado a MAX_WOBBLE. Com `out`, escreve nele em vez de alocar.
 */
export function barycenterOffset(system: OrbitSystem, t: number, out?: Vec3): Vec3 {
  let x = 0
  let y = 0
  let z = 0
  for (const orbit of system.orbits) {
    const p = planetPosition(system.rings[orbit.ring], orbit, t, scratch)
    const m = planetMass(orbit.radius)
    x += m * p[0]
    y += m * p[1]
    z += m * p[2]
  }
  const target = out ?? [0, 0, 0]
  const l = Math.hypot(x, y, z) / SUN_MASS
  const k = l > MAX_WOBBLE ? MAX_WOBBLE / l : 1
  target[0] = (-x / SUN_MASS) * k || 0
  target[1] = (-y / SUN_MASS) * k || 0
  target[2] = (-z / SUN_MASS) * k || 0
  return target
}
