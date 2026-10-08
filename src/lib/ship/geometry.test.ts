import { describe, expect, it } from 'vitest'
import {
  BOWL_PROFILE,
  bowlRadiusAt,
  BRIM_DEPTH,
  BUBBLE,
  COCKPIT,
  CROWN_DEPTH,
  DECK_Y,
  ENGINE_RINGS_Z,
  FACE,
  FUSELAGE,
  fuselageSection,
  HAT_BLOCKS,
  HAT_EYE_BLOCKS,
  HEAD,
  NOZZLE,
  PILLAR,
  WING,
  wingPoint,
  RIM,
  svgTo3d,
  TORSO,
} from './geometry'

type Vec3 = [number, number, number]

/** Ponto do piloto (coordenadas do SVG) levado para o frame da nave pelo COCKPIT. */
function pilotToShip([x, y, z]: Vec3): Vec3 {
  const [px, py, pz] = COCKPIT.position
  return [px + x * COCKPIT.scale, py + y * COCKPIT.scale, pz + z * COCKPIT.scale]
}

function insideBubble(p: Vec3): boolean {
  const [cx, cy, cz] = BUBBLE.center
  return Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz) < BUBBLE.radius
}

describe('svgTo3d', () => {
  it('converte com 100 px = 1 unidade, origem no centro do casco e y para cima', () => {
    expect(svgTo3d(200, 312)).toEqual([0, 0])
    expect(svgTo3d(300, 212)).toEqual([1, 1])
    expect(svgTo3d(100, 412)).toEqual([-1, -1])
  })
})

describe('cabine', () => {
  it('a bolha assenta no aro da tigela', () => {
    const dy = RIM.top - BUBBLE.center[1]
    const footprint = Math.sqrt(BUBBLE.radius ** 2 - dy ** 2)
    expect(footprint).toBeGreaterThan(RIM.inner)
    expect(footprint).toBeLessThan(RIM.outer)
  })

  it('a bolha é quase uma esfera: o centro e mais de 60% do diâmetro ficam acima do aro', () => {
    expect(BUBBLE.center[1]).toBeGreaterThan(RIM.top)
    const above = BUBBLE.center[1] + BUBBLE.radius - RIM.top
    expect(above / (2 * BUBBLE.radius)).toBeGreaterThan(0.6)
  })

  it('a tigela fecha no piso da cabine, abaixo do topo do aro', () => {
    const [last, beforeLast] = [BOWL_PROFILE.at(-1)!, BOWL_PROFILE.at(-2)!]
    expect(last).toEqual([0, DECK_Y])
    expect(beforeLast[1]).toBe(DECK_Y)
    expect(DECK_Y).toBeLessThan(RIM.top)
    expect(DECK_Y).toBeGreaterThan(RIM.bottom)
  })
})

describe('piloto na cabine', () => {
  it('o corpo senta no piso da cabine', () => {
    expect(pilotToShip([0, TORSO.base[1], 0])[1]).toBeCloseTo(DECK_Y, 10)
  })

  it('a cabeça fica dentro da bolha', () => {
    const [hx, hy] = HEAD.center
    for (const p of [
      [hx, hy + HEAD.ry, 0],
      [hx - HEAD.rx, hy, 0],
      [hx + HEAD.rx, hy, 0],
      [hx, hy, HEAD.rz],
    ] as Vec3[]) {
      expect(insideBubble(pilotToShip(p))).toBe(true)
    }
  })

  it('o gorro inteiro (todos os cantos dos blocos) cabe na bolha', () => {
    for (const { position, size } of HAT_BLOCKS) {
      for (const sx of [-1, 1])
        for (const sy of [-1, 1])
          for (const sz of [-1, 1]) {
            const corner: Vec3 = [
              position[0] + (sx * size[0]) / 2,
              position[1] + (sy * size[1]) / 2,
              position[2] + (sz * size[2]) / 2,
            ]
            expect(insideBubble(pilotToShip(corner))).toBe(true)
          }
    }
  })
})

describe('fuselagem traseira', () => {
  it('sai de trás da cabine e se estende para trás (−z)', () => {
    const zs = FUSELAGE.map((s) => s.z)
    for (let i = 1; i < zs.length; i++) expect(zs[i]).toBeLessThan(zs[i - 1])
    expect(zs[1]).toBeLessThan(-RIM.outer)
    expect(zs.at(-1)!).toBeLessThan(-2.5 * RIM.outer)
  })

  it('a primeira seção fica escondida dentro da tigela, sob o piso', () => {
    const first = FUSELAGE[0]
    expect(first.cy + first.ry).toBeLessThan(DECK_Y)
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const [x, y] = [first.rx * Math.cos(a), first.cy + first.ry * Math.sin(a)]
      expect(Math.hypot(x, first.z)).toBeLessThan(bowlRadiusAt(y).radius)
    }
  })

  it('afunila da seção mais larga até o bocal', () => {
    const widest = FUSELAGE.reduce((a, b) => (b.rx > a.rx ? b : a))
    const tail = FUSELAGE.slice(FUSELAGE.indexOf(widest))
    for (let i = 1; i < tail.length; i++) {
      expect(tail[i].rx).toBeLessThan(tail[i - 1].rx)
      expect(tail[i].ry).toBeLessThan(tail[i - 1].ry)
    }
  })

  it('fuselageSection interpola entre as seções', () => {
    const [a, b] = [FUSELAGE[1], FUSELAGE[2]]
    const mid = fuselageSection((a.z + b.z) / 2)
    expect(mid.rx).toBeCloseTo((a.rx + b.rx) / 2, 10)
    expect(fuselageSection(a.z)).toEqual(a)
  })

  it('anéis do motor e bocal ficam ao longo da fuselagem', () => {
    for (const z of ENGINE_RINGS_Z) {
      expect(z).toBeLessThan(FUSELAGE[1].z)
      expect(z).toBeGreaterThan(FUSELAGE.at(-1)!.z)
    }
    expect(NOZZLE.z).toBe(FUSELAGE.at(-1)!.z)
  })

})

