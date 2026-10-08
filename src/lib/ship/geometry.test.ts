import { describe, expect, it } from 'vitest'
import {
  ANTENNA,
  ARM_Z,
  BRIM_DEPTH,
  CANOPY,
  canopyContains,
  COCKPIT,
  CROWN_DEPTH,
  DASH_TENTACLE,
  DASHBOARD,
  DECK_Y,
  EAR,
  ENGINE_RINGS_Z,
  FACE,
  FACE_PATCH,
  FREE_TENTACLE,
  FUSELAGE,
  fuselageSection,
  HAT,
  HAT_BLOCKS,
  HAT_EYE_BLOCKS,
  HEAD,
  headFrontZ,
  JOYSTICK,
  LEG_TENTACLES,
  NOZZLE,
  PILLAR,
  PLAN,
  planFacet,
  RIM,
  SEAT,
  type Tentacle,
  SHIP_HEIGHT,
  SHIP_LENGTH,
  STICK_TENTACLE,
  svgTo3d,
  TENTACLE,
  tentacleRadius,
  THOUGHTS,
  TORSO,
  TUB,
  tubHalfWidth,
  WHISKERS,
  WING,
  wingMidY,
  wingPoint,
  wingStationAt,
} from './geometry'

type Vec3 = [number, number, number]

/** Ponto do piloto (coordenadas do SVG) levado para o frame da nave pelo COCKPIT. */
function pilotToShip([x, y, z]: Vec3): Vec3 {
  const [px, py, pz] = COCKPIT.position
  return [px + x * COCKPIT.scale, py + y * COCKPIT.scale, pz + z * COCKPIT.scale]
}

/** Dentro da cabine: sob a cúpula ou, abaixo do aro, dentro da banheira do casco. */
function insideCabin(p: Vec3): boolean {
  return canopyContains(p) || (p[1] <= CANOPY.base && Math.abs(p[0]) < tubHalfWidth(p[2], Math.min(p[1], RIM.bottom)))
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

const ALL_TENTACLES: Tentacle[] = [FREE_TENTACLE, STICK_TENTACLE, DASH_TENTACLE, ...LEG_TENTACLES]
const radiusAt = (points: Tentacle['points'], i: number) => tentacleRadius(i / (points.length - 1))

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

  it('a bola do manche e as bolhas de pensamento cabem sob a cúpula', () => {
    const spheres: [number, number, number, number][] = [
      [JOYSTICK.knob[0], JOYSTICK.knob[1], ARM_Z, JOYSTICK.knobRadius],
      ...THOUGHTS,
    ]
    for (const [x, y, z, r] of spheres) {
      for (const [dx, dy, dz] of [
        [r, 0, 0],
        [-r, 0, 0],
        [0, r, 0],
        [0, 0, r],
      ]) {
        expect(insideCabin(pilotToShip([x + dx, y + dy, z + dz]))).toBe(true)
      }
    }
  })

  it('os tentáculos inteiros (com a grossura) ficam dentro da cabine, sem furar vidro nem casco', () => {
    for (const { points } of ALL_TENTACLES) {
      points.forEach(([x, y, z], i) => {
        const r = tentacleRadius(i / (points.length - 1))
        for (const [dx, dy, dz] of [
          [r, 0, 0],
          [-r, 0, 0],
          [0, r, 0],
          [0, -r, 0],
          [0, 0, r],
          [0, 0, -r],
        ])
          expect(insideCabin(pilotToShip([x + dx, y + dy, z + dz]))).toBe(true)
      })
    }
  })

  it('as pernas ficam no fundo da cabine: acima do piso, abaixo do aro, na frente da almofada e atrás do painel', () => {
    const cushionTop = DECK_Y + 2 * SEAT.shell + SEAT.cushion.height
    const cushionFront = SEAT.z + SEAT.cushion.depth / 2
    // painel inclinado: a face de trás nunca vem mais para trás que o centro menos a meia diagonal da caixa
    const dashBack = DASHBOARD.z - Math.hypot(DASHBOARD.depth / 2, DASHBOARD.height / 2)
    for (const { points } of LEG_TENTACLES) {
      points.forEach((p, i) => {
        const r = radiusAt(points, i) * COCKPIT.scale
        const [x, y, z] = pilotToShip(p)
        expect(y - r).toBeGreaterThan(DECK_Y)
        expect(z + r).toBeLessThan(dashBack)
        if (i > 0) expect(z - r > cushionFront || y - r > cushionTop || Math.abs(x) - r > SEAT.width / 2).toBe(true)
      })
      const tip = pilotToShip(points.at(-1)!)
      expect(tip[1]).toBeLessThan(RIM.bottom) // a ponta fica dentro da banheira, abaixo do aro
      expect(insideCabin(tip)).toBe(true)
      expect(points.at(-1)![1]).toBeGreaterThan(points.at(-3)![1]) // a ponta enrola para cima
    }
  })

  it('o terceiro braço chega ao painel por cima, sem atravessá-lo', () => {
    const tip = DASH_TENTACLE.points.at(-1)!
    const [x, y, z] = pilotToShip(tip)
    const r = tentacleRadius(1) * COCKPIT.scale
    expect(y - r).toBeGreaterThan(DECK_Y + DASHBOARD.height)
    expect(y - r).toBeLessThan(DECK_Y + DASHBOARD.height + 0.06) // encostado
    expect(Math.abs(z - DASHBOARD.z)).toBeLessThan(DASHBOARD.depth)
    expect(Math.abs(x)).toBeLessThan(DASHBOARD.width / 2)
  })

  it('o manche fica em pé no piso da cabine', () => {
    const bottom = pilotToShip([JOYSTICK.base[0], JOYSTICK.base[1] - JOYSTICK.height / 2, ARM_Z])
    expect(Math.abs(bottom[1] - DECK_Y)).toBeLessThan(0.03)
  })
})

