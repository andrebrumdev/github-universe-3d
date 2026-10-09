import { describe, expect, it } from 'vitest'
import { buildSampleUniverse } from './github/sample'
import { buildOrbits, orbitPath, planetPosition, type OrbitSystem, type Vec3 } from './universe/orbits'
import { barycenterOffset } from './universe/barycenter'
import { projectDisc } from './ship/visit'
import { SIDE_SHEET_MAX_HEIGHT, sidePanelWidth } from './uiLayout'
import { SUN_RADIUS } from './universe/orbits'
import { bodyExtent, MAX_MOONS, MAX_PLANET_RADIUS, MIN_PLANET_RADIUS, maxPlanetWeight, planetRadius } from './universe/planets'
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
/**
 * Distância da visão geral na amostra pública, medida com o encaixe exato e o alvo à frente do sol, mais ~2% de folga.
 * Antes desta série era 126,4; com o encaixe por fórmula da precessão, 171; com o encaixe exato, 119,4. Com as luas em
 * ressonância compacta (1:2:3…, a ∝ T^(2/3)) os sistemas de luas crescem um pouco (universe-3d: alcance 6,2 → 7,8) e
 * ela vai a 135,8 (a cadeia 1:2:4:8… levava a 172,5).
 */
const OVERVIEW_SAMPLE_MAX_D = 139
const system = buildOrbits(Array.from({ length: 8 }, (_, i) => ({ name: `p${i}`, radius: 1 + (i % 3) * 0.5 })))

