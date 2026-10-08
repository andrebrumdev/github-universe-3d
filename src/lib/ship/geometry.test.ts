import { describe, expect, it } from 'vitest'
import {
  ARM_RADIUS,
  ARM_Z,
  BOWL_PROFILE,
  bowlRadiusAt,
  BRIM_DEPTH,
  BUBBLE,
  COCKPIT,
  CROWN_DEPTH,
  DECK_Y,
  ENGINE_RINGS_Z,
  FACE,
  FREE_ARM,
  FUSELAGE,
  fuselageSection,
  HAT_BLOCKS,
  HAND_RADIUS,
  HAT_EYE_BLOCKS,
  HEAD,
  headFrontZ,
  JOYSTICK,
  KEEL,
  NOZZLE,
  RIM,
  STICK_ARM,
  svgTo3d,
  THOUGHTS,
  TOP_FIN,
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

  it('a mão livre, a bola do manche e as bolhas de pensamento cabem na bolha', () => {
    const spheres: [number, number, number, number][] = [
      [FREE_ARM.to[0], FREE_ARM.to[1], ARM_Z, HAND_RADIUS],
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
        expect(insideBubble(pilotToShip([x + dx, y + dy, z + dz]))).toBe(true)
      }
    }
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

  it('os ombros encostam no corpo (o tubo do braço toca a superfície)', () => {
    for (const arm of [FREE_ARM, STICK_ARM]) {
      expect(torsoLevel([arm.from[0], arm.from[1], ARM_Z], ARM_RADIUS)).toBeLessThan(1)
    }
  })

  it('a cabeça apoia no corpo', () => {
    const torsoTop = TORSO.base[1] + TORSO.ry
    expect(HEAD.center[1] - HEAD.ry).toBeLessThan(torsoTop)
    expect(HEAD.center[1]).toBeGreaterThan(torsoTop)
  })

  it('o contorno do rosto fica todo sobre a frente da cabeça', () => {
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2
      const x = FACE.rx * Math.cos(a)
      const y = FACE.center[1] + FACE.ry * Math.sin(a)
      expect(headFrontZ(x, y)).toBeGreaterThan(0.15)
    }
    expect(headFrontZ(0, HEAD.center[1])).toBeCloseTo(HEAD.rz, 10)
    expect(headFrontZ(HEAD.rx + 0.1, HEAD.center[1])).toBe(0)
    expect(headFrontZ(0, HEAD.center[1], 0.02)).toBeCloseTo(HEAD.rz + 0.02, 10)
    expect(headFrontZ(0.3, 1.3, 0.02)).toBeGreaterThan(headFrontZ(0.3, 1.3))
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

  it('a aleta de cima e a quilha nascem de dentro da fuselagem', () => {
    const base = TOP_FIN.outline.filter(([, y]) => y === Math.min(...TOP_FIN.outline.map(([, v]) => v)))
    for (const [z, y] of base) {
      const s = fuselageSection(z)
      expect(y).toBeLessThan(s.cy + s.ry)
    }
    const keelTop = KEEL.outline.filter(([, y]) => y > -0.7)
    expect(keelTop.length).toBeGreaterThan(0)
    for (const [z, y] of keelTop) {
      const s = fuselageSection(z)
      expect(y).toBeGreaterThan(s.cy - s.ry)
    }
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

  it('a cabeça não fura a copa: acima da aba, a cabeça cabe na profundidade da copa', () => {
    const brimTop = brim.position[1] + brim.size[1] / 2
    const crownTop = crown.position[1] + crown.size[1] / 2
    for (let y = brimTop; y <= crownTop; y += 0.01) {
      expect(headFrontZ(0, y)).toBeLessThanOrEqual(CROWN_DEPTH / 2)
    }
  })

  it('a aba fica na frente do rosto e os olhos na frente da copa', () => {
    expect(brim.size[2] / 2).toBeGreaterThan(FACE.z)
    for (const eye of HAT_EYE_BLOCKS) expect(eye.position[2]).toBeGreaterThan(CROWN_DEPTH / 2)
  })
})
