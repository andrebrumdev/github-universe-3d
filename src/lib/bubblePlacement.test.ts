import { describe, expect, it } from 'vitest'
import { steerBubble } from './bubblePlacement'

const overlaps = (x: number, y: number, w: number, h: number, d: { x: number; y: number; r: number }) => {
  // retângulo [x − w/2, x + w/2] × [y − h, y] contra o disco
  const cx = Math.max(x - w / 2, Math.min(d.x, x + w / 2))
  const cy = Math.max(y - h, Math.min(d.y, y))
  return Math.hypot(cx - d.x, cy - d.y) < d.r
}

describe('balão da fala longe do alvo', () => {
  const disc = { x: 600, y: 300, r: 120 }
  it('sem sobreposição, fica onde está', () => {
    expect(steerBubble(200, 500, 200, 60, disc)).toEqual({ x: 200, y: 500 })
    expect(steerBubble(200, 500, 200, 60, null)).toEqual({ x: 200, y: 500 })
  })

  it('em cima do disco, sai para o lado mais perto, sem tocar nele', () => {
    for (const [x, y] of [
      [560, 320],
      [650, 280],
      [600, 450],
      [700, 200],
    ]) {
      const p = steerBubble(x, y, 200, 60, disc)
      expect(overlaps(p.x, p.y, 200, 60, disc)).toBe(false)
      expect(p.y).toBe(y)
      expect(Math.sign(p.x - disc.x)).toBe(x < disc.x ? -1 : 1)
    }
  })
})