describe('Octocat', () => {
  /** Valor da equação da elipsoide do corpo (meia esfera apoiada em TORSO.base) crescida de `grow`: < 1 = dentro. */
  function torsoLevel([x, y, z]: Vec3, grow: number): number {
    return (x / (TORSO.rx + grow)) ** 2 + ((y - TORSO.base[1]) / (TORSO.ry + grow)) ** 2 + (z / (TORSO.rz + grow)) ** 2
  }

  it('os tentáculos nascem nos ombros, encostados no corpo, um de cada lado', () => {
    for (const tentacle of ALL_TENTACLES) {
      expect(torsoLevel(tentacle.points[0], TENTACLE.baseRadius)).toBeLessThan(1)
    }
    expect(ALL_TENTACLES).toHaveLength(5) // 3 braços e 2 pernas
    expect(LEG_TENTACLES[1].points.map(([x, y, z]) => [-x, y, z])).toEqual(LEG_TENTACLES[0].points)
    expect(FREE_TENTACLE.points[0][0]).toBeLessThan(0)
    expect(STICK_TENTACLE.points[0][0]).toBeGreaterThan(0)
  })

  it('o tentáculo é grosso na base e afina sem parar até a ponta arredondada', () => {
    expect(tentacleRadius(0)).toBeCloseTo(TENTACLE.baseRadius, 10)
    expect(tentacleRadius(1)).toBeCloseTo(TENTACLE.tipRadius, 10)
    expect(TENTACLE.baseRadius).toBeGreaterThan(2.5 * TENTACLE.tipRadius)
    for (let t = 0.05; t <= 1; t += 0.05) expect(tentacleRadius(t)).toBeLessThan(tentacleRadius(t - 0.05))
  })

  it('o tentáculo livre é longo e a ponta se enrola de volta', () => {
    const pts = FREE_TENTACLE.points
    let length = 0
    for (let i = 1; i < pts.length; i++) length += Math.hypot(...([0, 1, 2].map((k) => pts[i][k] - pts[i - 1][k]) as Vec3))
    expect(length).toBeGreaterThan(1.4)
    // a ponta volta para dentro (x cresce) depois do ponto mais afastado do corpo
    const far = pts.reduce((a, b) => (b[0] < a[0] ? b : a))
    expect(pts.at(-1)![0]).toBeGreaterThan(far[0] + 0.2)
  })

  it('o tentáculo do manche se enrola em volta da bola sem atravessá-la', () => {
    const [kx, ky] = JOYSTICK.knob
    const wrap = STICK_TENTACLE.points.slice(2)
    const angles = wrap.map(([x, y]) => Math.atan2(y - ky, x - kx))
    let swept = 0
    for (let i = 1; i < angles.length; i++) {
      let d = angles[i] - angles[i - 1]
      if (d > Math.PI) d -= Math.PI * 2
      if (d < -Math.PI) d += Math.PI * 2
      swept += d
    }
    expect(Math.abs(swept)).toBeGreaterThan(Math.PI) // mais de meia volta
    STICK_TENTACLE.points.forEach(([x, y, z], i) => {
      const r = tentacleRadius(i / (STICK_TENTACLE.points.length - 1))
      expect(Math.hypot(x - kx, y - ky, z - ARM_Z)).toBeGreaterThan(JOYSTICK.knobRadius + r * 0.6)
    })
  })

  it('a cabeça apoia no corpo', () => {
    const torsoTop = TORSO.base[1] + TORSO.ry
    expect(HEAD.center[1] - HEAD.ry).toBeLessThan(torsoTop)
    expect(HEAD.center[1]).toBeGreaterThan(torsoTop)
  })

  it('o rosto pêssego é grande e fica todo sobre a frente da cabeça; o pedaço texturizado não sai da silhueta', () => {
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2
      const x = FACE.rx * Math.cos(a)
      const y = FACE.center[1] + FACE.ry * Math.sin(a)
      expect(headFrontZ(x, y)).toBeGreaterThan(0.15)
      const [px, py] = [FACE_PATCH.rx * Math.cos(a), FACE_PATCH.center[1] + FACE_PATCH.ry * Math.sin(a)]
      expect(headFrontZ(px, py, 0.015)).toBeGreaterThan(0)
    }
    expect(FACE.rx / HEAD.rx).toBeGreaterThan(0.8) // quase toda a largura da frente
    expect(FACE.center[1]).toBeLessThan(HEAD.center[1])
    expect(headFrontZ(0, HEAD.center[1])).toBeCloseTo(HEAD.rz, 10)
    expect(headFrontZ(HEAD.rx + 0.1, HEAD.center[1])).toBe(0)
    expect(headFrontZ(0, HEAD.center[1], 0.02)).toBeCloseTo(HEAD.rz + 0.02, 10)
    expect(headFrontZ(0.3, 1.3, 0.02)).toBeGreaterThan(headFrontZ(0.3, 1.3))
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
  const tip = stations.at(-1)!
  const angles = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2)
  const hullWidth = 2 * PLAN.a

  /** Meia largura do casco ou do motor (o que for mais largo) em (z, y). */
  function bodyHalfWidth(z: number, y: number): number {
    const f = fuselageSection(z)
    const onEngine = z <= FUSELAGE[0].z && z >= FUSELAGE.at(-1)!.z
    const engine = onEngine ? f.rx * Math.sqrt(Math.max(0, 1 - ((y - f.cy) / f.ry) ** 2)) : 0
    return Math.max(tubHalfWidth(z, y), engine)
  }

  it('são um par espelhado em x', () => {
    for (const st of stations)
      for (const a of angles) {
        const [x, y, z] = wingPoint(1, st, a)
        expect(wingPoint(-1, st, a)).toEqual([-x, y, z])
      }
  })

  it('a raiz corre pela lateral de baixo do casco, da frente sob a cabine até o motor, embutida nele', () => {
    const root = stations.filter((st) => st.inner <= WING.root.x)
    expect(root[0].z).toBeGreaterThan(0.5) // começa na frente, sob a cabine
    expect(root.at(-1)!.z).toBeLessThan(-1.4) // e vai até o motor
    for (const st of root) {
      const [x, y, z] = wingPoint(1, st, Math.PI) // borda de dentro
      expect(y).toBeLessThan(RIM.bottom)
      expect(x).toBeLessThan(bodyHalfWidth(z, y))
    }
  })

  it('abre para os lados: envergadura de cerca de uma largura de casco para cada lado', () => {
    const [tipX] = wingPoint(1, tip, 0)
    expect(tipX).toBeGreaterThanOrEqual(PLAN.a + 0.8 * hullWidth)
    expect(tipX).toBeLessThanOrEqual(PLAN.a + 1.3 * hullWidth)
  })

  it('tem diedro de 20–25°: a lâmina sobe da raiz para fora e a ponta fica bem mais alta', () => {
    expect(WING.dihedral).toBeGreaterThanOrEqual((20 * Math.PI) / 180)
    expect(WING.dihedral).toBeLessThanOrEqual((25 * Math.PI) / 180)
    const mid = stations[3]
    const [xOut, yOut] = wingPoint(1, mid, 0)
    const slope = (yOut - wingMidY(mid, WING.root.x)) / (xOut - WING.root.x)
    expect(Math.atan(slope)).toBeCloseTo(WING.dihedral, 10)
    const [, tipY] = wingPoint(1, tip, 0)
    expect(tipY - stations[0].y).toBeGreaterThan(0.6)
  })

  it('é enflechada: o bordo de ataque recua para fora e a ponta fica atrás do bocal', () => {
    for (let i = 1; i < stations.length; i++) {
      expect(stations[i].z).toBeLessThan(stations[i - 1].z)
      expect(stations[i].outer).toBeGreaterThan(stations[i - 1].outer)
    }
    expect(tip.z).toBeLessThan(nozzleBack)
    expect(tip.outer - tip.inner).toBeLessThan(0.1) // termina em ponta
  })

  it('é encorpada na raiz e afina para a ponta', () => {
    const thickest = stations.reduce((a, b) => (b.thickness > a.thickness ? b : a))
    expect(thickest.thickness).toBeGreaterThanOrEqual(0.18)
    expect(thickest.z).toBeGreaterThan(-1)
    const tail = stations.slice(stations.indexOf(thickest))
    for (let i = 1; i < tail.length; i++) expect(tail[i].thickness).toBeLessThan(tail[i - 1].thickness)
  })

  it('a faixa corre por baixo, perto do bordo de ataque, e as luzes ficam perto da ponta, por cima', () => {
    for (const a of [WING.stripe.from, WING.stripe.to]) {
      expect(Math.sin(a)).toBeLessThan(0)
      expect(Math.cos(a)).toBeGreaterThan(0)
    }
    for (const { z, angle } of WING.lights) {
      expect(z).toBeLessThan(nozzleBack)
      expect(z).toBeGreaterThan(tip.z)
      expect(Math.sin(angle)).toBeGreaterThan(0)
      const [x] = wingPoint(1, wingStationAt(z), angle)
      expect(x).toBeGreaterThan(PLAN.a + 0.5 * hullWidth)
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

  it('é o desenho do SVG reduzido: a copa é mais estreita que a cabeça e a aba fica na altura de HAT.brimBottom', () => {
    expect(HAT.scale).toBeGreaterThanOrEqual(0.8)
    expect(HAT.scale).toBeLessThanOrEqual(0.85)
    expect(crown.size[0]).toBeCloseTo(1.16 * HAT.scale, 10)
    expect(crown.size[0]).toBeLessThan(2 * HEAD.rx * 0.8)
    expect(brim.position[1] - brim.size[1] / 2).toBeCloseTo(HAT.brimBottom, 10)
    expect(crown.position[0]).toBeCloseTo(0, 10)
  })

  it('a copa encaixa no alto da cabeça', () => {
    const headTop = HEAD.center[1] + HEAD.ry
    const crownBottom = crown.position[1] - crown.size[1] / 2
    const crownTop = crown.position[1] + crown.size[1] / 2
    expect(crownBottom).toBeLessThan(headTop)
    expect(crownTop).toBeGreaterThan(headTop)
  })

  it('a cabeça não fura a copa: acima da aba, a cabeça cabe na profundidade da copa', () => {
    const brimTop = brim.position[1] + brim.size[1] / 2
    const crownTop = crown.position[1] + crown.size[1] / 2
    for (let y = brimTop; y <= crownTop; y += 0.01) {
      expect(headFrontZ(0, y)).toBeLessThanOrEqual(CROWN_DEPTH / 2)
    }
  })

  it('a aba fica na frente do rosto, sem fresta entre ela e a pele, e os olhos na frente da copa', () => {
    const brimBottom = brim.position[1] - brim.size[1] / 2
    expect(brim.size[2] / 2).toBeGreaterThan(headFrontZ(0, brimBottom, 0.015))
    // faixa de testa escura entre a pele e a aba, como no Octocat clássico
    expect(brimBottom - (FACE.center[1] + FACE.ry)).toBeGreaterThan(0.05)
    expect(brimBottom - (FACE.center[1] + FACE.ry)).toBeLessThan(0.2)
    for (const eye of HAT_EYE_BLOCKS) expect(eye.position[2]).toBeGreaterThan(CROWN_DEPTH / 2)
  })
})

describe('orelhas e bigodes', () => {
  const crown = HAT_BLOCKS.find((b) => b.size[2] === CROWN_DEPTH)!
  const [rx, ry] = EAR.root
  const [tx, ty] = EAR.tip
  const len = Math.hypot(tx - rx, ty - ry)
  const [px, py] = [-(ty - ry) / len, (tx - rx) / len] // perpendicular à orelha, no plano xy

  it('cada orelha nasce dentro da cabeça e sai pela lateral da copa, acima das abas, bem para fora', () => {
    expect((rx / HEAD.rx) ** 2 + ((ry - HEAD.center[1]) / HEAD.ry) ** 2).toBeLessThan(1)
    const crownSide = crown.position[0] + crown.size[0] / 2
    expect(tx).toBeGreaterThan(crownSide + 0.25)
    expect(ty).toBeGreaterThan(HEAD.center[1] + HEAD.ry) // pontuda, acima da cabeça
    // onde o eixo da orelha cruza a lateral da copa, a base já passou do alto das abas laterais
    const flapTop = Math.max(...HAT_BLOCKS.filter((b) => b.position[0] > crownSide).map((b) => b.position[1] + b.size[1] / 2))
    const exitY = ry + ((crownSide - rx) / (tx - rx)) * (ty - ry)
    expect(exitY).toBeGreaterThan(flapTop)
    // mais da metade do comprimento fica para fora do gorro
    expect((tx - crownSide) / (tx - rx)).toBeGreaterThan(0.5)
  })

  it('as duas orelhas (espelhadas) e os cantos da base cabem sob a cúpula', () => {
    for (const side of [1, -1])
      for (const [x, y, z] of [
        [tx, ty, 0],
        [rx + px * EAR.radius, ry + py * EAR.radius, 0],
        [rx - px * EAR.radius, ry - py * EAR.radius, 0],
        [rx, ry, EAR.radius * EAR.depth],
        [rx, ry, -EAR.radius * EAR.depth],
      ] as Vec3[])
        expect(canopyContains(pilotToShip([side * x, y, z]))).toBe(true)
  })

  it('os bigodes saem da bochecha e passam da silhueta da cabeça, dentro da cúpula', () => {
    for (const [inner, outer] of WHISKERS) {
      expect(Math.abs(inner[2] - headFrontZ(inner[0], inner[1]))).toBeLessThan(0.03)
      expect(headFrontZ(outer[0], outer[1])).toBeLessThan(outer[2])
      expect(Math.abs(outer[0])).toBeGreaterThan(HEAD.rx * Math.sqrt(1 - ((outer[1] - HEAD.center[1]) / HEAD.ry) ** 2))
      for (const side of [1, -1]) expect(canopyContains(pilotToShip([side * outer[0], outer[1], outer[2]]))).toBe(true)
    }
  })
})
