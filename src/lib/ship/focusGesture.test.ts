import { describe, expect, it } from 'vitest'
import {
  DOUBLE_TAP_MS,
  dragOwner,
  gestureAfterMove,
  gestureOnRelease,
  isDoubleTap,
  pickPart,
  TAP_MAX_MS,
  tapSlop,
} from './focusGesture'

describe('de quem é o arrasto (nave ou câmera)', () => {
  it('no modo de foco, começando na nave, gira a nave; no vazio, orbita a câmera', () => {
    expect(dragOwner(true, true)).toBe('ship')
    expect(dragOwner(true, false)).toBe('camera')
  })

  it('fora do modo, a nave nunca segura o arrasto (a câmera orbita como sempre)', () => {
    expect(dragOwner(false, true)).toBe('camera')
    expect(dragOwner(false, false)).toBe('camera')
  })
})

describe('toque ou arrasto', () => {
  it('andou mais que a folga: vira arrasto; dentro dela, ainda indeciso', () => {
    expect(gestureAfterMove(tapSlop(false) + 1, false)).toBe('drag')
    expect(gestureAfterMove(tapSlop(false) - 1, false)).toBe('pending')
  })

  it('no toque o dedo treme mais: a folga é maior', () => {
    expect(tapSlop(true)).toBeGreaterThan(tapSlop(false))
    expect(gestureAfterMove(tapSlop(false) + 1, true)).toBe('pending')
  })

  it('soltou rápido e sem andar: toque; segurou demais ou arrastou: nada a tocar', () => {
    expect(gestureOnRelease('pending', 2, TAP_MAX_MS - 1, false)).toBe('tap')
    expect(gestureOnRelease('pending', 2, TAP_MAX_MS + 1, false)).toBe('none')
    expect(gestureOnRelease('drag', 0, 50, false)).toBe('none')
    expect(gestureOnRelease('pending', tapSlop(false) + 1, 50, false)).toBe('none')
  })

  it('dois toques perto, em pouco tempo: toque duplo', () => {
    const first = { time: 1000, x: 100, y: 100 }
    expect(isDoubleTap(null, first)).toBe(false)
    expect(isDoubleTap(first, { time: 1000 + DOUBLE_TAP_MS - 1, x: 108, y: 96 })).toBe(true)
    expect(isDoubleTap(first, { time: 1000 + DOUBLE_TAP_MS + 1, x: 100, y: 100 })).toBe(false)
    expect(isDoubleTap(first, { time: 1100, x: 200, y: 100 })).toBe(false)
  })
})

describe('qual peça foi tocada', () => {
  it('a primeira peça na linha do toque, atravessando o vidro da cúpula', () => {
    expect(pickPart(['glass', 'head', 'hull'])).toBe('head')
    expect(pickPart(['glass', 'clawd', 'head'])).toBe('clawd')
    expect(pickPart(['tentacle:2', 'hull'])).toBe('tentacle:2')
  })

  it('o casco tapa o que está atrás dele; sem peça marcada, conta como casco', () => {
    expect(pickPart(['hull', 'tentacle:3'])).toBe('hull')
    expect(pickPart([null, 'glass'])).toBe('hull')
    expect(pickPart(['nozzle'])).toBe('nozzle')
  })
})
