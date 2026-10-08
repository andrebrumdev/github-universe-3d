import { describe, expect, it } from 'vitest'
import { BRIM_DEPTH, CROWN_DEPTH, FACE, HAT_BLOCKS, HAT_EYE_BLOCKS, HEAD, HULL, LOWER_FIN, svgTo3d, UPPER_FIN } from './geometry'

describe('svgTo3d', () => {
  it('converte com 100 px = 1 unidade, origem no centro do casco e y para cima', () => {
    expect(svgTo3d(200, 312)).toEqual([0, 0])
    expect(svgTo3d(300, 212)).toEqual([1, 1])
    expect(svgTo3d(100, 412)).toEqual([-1, -1])
  })
})

describe('peças da nave', () => {
  it('as asas saem das laterais do casco', () => {
    for (const fin of [UPPER_FIN, LOWER_FIN]) {
      expect(fin).toHaveLength(4)
      expect(fin.every(([x]) => x < 0 && x > -HULL.rx - 0.2)).toBe(true)
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

  it('a aba fica na frente do rosto e os olhos na frente da copa', () => {
    expect(brim.size[2] / 2).toBeGreaterThan(FACE.z)
    for (const eye of HAT_EYE_BLOCKS) expect(eye.position[2]).toBeGreaterThan(CROWN_DEPTH / 2)
  })
})