describe('overviewPose', () => {
  it('enquadra o anel externo, mirando um pouco à frente do sol (do lado da câmera)', () => {
    const pose = overviewPose(system)
    const outer = system.rings[system.rings.length - 1]
    const reach = outer.a * (1 + outer.e) + outer.maxRadius
    expect(pose.target[0]).toBe(0)
    expect(pose.target[1]).toBe(0)
    expect(pose.target[2]).toBeCloseTo(0.3 * reach, 12)
    expect(len(pose.position)).toBeGreaterThan(outer.a * (1 + outer.e))
    expect(maxCameraDistance(system)).toBeGreaterThan(len(pose.position))
  })

  it('funciona sem planetas', () => {
    const pose = overviewPose({ rings: [], orbits: [] })
    expect(len(pose.position)).toBeGreaterThan(10)
  })

  it.each([NaN, Infinity, 0, -1])('canvas de tamanho zero (aspecto %s) não trava: usa o enquadramento padrão', (aspect) => {
    const pose = overviewPose(system, { aspect, fov: 50 })
    expect(pose.position.every(Number.isFinite)).toBe(true)
    expect(pose).toEqual(overviewPose(system))
  })

  it('a mesma pose depois de muitos aspectos (o cache tem teto e recalcula o que saiu dele)', () => {
    const first = overviewPose(system, { aspect: 1.6, fov: 50 })
    for (let i = 0; i < 50; i++) overviewPose(system, { aspect: 1 + i / 100, fov: 50 })
    expect(overviewPose(system, { aspect: 1.6, fov: 50 })).toEqual(first)
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
    // 13 fases (não alinhadas com as 8 que o overviewPose amostra) e 96 pontos por elipse
    for (const t of Array.from({ length: 13 }, (_, k) => ((k / 13) * 2 * Math.PI) / ring.apsidalRate))
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

describe('overviewPose na amostra pública (a mesma do public/universe.json)', () => {
  const universe = buildSampleUniverse()
  const maxWeight = maxPlanetWeight(universe.repos)
  // como o Scene monta o sistema
  const sample = buildOrbits(
    universe.repos.map((r) => {
      const radius = planetRadius(r.stars, r.forks, maxWeight)
      return { name: r.name, radius, extent: bodyExtent(radius, Math.min(MAX_MOONS, r.languages.length)), trojans: r.forks > 0 }
    }),
  )

  it('enquadra justo no desktop: nada cortado em fase nenhuma da precessão, mas sem sobra (pior ponto ≥ 0,9 da borda)', () => {
    const w = worstScreenExtent(sample, DEFAULT_VIEWPORT)
    expect(w).toBeLessThanOrEqual(1)
    expect(w).toBeGreaterThanOrEqual(0.9)
    expect(worstScreenExtent(sample, { aspect: 390 / 844, fov: 50 })).toBeLessThanOrEqual(1)
  })

  it('limite superior da distância no desktop: d ≤ OVERVIEW_SAMPLE_MAX_D (a visão geral não volta a se afastar)', () => {
    const { position, target } = overviewPose(sample, DEFAULT_VIEWPORT)
    expect(position[2] - target[2]).toBeLessThanOrEqual(OVERVIEW_SAMPLE_MAX_D)
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

  it('em tela vertical, tudo cabe na largura e a câmera fica mais longe que no desktop', () => {
    const pose = overviewPose(system, portrait)
    expect(worstScreenExtent(system, portrait)).toBeLessThanOrEqual(1)
    expect(len(pose.position)).toBeGreaterThan(len(overviewPose(system).position))
    expect(maxCameraDistance(system, portrait)).toBeGreaterThan(len(pose.position))
    expect(reach).toBeGreaterThan(0)
  })

  it('a câmera mantém a elevação: posição = alvo + (0, 0,6·d, d)', () => {
    const { position, target } = overviewPose(system, DEFAULT_VIEWPORT)
    const d = position[2] - target[2]
    expect(position[0]).toBe(0)
    expect(position[1]).toBeCloseTo(0.6 * d, 12)
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

describe('enquadramento nas telas de toque', () => {
  it('celular em pé: o sol inteiro (o rosto) fica acima da folha do perfil', () => {
    for (const [W, H] of [[375, 667], [390, 844], [412, 915]]) {
      const viewport = { aspect: W / H, fov: 50 }
      const disc = projectDisc(sunPose('bottom', [0, 0, 0], viewport), [0, 0, 0], SUN_RADIUS, W, H, 50)
      expect(disc).not.toBeNull()
      const sheetTop = H * (1 - SIDE_SHEET_MAX_HEIGHT)
      expect(disc!.y + disc!.r).toBeLessThan(sheetTop)
      expect(disc!.y - disc!.r).toBeGreaterThan(0)
      // e não vira um ponto: ocupa boa parte da faixa livre
      expect(2 * disc!.r).toBeGreaterThan(sheetTop * 0.5)
    }
  })

  it('iPad em pé e celular deitado: o planeta em foco cabe inteiro na coluna à esquerda do painel', () => {
    const position: Vec3 = [12, 1, -5]
    for (const radius of [MIN_PLANET_RADIUS, MAX_PLANET_RADIUS]) {
      for (const [W, H] of [[820, 1180], [768, 1024], [667, 375], [1280, 800]]) {
        const viewport = { aspect: W / H, fov: 50 }
        const pose = planetPose(position, radius, 'side', viewport)
        const disc = projectDisc(pose, position, radius, W, H, 50)
        expect(disc).not.toBeNull()
        expect(disc!.x - disc!.r).toBeGreaterThan(0)
        expect(disc!.x + disc!.r).toBeLessThan(W - sidePanelWidth(W))
      }
    }
  })

  it('celular em pé: o planeta em foco cabe na largura', () => {
    const position: Vec3 = [12, 1, -5]
    for (const radius of [MIN_PLANET_RADIUS, MAX_PLANET_RADIUS]) {
      const viewport = { aspect: 375 / 667, fov: 50 }
      const disc = projectDisc(planetPose(position, radius, 'bottom', viewport), position, radius, 375, 667, 50)
      expect(disc!.x - disc!.r).toBeGreaterThan(0)
      expect(disc!.x + disc!.r).toBeLessThan(375)
    }
  })

  it('no desktop padrão nada muda (o encaixe só afasta a câmera em telas estreitas)', () => {
    const position: Vec3 = [12, 1, -5]
    expect(planetPose(position, 1.5, 'side', DEFAULT_VIEWPORT)).toEqual(planetPose(position, 1.5, 'side'))
    expect(len(sub(planetPose(position, 1.5, 'side').position, position))).toBeCloseTo(Math.hypot(1.5 * 4 + 3, 1.5 * 1.2), 6)
  })
})

describe('sunPose', () => {
  it('acompanha o sol que bamboleia em torno do baricentro (posição e alvo deslocados juntos)', () => {
    const center: Vec3 = [0.3, -0.1, 0.2]
    for (const layout of ['side', 'bottom'] as const) {
      const base = sunPose(layout)
      const moved = sunPose(layout, center)
      for (let k = 0; k < 3; k++) {
        expect(moved.position[k]).toBeCloseTo(base.position[k] + center[k], 12)
        expect(moved.target[k]).toBeCloseTo(base.target[k] + center[k], 12)
      }
    }
    // o perfil mira o sol onde ele vai estar no instante pedido
    const t = 37
    const off = barycenterOffset(system, t)
    expect(len(off)).toBeGreaterThan(0)
    expect(selectionPose({ kind: 'profile' }, system, t, 'side')).toEqual(sunPose('side', off))
  })
})

describe('selectionPose', () => {
  it('perfil → pose do sol; nada ou planeta desconhecido → visão geral', () => {
    expect(selectionPose({ kind: 'profile' }, system, 0, 'side')).toEqual(sunPose('side', barycenterOffset(system, 0)))
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
    expect(tutorialPose('welcome', system, repos, 0, 'side')).toEqual(sunPose('side', barycenterOffset(system, 0)))
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