describe('asas', () => {
  const nozzleBack = NOZZLE.z - NOZZLE.length

  it('são um par espelhado em x', () => {
    for (const p of WING.outline) {
      const [x, y, z] = wingPoint(1, p)
      expect(wingPoint(-1, p)).toEqual([-x, y, z])
    }
  })

  it('a raiz fica presa na tigela/motor, abaixo do aro', () => {
    for (const p of WING.outline.filter(([s]) => s === 0)) {
      const [x, y, z] = wingPoint(1, p)
      expect(y).toBeLessThan(RIM.bottom)
      const inBowl = Math.hypot(x, z) < bowlRadiusAt(y).radius
      const f = fuselageSection(z)
      const inEngine = (x / f.rx) ** 2 + ((y - f.cy) / f.ry) ** 2 < 1
      expect(inBowl || inEngine).toBe(true)
    }
  })

  it('corre ao longo do casco: começa sob a frente da cabine e a ponta passa do bocal', () => {
    const points = WING.outline.map((p) => wingPoint(1, p))
    const zs = points.map(([, , z]) => z)
    expect(Math.max(...zs)).toBeGreaterThan(0)
    expect(Math.min(...zs)).toBeLessThan(nozzleBack)
    for (const [, y, z] of points) if (z > 0) expect(y).toBeLessThan(RIM.bottom)
    const frontRoot = wingPoint(1, WING.outline.find(([s, z]) => s === 0 && z > 0)!)
    const bowlMiddle = (BOWL_PROFILE[0][1] + RIM.top) / 2
    expect(frontRoot[1]).toBeLessThan(bowlMiddle)
    expect(Math.max(...points.map(([, y]) => y))).toBeLessThan(RIM.top)
    const width = Math.max(...WING.outline.map(([s]) => s))
    expect(width).toBeLessThan((Math.max(...zs) - Math.min(...zs)) / 3)
  })

  it('a ponta de trás é a parte mais traseira e fica perto do eixo (aponta para trás)', () => {
    const tip = WING.outline.reduce((a, b) => (b[1] < a[1] ? b : a))
    const widest = Math.max(...WING.outline.map(([s]) => s))
    expect(tip[0]).toBeLessThan(widest / 2)
  })

  it('sobe para fora (diedro) e para trás (pitch), e as luzes ficam dentro do contorno', () => {
    expect(wingPoint(1, [0.5, 0])[1]).toBeGreaterThan(wingPoint(1, [0, 0])[1])
    expect(wingPoint(1, [0, -2])[1]).toBeGreaterThan(wingPoint(1, [0, 0])[1])
    const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    for (const light of WING.lights) {
      const signs = WING.outline.map((p, i) => Math.sign(cross(p, WING.outline[(i + 1) % WING.outline.length], light)))
      expect(new Set(signs).size).toBe(1)
    }
  })
})

describe('coluna da cabine', () => {
  it('vai do piso, atrás do piloto, até o alto da bolha, sempre por dentro do vidro', () => {
    const [first, last] = [PILLAR.points[0], PILLAR.points.at(-1)!]
    expect(first[1]).toBe(DECK_Y)
    expect(last[1]).toBeGreaterThan(BUBBLE.center[1] + BUBBLE.radius * 0.9)
    for (const p of PILLAR.points.slice(1)) expect(insideBubble(p)).toBe(true)
    const pilotBack = Math.min(...HAT_BLOCKS.map((b) => pilotToShip(b.position)[2] - (b.size[2] * COCKPIT.scale) / 2))
    for (const p of PILLAR.points.slice(0, 2)) expect(p[2] + PILLAR.radius).toBeLessThan(pilotBack)
  })
})

describe('gorro-Clawd', () => {
  const crown = HAT_BLOCKS.find((b) => b.size[2] === CROWN_DEPTH)!
  const brim = HAT_BLOCKS.find((b) => b.size[2] === BRIM_DEPTH)!

  it('tem 10 blocos e 2 olhos', () => {
    expect(HAT_BLOCKS).toHaveLength(10)
    expect(HAT_EYE_BLOCKS).toHaveLength(2)
  })

  it('a copa encaixa no alto da cabeça', () => {
    const headTop = HEAD.center[1] + HEAD.ry
    const crownBottom = crown.position[1] - crown.size[1] / 2
    const crownTop = crown.position[1] + crown.size[1] / 2
    expect(crownBottom).toBeLessThan(headTop)
    expect(crownTop).toBeGreaterThan(headTop)
  })

  it('a aba fica na frente do rosto e os olhos na frente da copa', () => {
    expect(brim.size[2] / 2).toBeGreaterThan(FACE.z)
    for (const eye of HAT_EYE_BLOCKS) expect(eye.position[2]).toBeGreaterThan(CROWN_DEPTH / 2)
  })
})
