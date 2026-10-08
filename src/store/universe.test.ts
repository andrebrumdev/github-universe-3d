import { beforeEach, describe, expect, it } from 'vitest'
import { useUniverse } from './universe'

const s = () => useUniverse.getState()

beforeEach(() => useUniverse.setState(useUniverse.getInitialState(), true))

describe('store do universo', () => {
  it('selecionar o sol mostra a fala do perfil', () => {
    s().select({ kind: 'profile' })
    expect(s().selection).toEqual({ kind: 'profile' })
    expect(s().bubble?.line.id).toBe('sun')
  })

  it('primeiro planeta: firstZoom; depois: planet; firstZoom não repete', () => {
    s().select({ kind: 'planet', name: 'a' })
    expect(s().bubble?.line.id).toBe('firstZoom')
    s().select({ kind: 'planet', name: 'b' })
    expect(s().bubble?.line.id).toBe('planet')
    s().emitGuide('firstZoom')
    expect(s().bubble?.line.id).toBe('planet')
  })

  it('selecionar limpa o hover e clearSelection volta ao nada', () => {
    s().setHoveredCell({ planet: 'a', week: 1, day: 2, count: 3, date: '2026-01-01', x: 0, y: 0 })
    s().select({ kind: 'planet', name: 'a' })
    expect(s().hoveredCell).toBeNull()
    s().clearSelection()
    expect(s().selection).toEqual({ kind: 'none' })
  })

  it('dismissBubble só fecha o balão daquela sequência', () => {
    s().emitGuide('idle')
    const seq = s().bubble!.seq
    s().emitGuide('planet')
    s().dismissBubble(seq)
    expect(s().bubble?.line.id).toBe('planet')
    s().dismissBubble(s().bubble!.seq)
    expect(s().bubble).toBeNull()
  })
})
