import { describe, expect, it } from 'vitest'
import { classifyGesture, isTypingTarget, KONAMI_KEYS, KONAMI_TOUCH, keyToken, matchStep, SWIPE_MIN, TAP_MAX_MOVE } from './konami'

/** Passa uma lista de entradas pelo casador e devolve quantas vezes ele disparou. */
function feed(sequence: readonly string[], inputs: string[]): { fired: number; index: number } {
  let index = 0
  let fired = 0
  for (const input of inputs) {
    const r = matchStep(sequence, index, input)
    index = r.index
    if (r.fired) fired++
  }
  return { fired, index }
}

const KEYS = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
const tokens = (keys: string[]) => keys.map(keyToken).filter((k): k is string => k !== null)

describe('Konami Code: casador de sequência', () => {
  it('↑ ↑ ↓ ↓ ← → ← → B A dispara uma vez e recomeça', () => {
    expect(feed(KONAMI_KEYS, tokens(KEYS))).toEqual({ fired: 1, index: 0 })
    expect(feed(KONAMI_KEYS, tokens([...KEYS, ...KEYS])).fired).toBe(2)
  })

  it('B e A sem diferença de maiúscula (Shift sozinho não conta)', () => {
    expect(feed(KONAMI_KEYS, tokens([...KEYS.slice(0, 8), 'Shift', 'B', 'Shift', 'A'])).fired).toBe(1)
  })

  it('tecla errada recomeça do zero', () => {
    expect(feed(KONAMI_KEYS, tokens(['ArrowUp', 'ArrowUp', 'ArrowDown', 'x', ...KEYS.slice(3)])).fired).toBe(0)
    expect(feed(KONAMI_KEYS, tokens(['ArrowUp', 'ArrowUp', 'ArrowDown', 'x'])).index).toBe(0)
  })

  it('tecla errada que começa a sequência vale como começo (↑ ↑ ↑ ↓ ↓ … ainda dispara)', () => {
    expect(feed(KONAMI_KEYS, tokens(['ArrowUp', ...KEYS])).fired).toBe(1)
    expect(feed(KONAMI_KEYS, tokens(['ArrowUp', 'ArrowDown', ...KEYS])).fired).toBe(1)
  })

  it('a sequência de toque: ↑ ↑ ↓ ↓ ← → ← → e dois toques', () => {
    expect(KONAMI_TOUCH).toEqual(['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'tap', 'tap'])
    expect(feed(KONAMI_TOUCH, [...KONAMI_TOUCH]).fired).toBe(1)
    expect(feed(KONAMI_TOUCH, ['up', 'up', 'down', 'tap', ...KONAMI_TOUCH.slice(3)]).fired).toBe(0)
  })
})

describe('keyToken', () => {
  it('normaliza para minúsculas e ignora modificadoras', () => {
    expect(keyToken('ArrowUp')).toBe('arrowup')
    expect(keyToken('B')).toBe('b')
    for (const k of ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']) expect(keyToken(k)).toBeNull()
  })
})

describe('isTypingTarget', () => {
  it('campos de texto e conteúdo editável não contam (quem digita não liga o disco)', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('o resto conta', () => {
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget({ tagName: 'BODY' })).toBe(false)
    expect(isTypingTarget({ tagName: 'CANVAS' })).toBe(false)
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false)
    // caixas de marcar não são digitação
    expect(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false)
  })
})

describe('classifyGesture (celular)', () => {
  it('deslize rápido vira direção (y da tela para baixo)', () => {
    expect(classifyGesture(0, -SWIPE_MIN - 5, 200)).toBe('up')
    expect(classifyGesture(0, SWIPE_MIN + 5, 200)).toBe('down')
    expect(classifyGesture(-SWIPE_MIN - 5, 4, 200)).toBe('left')
    expect(classifyGesture(SWIPE_MIN + 5, -4, 200)).toBe('right')
  })

  it('toque curto e parado é toque', () => {
    expect(classifyGesture(2, 3, 120)).toBe('tap')
    expect(classifyGesture(TAP_MAX_MOVE + 1, 0, 120)).toBeNull()
  })

  it('arrasto lento, diagonal ou curto demais não conta', () => {
    expect(classifyGesture(0, -200, 2000)).toBeNull()
    expect(classifyGesture(80, -80, 200)).toBeNull()
    expect(classifyGesture(0, -20, 200)).toBeNull()
    expect(classifyGesture(1, 1, 900)).toBeNull()
  })
})
