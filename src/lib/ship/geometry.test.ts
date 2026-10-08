import { describe, expect, it } from 'vitest'
import {
  ANTENNA,
  BRIM_DEPTH,
  CANOPY,
  canopyContains,
  COCKPIT,
  CROWN_DEPTH,
  DASHBOARD,
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
  PLAN,
  planFacet,
  RIM,
  SEAT,
  SHIP_HEIGHT,
  SHIP_LENGTH,
  svgTo3d,
  TORSO,
  TUB,
  tubHalfWidth,
  WING,
  wingPoint,
  wingStationAt,
} from './geometry'

type Vec3 = [number, number, number]

/** Ponto do piloto (coordenadas do SVG) levado para o frame da nave pelo COCKPIT. */
function pilotToShip([x, y, z]: Vec3): Vec3 {
  const [px, py, pz] = COCKPIT.position
  return [px + x * COCKPIT.scale, py + y * COCKPIT.scale, pz + z * COCKPIT.scale]
}

const hatCorners = (): Vec3[] =>
  HAT_BLOCKS.flatMap(({ position, size }) =>
    [-1, 1].flatMap((sx) =>
      [-1, 1].flatMap((sy) =>
        [-1, 1].map(
          (sz) =>
            [
              position[0] + (sx * size[0]) / 2,
              position[1] + (sy * size[1]) / 2,
              position[2] + (sz * size[2]) / 2,
            ] as Vec3,
        ),
      ),
    ),
  )

describe('svgTo3d', () => {
  it('converte com 100 px = 1 unidade, origem no centro do casco e y para cima', () => {
    expect(svgTo3d(200, 312)).toEqual([0, 0])
    expect(svgTo3d(300, 212)).toEqual([1, 1])
    expect(svgTo3d(100, 412)).toEqual([-1, -1])
  })
})

describe('casco e cúpula', () => {
  it('a nave é compacta: comprimento entre 1,6 e 2,1 vezes a altura', () => {
    const ratio = SHIP_LENGTH / SHIP_HEIGHT
    expect(ratio).toBeGreaterThan(1.6)
    expect(ratio).toBeLessThan(2.1)
  })

  it('a cúpula é longa e baixa: ~2,4× mais longa que alta e mais larga que alta', () => {
    const lengthOverHeight = (2 * CANOPY.b) / CANOPY.height
    expect(lengthOverHeight).toBeGreaterThan(2.2)
    expect(lengthOverHeight).toBeLessThan(2.6)
    expect(2 * CANOPY.a).toBeGreaterThan(CANOPY.height)
    expect(CANOPY.lean).toBeGreaterThan(0) // ponto mais alto puxado para a frente
  })

  it('a cúpula assenta no aro e cobre quase todo o casco', () => {
    expect(CANOPY.a).toBeLessThan(PLAN.a)
    expect(CANOPY.a).toBeGreaterThan(PLAN.a - RIM.width)
    expect(CANOPY.b).toBeLessThan(PLAN.b)
    expect(CANOPY.b).toBeGreaterThan(PLAN.b - RIM.width)
    expect(CANOPY.base).toBeGreaterThan(RIM.bottom)
    expect(CANOPY.base).toBeLessThan(RIM.top)
  })

  it('o casco é uma banheira rasa: fundo ~0,45× a altura da cúpula, proa subindo', () => {
    const depth = RIM.top - TUB.rings[0].y
    expect(depth / CANOPY.height).toBeGreaterThan(0.35)
    expect(depth / CANOPY.height).toBeLessThan(0.55)
    expect(TUB.rings[0].dz).toBeLessThan(0) // o fundo recua: a proa sobe
    expect(TUB.rings.at(-1)!.y).toBe(DECK_Y)
    expect(TUB.rings[TUB.outerWall - 1].y).toBeLessThanOrEqual(RIM.bottom + 0.01)
  })

  it('o aro é fino e os quadradinhos cabem na face de fora, na frente', () => {
    expect(RIM.top - RIM.bottom).toBeLessThan(0.1)
    const front = planFacet(0, PLAN.a, PLAN.b)
    expect(front.center[0]).toBeCloseTo(0, 10)
    expect(front.yaw).toBeCloseTo(0, 10)
    expect(planFacet(2, PLAN.a, PLAN.b).center[0]).toBeGreaterThan(0)
  })
})

