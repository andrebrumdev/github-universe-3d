import { describe, expect, it } from 'vitest'
import { buildOrbits, orbitPath, planetPosition, type OrbitSystem, type Vec3 } from './universe/orbits'
import { bodyExtent, MAX_MOONS, MAX_PLANET_RADIUS, MIN_PLANET_RADIUS } from './universe/planets'
import {
  CAMERA_FAR,
  DEFAULT_VIEWPORT,
  maxCameraDistance,
  overviewPose,
  PORTRAIT_VIEWPORT,
  STARFIELD_DEPTH,
  STARFIELD_MIN_RADIUS,
  starfieldRadius,
  planetPose,
  selectionPose,
  showcasePlanet,
  sunPose,
  tutorialPose,
} from './cameraPoses'

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

/**
 * Maior coordenada normalizada de tela (|x| ou |y|, 1 = borda) entre todos os pontos das órbitas,
 * cada um inflado pelo alcance máximo do anel (planeta + luas) — inclui a altura das órbitas inclinadas.
 */
function worstScreenExtent(sys: OrbitSystem, viewport: { aspect: number; fov: number }): number {
  const { position: eye, target } = overviewPose(sys, viewport)
  const fwd = sub(target, eye)
  const fl = len(fwd)
  const f: Vec3 = [fwd[0] / fl, fwd[1] / fl, fwd[2] / fl]
  const rl = Math.hypot(f[2], f[0])
  const right: Vec3 = [-f[2] / rl, 0, f[0] / rl]
  const up: Vec3 = [right[1] * f[2] - right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1] - right[1] * f[0]]
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const tanY = Math.tan((viewport.fov * Math.PI) / 360)
  const tanX = tanY * viewport.aspect
  let worst = 0
  // a precessão gira cada elipse no próprio plano: o enquadramento vale em qualquer fase dela
  for (const ring of sys.rings) {
    for (const t of [0, 0.25, 0.5, 0.75].map((f) => (f * 2 * Math.PI) / ring.apsidalRate))
    for (const p of orbitPath(ring, t, 96)) {
      const v = sub(p, eye)
      const depth = dot(v, f)
      // esfera de raio maxRadius em volta do ponto: o pior caso na tela é o centro deslocado de r para fora
      const sx = (Math.abs(dot(v, right)) + ring.maxRadius) / ((depth - ring.maxRadius) * tanX)
      const sy = (Math.abs(dot(v, up)) + ring.maxRadius) / ((depth - ring.maxRadius) * tanY)
      worst = Math.max(worst, sx, sy)
    }
  }
  return worst
}

describe('overviewPose enquadra o sistema inteiro (alcance com luas e inclinação)', () => {
  const dec = (i: number, n: number) => MIN_PLANET_RADIUS + (MAX_PLANET_RADIUS - MIN_PLANET_RADIUS) * (1 - i / (n - 1)) ** 2
  const systems: [string, OrbitSystem][] = [
    ['amostra (14, com luas)', buildOrbits(Array.from({ length: 14 }, (_, i) => ({ name: `p${i}`, radius: dec(i, 14), extent: bodyExtent(dec(i, 14), 1 + (i % 4)) })))],
    ['40 com luas', buildOrbits(Array.from({ length: 40 }, (_, i) => ({ name: `p${i}`, radius: dec(i, 40), extent: bodyExtent(dec(i, 40), 1 + (i % 4)) })))],
    ['40 máximos com 6 luas', buildOrbits(Array.from({ length: 40 }, (_, i) => ({ name: `p${i}`, radius: MAX_PLANET_RADIUS, extent: bodyExtent(MAX_PLANET_RADIUS, MAX_MOONS) })))],
  ]
  it.each(systems)('%s: tudo dentro da tela, no desktop e no celular em pé', (_, sys) => {
    expect(worstScreenExtent(sys, DEFAULT_VIEWPORT)).toBeLessThanOrEqual(1)
    expect(worstScreenExtent(sys, { aspect: 390 / 844, fov: 50 })).toBeLessThanOrEqual(1)
  })
})

