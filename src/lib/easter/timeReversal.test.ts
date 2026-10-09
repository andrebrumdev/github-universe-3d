/**
 * O modo disco roda o relógio da simulação para trás (lib/universe/clock). Estes testes conferem os consumidores do
 * relógio que poderiam supor que o tempo só cresce: órbitas com precessão, luas, troianos, barycentro, a cauda dos
 * cometas (que depende do sentido do movimento) e o tempo extra das luas em foco.
 */
import { describe, expect, it } from 'vitest'
import { barycenterOffset } from '../universe/barycenter'
import { advanceClock, clockDirection, TURN_SECONDS, type ClockState } from '../universe/clock'
import { buildComets, cometPosition, cometVelocity, dustCurlAxis, tailDirections } from '../universe/comets'
import { apsidalAngle, buildOrbits, planetPosition, type Vec3 } from '../universe/orbits'
import { bodyExtent, focusMoonStep, moonOrbits, moonPosition } from '../universe/planets'
import { systemTrojans, trojanPosition } from '../universe/trojans'

const NOW = new Date('2026-10-08T18:00:00Z')
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
const near = (a: Vec3, b: Vec3, eps = 1e-9) => len(sub(a, b)) < eps

const system = buildOrbits(
  [3, 2.4, 1.8, 1.2, 0.8].map((radius, i) => ({ name: `p${i}`, radius, extent: bodyExtent(radius, 2), trojans: i < 3 })),
)
const repos = system.orbits.map((o, i) => ({ name: o.name, pushedAt: new Date(NOW.getTime() - i * 3_600_000).toISOString(), lastCommit: null }))

/** Anda o relógio pela virada inteira e mais `extra` s, devolvendo cada estado. */
function discoRun(seconds: number, reverse: boolean, start: ClockState = { time: 30, scale: 1 }): ClockState[] {
  const out: ClockState[] = []
  let s = start
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    s = advanceClock(s, 1 / 60, 1, reverse)
    out.push(s)
  }
  return out
}

describe('consumidores do relógio com o tempo para trás', () => {
  it('o tempo do disco recua e depois volta: sem NaN e sem salto em nenhum passo', () => {
    const trace = [...discoRun(10, true), ...discoRun(10, false, discoRun(10, true).at(-1))]
    for (let i = 1; i < trace.length; i++) {
      expect(Number.isFinite(trace[i].time)).toBe(true)
      expect(Math.abs(trace[i].time - trace[i - 1].time)).toBeLessThanOrEqual(1 / 60 + 1e-12)
    }
  })

  it('planeta com precessão do periélio: andar dt para a frente e dt para trás volta ao mesmo ponto', () => {
    const ring = system.rings[0]
    const orbit = system.orbits[0]
    for (const t of [0, 12.5, -40, 333]) {
      const a = planetPosition(ring, orbit, t)
      const b = planetPosition(ring, orbit, t + 3.7 - 3.7)
      expect(near(a, b)).toBe(true)
      // a precessão é linear em t: recua junto, e continua contínua em t negativo
      expect(apsidalAngle(ring, t - 1)).toBeLessThan(apsidalAngle(ring, t))
    }
    expect(near(planetPosition(ring, orbit, -1e-6), planetPosition(ring, orbit, 1e-6), 1e-4)).toBe(true)
  })

  it('luas, troianos e o bamboleio do sol são funções de t: valem para t negativo e para trás', () => {
    const [moon] = moonOrbits(1.5, [{ name: 'TypeScript', color: '#3178c6', bytes: 10 }], 'r')
    expect(moon).toBeDefined()
    const trojans = systemTrojans(system, [4, 2, 2])
    expect(trojans.length).toBeGreaterThan(0)
    const out: Vec3 = [0, 0, 0]
    for (const t of [-500, -1, 0, 1, 500]) {
      expect(moonPosition(moon, t).every(Number.isFinite)).toBe(true)
      expect(trojanPosition(system, trojans[0], t, out).every(Number.isFinite)).toBe(true)
      expect(barycenterOffset(system, t).every(Number.isFinite)).toBe(true)
    }
  })

  it('cauda de poeira: com o tempo invertido, ela fica atrás do movimento DE VERDADE (o oposto da velocidade analítica)', () => {
    const [comet] = buildComets(system, repos, NOW)
    const sun = barycenterOffset(system, 0)
    for (const t of [5, 10, 14, 40]) {
      const pos = cometPosition(comet, t, [0, 0, 0])
      const vel = cometVelocity(comet, t, [0, 0, 0])
      const ion: Vec3 = [0, 0, 0]
      const dust: Vec3 = [0, 0, 0]
      // para a frente: a poeira se curva para trás da velocidade
      tailDirections(pos, sun, vel, ion, dust, 1)
      expect(dot(sub(dust, ion), vel)).toBeLessThan(0)
      // ao contrário: o cometa anda no sentido −vel, e a poeira fica para trás DESSE movimento
      tailDirections(pos, sun, vel, ion, dust, -1)
      expect(dot(sub(dust, ion), vel)).toBeGreaterThan(0)
      // parado no meio da virada: a poeira alinha com a de íons (sem lado)
      tailDirections(pos, sun, vel, ion, dust, 0)
      expect(near(dust, ion, 1e-12)).toBe(true)
    }
  })

  it('a curva da poeira gira em volta da cauda durante a virada, sem estalo (eixo contínuo e unitário)', () => {
    const [comet] = buildComets(system, repos, NOW)
    const sun = barycenterOffset(system, 0)
    const pos = cometPosition(comet, 10, [0, 0, 0])
    const vel = cometVelocity(comet, 10, [0, 0, 0])
    const ion: Vec3 = [0, 0, 0]
    const dust: Vec3 = [0, 0, 0]
    let last: Vec3 | null = null
    for (const state of discoRun(TURN_SECONDS + 0.1, true)) {
      const sense = clockDirection(state)
      tailDirections(pos, sun, vel, ion, dust, sense)
      const axis = dustCurlAxis(dust, vel, sense, [0, 0, 0])
      expect(len(axis)).toBeCloseTo(1, 9)
      expect(Math.abs(dot(axis, dust))).toBeLessThan(1e-9)
      if (last) expect(len(sub(axis, last))).toBeLessThan(0.1)
      last = axis
    }
    // nas pontas: para a frente a curva vai para trás da velocidade; ao contrário, para a frente dela
    tailDirections(pos, sun, vel, ion, dust, 1)
    expect(dot(dustCurlAxis(dust, vel, 1, [0, 0, 0]), vel)).toBeLessThan(0)
    tailDirections(pos, sun, vel, ion, dust, -1)
    expect(dot(dustCurlAxis(dust, vel, -1, [0, 0, 0]), vel)).toBeGreaterThan(0)
  })

  it('luas do planeta em foco: o tempo extra segue o sentido do relógio', () => {
    expect(focusMoonStep(2, 0.1, true, 0, false, -1)).toBeLessThan(2)
    expect(focusMoonStep(2, 0.1, true, 0, false, 1)).toBeGreaterThan(2)
    // padrão: para a frente (quem não passa o sentido)
    expect(focusMoonStep(2, 0.1, true, 0)).toBe(focusMoonStep(2, 0.1, true, 0, false, 1))
  })
})