describe('piloto na cabine', () => {
  it('o corpo senta no piso da cabine', () => {
    expect(pilotToShip([0, TORSO.base[1], 0])[1]).toBeCloseTo(DECK_Y, 10)
  })

  it('a cabeça e o gorro inteiro cabem sob a cúpula', () => {
    const [hx, hy] = HEAD.center
    const head: Vec3[] = [
      [hx, hy + HEAD.ry, 0],
      [hx - HEAD.rx, hy, 0],
      [hx + HEAD.rx, hy, 0],
      [hx, hy, HEAD.rz],
      [hx, hy, -HEAD.rz],
    ]
    for (const p of [...head, ...hatCorners()]) expect(canopyContains(pilotToShip(p))).toBe(true)
  })

  it('o assento fica sob o piloto e o painel na frente dele, dentro do casco', () => {
    expect(SEAT.z).toBe(COCKPIT.position[2])
    expect(SEAT.back.z).toBeLessThan(SEAT.z)
    expect(DASHBOARD.z).toBeGreaterThan(SEAT.z + SEAT.cushion.depth)
    expect(DASHBOARD.z + DASHBOARD.depth / 2).toBeLessThan(PLAN.b * TUB.rings.at(-1)!.f)
  })
})

describe('coluna e antena', () => {
  it('a coluna vai do piso de trás até o alto da cúpula, por dentro do vidro e atrás do gorro', () => {
    const [first, last] = [PILLAR.points[0], PILLAR.points.at(-1)!]
    expect(first[1]).toBe(DECK_Y)
    expect(last[1]).toBeGreaterThan(CANOPY.base + CANOPY.height * 0.85)
    for (const p of PILLAR.points.slice(1, -1)) expect(canopyContains([p[0], p[1] + PILLAR.radius, p[2]])).toBe(true)
    // o topo encosta no vidro: o eixo ainda está dentro, um diâmetro acima já está fora
    expect(canopyContains(last)).toBe(true)
    expect(canopyContains([last[0], last[1] + 2 * PILLAR.radius, last[2]])).toBe(false)
    const hatBack = Math.min(...hatCorners().map((c) => pilotToShip(c)[2]))
    for (const p of PILLAR.points.slice(0, 3)) expect(p[2] + PILLAR.radius).toBeLessThan(hatBack)
  })

  it('a antena sai do topo da coluna, na junção com a cúpula', () => {
    const [root, top] = [ANTENNA.points[0], PILLAR.points.at(-1)!]
    expect(Math.hypot(root[1] - top[1], root[2] - top[2])).toBeLessThan(PILLAR.radius * 1.5)
    expect(canopyContains(ANTENNA.points[1])).toBe(false)
  })
})

describe('motor', () => {
  it('nasce sob o piso, dentro da planta do casco, e vai para trás (−z)', () => {
    const zs = FUSELAGE.map((s) => s.z)
    for (let i = 1; i < zs.length; i++) expect(zs[i]).toBeLessThan(zs[i - 1])
    expect(FUSELAGE[0].cy + FUSELAGE[0].ry).toBeLessThan(DECK_Y)
    expect(Math.abs(FUSELAGE[0].z)).toBeLessThan(PLAN.b)
  })

  it('é encorpado (~3/4 da largura da cabine) e baixo (topo entre o piso e o aro)', () => {
    const widest = FUSELAGE.reduce((a, b) => (b.rx > a.rx ? b : a))
    const ratio = widest.rx / PLAN.a
    expect(ratio).toBeGreaterThanOrEqual(0.7)
    expect(ratio).toBeLessThanOrEqual(0.8)
    expect(widest.cy + widest.ry).toBeLessThan(RIM.top)
    expect(widest.cy + widest.ry).toBeGreaterThan(DECK_Y)
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
    expect(fuselageSection((a.z + b.z) / 2).rx).toBeCloseTo((a.rx + b.rx) / 2, 10)
    expect(fuselageSection(a.z)).toEqual(a)
  })

  it('as faixas e o bocal ficam ao longo do motor, atrás do casco', () => {
    for (const z of ENGINE_RINGS_Z) {
      expect(z).toBeLessThan(-PLAN.b)
      expect(z).toBeGreaterThan(FUSELAGE.at(-1)!.z)
    }
    expect(NOZZLE.z).toBe(FUSELAGE.at(-1)!.z)
  })
})

