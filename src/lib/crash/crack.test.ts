import { describe, expect, it } from 'vitest'
import { crackPattern, crackRetraction, polylineLength, type Crack } from './crack'

/** Do celular em pé ao ultrawide, com o impacto no centro e fora dele. */
const SCREENS = [
  { w: 375, h: 667 },
  { w: 1280, h: 720 },
  { w: 1920, h: 1080 },
  { w: 3440, h: 1440 },
]
const IMPACTS = [
  [0.5, 0.5],
  [0.58, 0.55],
  [0.3, 0.7],
  [0.85, 0.2],
]

function* every() {
  for (const { w, h } of SCREENS) {
    for (const [fx, fy] of IMPACTS) {
      for (let seed = 1; seed <= 12; seed++) yield { w, h, cx: fx * w, cy: fy * h, seed }
    }
  }
}

/** Distância (px) do ponto à borda do retângulo da tela mais próxima (0 = em cima dela). */
const toBorder = ([x, y]: readonly [number, number], w: number, h: number) =>
  Math.min(Math.abs(x), Math.abs(y), Math.abs(w - x), Math.abs(h - y))
const inside = ([x, y]: readonly [number, number], w: number, h: number) => x >= -1e-6 && y >= -1e-6 && x <= w + 1e-6 && y <= h + 1e-6

describe('vidro trincado procedural', () => {
  it('é determinístico pela semente', () => {
    expect(crackPattern(42, 640, 400, 1280, 720)).toEqual(crackPattern(42, 640, 400, 1280, 720))
    expect(crackPattern(42, 640, 400, 1280, 720)).not.toEqual(crackPattern(43, 640, 400, 1280, 720))
  })

  it('de ponta a ponta: toda rachadura radial sai do impacto e termina na borda da tela (±1 px), em qualquer tela', () => {
    for (const { w, h, cx, cy, seed } of every()) {
      const main = crackPattern(seed, cx, cy, w, h).rays.filter((r) => r.kind === 'ray')
      expect(main.length).toBeGreaterThanOrEqual(10)
      expect(main.length).toBeLessThanOrEqual(14)
      for (const ray of main) {
        expect(ray.points[0]).toEqual([cx, cy])
        expect(toBorder(ray.points[ray.points.length - 1], w, h)).toBeLessThanOrEqual(1)
        // nada sai da tela no meio do caminho
        for (const p of ray.points) expect(inside(p, w, h)).toBe(true)
      }
    }
  })

  it('cobre a tela toda: o maior buraco entre radiais vizinhas fica abaixo de ~40°', () => {
    for (const { w, h, cx, cy, seed } of every()) {
      const main = crackPattern(seed, cx, cy, w, h).rays.filter((r) => r.kind === 'ray')
      const angle = (r: Crack) => Math.atan2(r.points[1][1] - cy, r.points[1][0] - cx)
      const angles = main.map(angle).sort((a, b) => a - b)
      const gaps = angles.map((a, i) => (i === 0 ? a + 2 * Math.PI - angles[angles.length - 1] : a - angles[i - 1]))
      expect(Math.max(...gaps)).toBeLessThan((40 * Math.PI) / 180)
    }
  })

  it('3–5 galhos secundários, nascendo em cima de uma radial e dentro da tela', () => {
    for (const { w, h, cx, cy, seed } of every()) {
      const { rays } = crackPattern(seed, cx, cy, w, h)
      const main = rays.filter((r) => r.kind === 'ray')
      const branches = rays.filter((r) => r.kind === 'branch')
      expect(branches.length).toBeGreaterThanOrEqual(3)
      expect(branches.length).toBeLessThanOrEqual(5)
      for (const b of branches) {
        expect(main.some((r) => r.points.some((p) => p[0] === b.points[0][0] && p[1] === b.points[0][1]))).toBe(true)
        for (const p of b.points) expect(inside(p, w, h)).toBe(true)
      }
    }
  })

  it('2–3 anéis de fratura perto do impacto, mais soltos (com mais falhas) quanto mais longe', () => {
    let inner = 0
    let outer = 0
    for (const { w, h, cx, cy, seed } of every()) {
      const { rings } = crackPattern(seed, cx, cy, w, h)
      const levels = new Set(rings.map((r) => r.level))
      expect(levels.size).toBeGreaterThanOrEqual(2)
      expect(levels.size).toBeLessThanOrEqual(3)
      for (const ring of rings) {
        const r0 = Math.hypot(ring.points[0][0] - cx, ring.points[0][1] - cy)
        expect(r0).toBeLessThan(0.35 * Math.min(w, h))
      }
      inner += rings.filter((r) => r.level === 0).length
      outer += rings.filter((r) => r.level === 2).length
    }
    // o anel de fora aparece em menos pedaços que o de dentro (e às vezes nem aparece)
    expect(outer).toBeLessThan(inner)
  })

  it('um galho some antes do pedaço da radial em que ele nasce (sem tracinho solto na cura)', () => {
    for (const { w, h, cx, cy, seed } of every()) {
      const { rays } = crackPattern(seed, cx, cy, w, h)
      for (const branch of rays.filter((r) => r.kind === 'branch')) {
        const parent = rays[branch.parent!]
        expect(parent.kind).toBe('ray')
        // a raiz fica na radial, a `root` px do impacto ao longo dela
        expect(branch.root!).toBeGreaterThan(0)
        expect(branch.root!).toBeLessThan(parent.length)
        for (let heal = 0; heal <= 1; heal += 0.005) {
          const reach = parent.length * (1 - crackRetraction(heal, parent.delay, parent.span))
          if (reach < branch.root! - 1e-6) expect(crackRetraction(heal, branch.delay, branch.span)).toBe(1)
        }
      }
    }
  })

  it('comprimento guardado é o da polilinha (o tracejado da cura usa ele)', () => {
    const { rays, rings } = crackPattern(9, 640, 360, 1280, 720)
    for (const c of [...rays, ...rings] as Crack[]) {
      expect(c.length).toBeCloseTo(polylineLength(c.points))
      expect(c.length).toBeGreaterThan(0)
      expect(c.delay).toBeGreaterThanOrEqual(0)
      expect(c.delay).toBeLessThan(1)
      // termina dentro da cura (delay + span ≤ 1)
      expect(c.delay + c.span).toBeLessThanOrEqual(1 + 1e-9)
      expect(c.span).toBeGreaterThan(0)
    }
    expect(polylineLength([[0, 0], [3, 4], [3, 10]])).toBe(11)
  })

  it('a cura recolhe cada rachadura no seu tempo (anéis e galhos primeiro), no mesmo tempo total', () => {
    const { rays, rings } = crackPattern(3, 640, 360, 1280, 720)
    const ringDelay = Math.max(...rings.map((r) => r.delay))
    const rayDelay = Math.min(...rays.filter((r) => r.kind === 'ray').map((r) => r.delay))
    expect(ringDelay).toBeLessThanOrEqual(rayDelay)
    // toda rachadura, longa ou curta, está recolhida quando a cura chega a 1
    for (const c of [...rays, ...rings]) expect(crackRetraction(1, c.delay, c.span)).toBe(1)
    expect(crackRetraction(0, 0.3)).toBe(0)
    expect(crackRetraction(0.5, 0)).toBeGreaterThan(crackRetraction(0.5, 0.4))
    for (let h = 0; h <= 1; h += 0.1) expect(crackRetraction(h, 0.2)).toBeGreaterThanOrEqual(crackRetraction(h - 0.1, 0.2))
  })
})
