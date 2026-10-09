import { describe, expect, it } from 'vitest'
import { hitRadius, MOUSE_HIT_PX, PROXY_DISTANCE_BASE, proxyHit, TOUCH_HIT_PX, worldPerPixel } from './hitArea'

const FOV = 50
const H = 844
const origin = { x: 0, y: 0, z: 0 }
const forward = { x: 0, y: 0, z: -1 }

/** Ponto a `px` pixels do centro da tela, na profundidade `depth`, olhando para −z. */
function offAxis(px: number, depth: number) {
  return { x: px * worldPerPixel(depth, FOV, H), y: 0, z: -depth }
}

describe('worldPerPixel / hitRadius', () => {
  it('um pixel cresce com a distância e encolhe com a altura da tela', () => {
    const near = worldPerPixel(10, FOV, H)
    expect(worldPerPixel(20, FOV, H)).toBeCloseTo(near * 2)
    expect(worldPerPixel(10, FOV, H * 2)).toBeCloseTo(near / 2)
    // altura inteira da tela = 2·d·tan(fov/2)
    expect(near * H).toBeCloseTo(2 * 10 * Math.tan((FOV * Math.PI) / 360))
  })

  it('corpo pequeno na tela: o raio é o mínimo em px; corpo grande: o próprio raio', () => {
    const d = 200
    expect(hitRadius(0.1, TOUCH_HIT_PX, d, FOV, H)).toBeCloseTo(TOUCH_HIT_PX * worldPerPixel(d, FOV, H))
    expect(hitRadius(5, TOUCH_HIT_PX, 10, FOV, H)).toBe(5)
  })

  it('toque pede mais folga que o mouse', () => {
    expect(TOUCH_HIT_PX).toBeGreaterThanOrEqual(22)
    expect(MOUSE_HIT_PX).toBeLessThan(TOUCH_HIT_PX)
  })
})

describe('proxyHit', () => {
  it('acerta um corpo de ~10 px tocando a 20 px do centro, erra a 24 px', () => {
    const depth = 300
    const radius = 5 * worldPerPixel(depth, FOV, H)
    // o raio passa a 20 px do centro: equivale a mover o centro 20 px de lado
    expect(proxyHit(origin, forward, offAxis(20, depth), radius, TOUCH_HIT_PX, FOV, H)).not.toBeNull()
    expect(proxyHit(origin, forward, offAxis(24, depth), radius, TOUCH_HIT_PX, FOV, H)).toBeNull()
  })

  it('devolve a distância do toque ao centro em px', () => {
    const hit = proxyHit(origin, forward, offAxis(12, 300), 0.01, TOUCH_HIT_PX, FOV, H)
    expect(hit?.offsetPx).toBeCloseTo(12, 1)
  })

  it('corpo atrás da câmera não conta', () => {
    expect(proxyHit(origin, forward, { x: 0, y: 0, z: 5 }, 1, TOUCH_HIT_PX, FOV, H)).toBeNull()
  })

  it('sempre depois de qualquer acerto real (luas, a superfície), e o mais perto na tela primeiro', () => {
    const a = proxyHit(origin, forward, offAxis(4, 300), 0.01, TOUCH_HIT_PX, FOV, H)
    const b = proxyHit(origin, forward, offAxis(15, 120), 0.01, TOUCH_HIT_PX, FOV, H)
    expect(a && b).toBeTruthy()
    // b está mais perto da câmera, mas a está mais perto do dedo: a vence
    expect(a!.distance).toBeLessThan(b!.distance)
    expect(a!.distance).toBeGreaterThanOrEqual(PROXY_DISTANCE_BASE)
  })
})