describe('starfieldRadius', () => {
  const sample = buildOrbits(
    Array.from({ length: 14 }, (_, i) => {
      const radius = MIN_PLANET_RADIUS + (MAX_PLANET_RADIUS - MIN_PLANET_RADIUS) * (1 - i / 13) ** 2
      return { name: `p${i}`, radius, extent: bodyExtent(radius, 1 + (i % 4)) }
    }),
  )
  const worst = buildOrbits(
    Array.from({ length: 40 }, (_, i) => ({ name: `p${i}`, radius: MAX_PLANET_RADIUS, extent: bodyExtent(MAX_PLANET_RADIUS, MAX_MOONS) })),
  )

  it.each([
    ['vazio', { rings: [], orbits: [] } as OrbitSystem],
    ['amostra', sample],
    ['40 máximos com 6 luas', worst],
  ])('%s: ≥ 260 e ≥ 1,6× a distância máxima da câmera (desktop e celular em pé)', (_, sys) => {
    const r = starfieldRadius(sys)
    expect(r).toBeGreaterThanOrEqual(STARFIELD_MIN_RADIUS)
    for (const vp of [DEFAULT_VIEWPORT, PORTRAIT_VIEWPORT]) {
      expect(r).toBeGreaterThanOrEqual(1.6 * maxCameraDistance(sys, vp) - 1e-9)
      expect(r).toBeGreaterThan(1.6 * len(overviewPose(sys, vp).position))
    }
  })

  it('a casca acompanha a câmera: do zoom máximo para fora, o ponto mais distante do sistema fica dentro dela', () => {
    for (const sys of [sample, worst]) {
      const r = starfieldRadius(sys)
      for (const vp of [DEFAULT_VIEWPORT, PORTRAIT_VIEWPORT]) {
        const outer = sys.rings[sys.rings.length - 1]
        const reach = outer.a * (1 + outer.e) + outer.maxRadius
        expect(maxCameraDistance(sys, vp) + reach).toBeLessThan(r)
      }
    }
    expect(STARFIELD_DEPTH).toBe(80)
    // o plano far da câmera passa da borda externa da casca, mesmo no pior caso
    expect(starfieldRadius(worst) + STARFIELD_DEPTH).toBeLessThan(CAMERA_FAR)
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

  it('em tela de desktop, quem manda é o encaixe vertical (não depende da proporção) e nunca fica mais perto que antes', () => {
    const [x, y, d] = overviewPose(system, DEFAULT_VIEWPORT).position
    expect([x, y]).toEqual([0, d * 0.6])
    expect(d).toBeGreaterThanOrEqual(reach * 1.5 + 10)
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

describe('tutorial', () => {
  const repos = [
    { name: 'p0', languages: [{ name: 'Go', color: '#0af', bytes: 10 }] },
    { name: 'p1', languages: [{ name: 'Go', color: '#0af', bytes: 10 }, { name: 'Shell', color: '#8e5', bytes: 5 }] },
  ]

  it('o planeta de vitrine é o primeiro com 2+ linguagens, senão o primeiro', () => {
    expect(showcasePlanet(repos)).toBe('p1')
    expect(showcasePlanet([repos[0]])).toBe('p0')
    expect(showcasePlanet([])).toBeNull()
  })

  it('cada passo tem a pose certa', () => {
    expect(tutorialPose('welcome', system, repos, 0, 'side')).toEqual(sunPose('side'))
    expect(tutorialPose('repos', system, repos, 0, 'side')).toEqual(overviewPose(system))
    expect(tutorialPose('free', system, repos, 0, 'side')).toEqual(overviewPose(system))
    expect(tutorialPose('tech', system, repos, 7, 'side')).toEqual(selectionPose({ kind: 'planet', name: 'p1' }, system, 7, 'side'))
  })

  it('a visão geral do tutorial respeita a proporção da tela', () => {
    const narrow = { aspect: 0.5, fov: 50 }
    expect(tutorialPose('repos', system, repos, 0, 'side', narrow)).toEqual(overviewPose(system, narrow))
    expect(tutorialPose('free', system, repos, 0, 'side', narrow)).toEqual(overviewPose(system, narrow))
  })
})