describe('asas', () => {
  const nozzleBack = NOZZLE.z - NOZZLE.length
  const stations = WING.stations
  const center = (st: (typeof stations)[number]) => (st.lower + st.upper) / 2
  const angles = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2)

  it('são um par espelhado em x', () => {
    for (const st of stations)
      for (const a of angles) {
        const [x, y, z] = wingPoint(1, st, a)
        expect(wingPoint(-1, st, a)).toEqual([-x, y, z])
      }
  })

  it('a raiz abraça a parte de baixo da proa, colada no casco', () => {
    const front = stations.filter((st) => st.z >= 0)
    expect(front.length).toBeGreaterThan(1)
    for (const st of front) {
      expect(st.upper).toBeLessThan(RIM.bottom)
      const [x, y, z] = wingPoint(1, st, Math.PI) // face de dentro
      expect(x).toBeLessThanOrEqual(tubHalfWidth(z, y) + 0.01)
    }
  })

  it('fica colada no motor ao longo dele', () => {
    for (const st of stations.filter((s) => s.z <= -1.2 && s.z >= FUSELAGE.at(-1)!.z)) {
      const [x, y] = wingPoint(1, st, Math.PI)
      const f = fuselageSection(st.z)
      const hullX = f.rx * Math.sqrt(Math.max(0, 1 - ((y - f.cy) / f.ry) ** 2))
      expect(Math.abs(x - hullX)).toBeLessThan(0.12)
    }
  })

  it('curva para cima até uma ponta mais alta que a raiz, atrás do bocal', () => {
    const tip = stations.at(-1)!
    expect(tip.z).toBeLessThan(nozzleBack)
    expect(center(tip)).toBeGreaterThan(center(stations[0]))
    const lowest = stations.reduce((a, b) => (center(b) < center(a) ? b : a))
    const rising = stations.slice(stations.indexOf(lowest))
    for (let i = 1; i < rising.length; i++) expect(center(rising[i])).toBeGreaterThan(center(rising[i - 1]))
  })

  it('é encorpada na frente e afina para a cauda', () => {
    const thickest = stations.reduce((a, b) => (b.thickness > a.thickness ? b : a))
    expect(thickest.thickness).toBeGreaterThanOrEqual(0.18)
    expect(thickest.z).toBeGreaterThan(-1)
    const tail = stations.slice(stations.indexOf(thickest))
    for (let i = 1; i < tail.length; i++) {
      expect(tail[i].thickness).toBeLessThan(tail[i - 1].thickness)
      expect(tail[i].upper - tail[i].lower).toBeLessThanOrEqual(tail[i - 1].upper - tail[i - 1].lower)
    }
  })

  it('a faixa é a borda de baixo e as luzes ficam perto da ponta, por cima', () => {
    expect(Math.sin(WING.stripe.from)).toBeLessThan(0)
    expect(Math.sin(WING.stripe.to)).toBeLessThan(0)
    for (const { z, angle } of WING.lights) {
      expect(z).toBeLessThan(FUSELAGE.at(-1)!.z)
      expect(z).toBeGreaterThan(stations.at(-1)!.z)
      expect(Math.sin(angle)).toBeGreaterThan(0)
    }
    expect(wingStationAt(stations[2].z)).toEqual(stations[2])
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
