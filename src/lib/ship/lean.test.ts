import { describe, expect, it } from 'vitest'
import { escortFraming, escortPlacement, shipFaceBox, shipScreenBox, type EscortScreen } from './escort'
import { LEAN_OVERHANG, leanPlacement, leanWeight } from './lean'
import type { Rect } from '../uiLayout'

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('soneca: a nave encosta na borda da tela', () => {
  it('desktop: vai até a borda do canto (passando um pouco dela), na mesma altura, com o rosto na tela', () => {
    const screen: EscortScreen = { width: 1600, height: 1000, reserved: [] }
    const framing = escortFraming(1600, 1000)
    const base = escortPlacement(screen, framing)
    const lean = leanPlacement(screen, framing, base)
    const box = shipScreenBox(lean, 1000)
    expect(box.x + box.w).toBeCloseTo(1600 + LEAN_OVERHANG * box.w, 5)
    expect(lean.centerX).toBeGreaterThan(base.centerX)
    expect(lean.centerY).toBe(base.centerY)
    expect(lean.heightFraction).toBe(base.heightFraction)
    const face = shipFaceBox(lean, 1000)
    expect(face.x + face.w).toBeLessThanOrEqual(1600)
  })

  it('celular em pé: encosta na borda esquerda (o lado da escolta)', () => {
    const screen: EscortScreen = { width: 390, height: 844, reserved: [] }
    const framing = escortFraming(390, 844)
    const base = escortPlacement(screen, framing)
    const lean = leanPlacement(screen, framing, base)
    const box = shipScreenBox(lean, 844)
    expect(box.x).toBeCloseTo(-LEAN_OVERHANG * box.w, 5)
    expect(shipFaceBox(lean, 844).x).toBeGreaterThanOrEqual(0)
  })

  it('nunca cobre a interface: para antes de um retângulo reservado no caminho', () => {
    const framing = escortFraming(1600, 1000)
    const free = escortPlacement({ width: 1600, height: 1000, reserved: [] }, framing)
    const freeBox = shipScreenBox(free, 1000)
    // um cartão logo à direita da nave, na altura dela
    const card: Rect = { x: freeBox.x + freeBox.w + 20, y: freeBox.y, w: 30, h: freeBox.h }
    const screen: EscortScreen = { width: 1600, height: 1000, reserved: [card] }
    const base = escortPlacement(screen, framing)
    const lean = leanPlacement(screen, framing, base)
    expect(overlaps(shipScreenBox(lean, 1000), card)).toBe(false)
  })

  it('sem lugar melhor, fica onde está', () => {
    const framing = escortFraming(1600, 1000)
    const base = escortPlacement({ width: 1600, height: 1000, reserved: [] }, framing)
    const box = shipScreenBox(base, 1000)
    const wall: Rect = { x: box.x + box.w + 1, y: 0, w: 2000, h: 1000 }
    const lean = leanPlacement({ width: 1600, height: 1000, reserved: [wall] }, framing, base)
    expect(lean).toEqual(base)
  })

  it('peso da soneca: desliza devagar para a borda e volta mais depressa', () => {
    let w = 0
    for (let i = 0; i < 30; i++) w = leanWeight(w, true, 1 / 60)
    expect(w).toBeGreaterThan(0)
    expect(w).toBeLessThan(0.5)
    for (let i = 0; i < 240; i++) w = leanWeight(w, true, 1 / 60)
    expect(w).toBeGreaterThan(0.95)
    let back = w
    for (let i = 0; i < 30; i++) back = leanWeight(back, false, 1 / 60)
    expect(1 - back).toBeGreaterThan(0.5 - 0)
    expect(leanWeight(0.4, false, 10)).toBeCloseTo(0, 5)
  })
})
