import { describe, expect, it } from 'vitest'
import { buildOrbits, planetPosition, type Vec3 } from './universe/orbits'
import { DEFAULT_VIEWPORT, maxCameraDistance, overviewPose, planetPose, selectionPose, sunPose } from './cameraPoses'

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
const system = buildOrbits(Array.from({ length: 8 }, (_, i) => ({ name: `p${i}`, radius: 1 + (i % 3) * 0.5 })))

describe('overviewPose', () => {
  it('enquadra o anel externo e olha para o sol', () => {
    const pose = overviewPose(system)
    const outer = system.rings[system.rings.length - 1]
    expect(pose.target).toEqual([0, 0, 0])
    expect(len(pose.position)).toBeGreaterThan(outer.a * (1 + outer.e))
    expect(maxCameraDistance(system)).toBeGreaterThan(len(pose.position))
  })

  it('funciona sem planetas', () => {
    const pose = overviewPose({ rings: [], orbits: [] })
    expect(len(pose.position)).toBeGreaterThan(10)
  })
})

describe('overviewPose com proporção de tela', () => {
  const outer = system.rings[system.rings.length - 1]
  const reach = outer.a * (1 + outer.e) + outer.maxRadius
  const portrait = { aspect: 390 / 844, fov: 50 }

  it('em tela vertical, o anel externo cabe na largura', () => {
    const pose = overviewPose(system, portrait)
    const dist = Math.hypot(...pose.position)
    const cos = pose.position[2] / dist // câmera olha para a origem; o anel está em z ≈ 0..reach
    const halfTan = Math.tan((portrait.fov * Math.PI) / 360) * portrait.aspect
    for (const ring of system.rings) {
      const r = ring.a * (1 + ring.e)
      expect(r / (dist * cos - 0) / halfTan).toBeLessThanOrEqual(1)
    }
    expect(reach / (dist * cos) / halfTan).toBeLessThanOrEqual(1)
    expect(maxCameraDistance(system, portrait)).toBeGreaterThan(dist)
  })

  it('em tela de desktop, a pose é a de sempre', () => {
    const d = reach * 1.5 + 10
    expect(overviewPose(system, DEFAULT_VIEWPORT).position).toEqual([0, d * 0.6, d])
    expect(overviewPose(system, { aspect: 1.78, fov: 50 }).position).toEqual([0, d * 0.6, d])
  })

  it('selectionPose repassa o viewport para a visão geral', () => {
    expect(selectionPose({ kind: 'none' }, system, 0, 'bottom', portrait)).toEqual(overviewPose(system, portrait))
  })
})

describe('planetPose', () => {
  const position: Vec3 = [12, 1, -5]
  const radius = 1.5

  it('fica a uma distância proporcional ao raio', () => {
    const d = len(sub(planetPose(position, radius, 'side').position, position))
    expect(d).toBeGreaterThan(radius * 4)
    expect(d).toBeLessThan(radius * 6 + 4)
  })

  it('no desktop, o alvo vai para a direita da câmera (planeta à esquerda do painel)', () => {
    const pose = planetPose(position, radius, 'side')
    const view = sub(position, pose.position)
    const right: Vec3 = [-view[2], 0, view[0]]
    const shift = sub(pose.target, position)
    expect(shift[0] * right[0] + shift[2] * right[2]).toBeGreaterThan(0)
  })

  it('no mobile, o alvo desce (planeta acima do bottom sheet)', () => {
    expect(planetPose(position, radius, 'bottom').target[1]).toBeLessThan(position[1])
  })
})

describe('selectionPose', () => {
  it('perfil → pose do sol; nada ou planeta desconhecido → visão geral', () => {
    expect(selectionPose({ kind: 'profile' }, system, 0, 'side')).toEqual(sunPose('side'))
    expect(selectionPose({ kind: 'none' }, system, 0, 'side')).toEqual(overviewPose(system))
    expect(selectionPose({ kind: 'planet', name: 'nao-existe' }, system, 0, 'side')).toEqual(overviewPose(system))
  })

  it('planeta e lua focam a posição do planeta no instante dado', () => {
    const orbit = system.orbits[4]
    const at = planetPosition(system.rings[orbit.ring], orbit, 42)
    const expected = planetPose(at, orbit.radius, 'side')
    expect(selectionPose({ kind: 'planet', name: orbit.name }, system, 42, 'side')).toEqual(expected)
    expect(selectionPose({ kind: 'moon', planet: orbit.name, language: 'Go' }, system, 42, 'side')).toEqual(expected)
  })
})
