import { describe, expect, it } from 'vitest'
import {
  FOCUS_DISTANCE,
  FOCUS_MAX_DISTANCE,
  FOCUS_MIN_DISTANCE,
  focusAllowed,
  focusFront,
  focusParking,
  focusPose,
  PARK_MAX_DISTANCE,
  PARK_MIN_DISTANCE,
  shipClick,
  type FocusContext,
} from './focus'
import { SHIP_WORLD_WIDTH } from './escort'
import { ENTER_DURATION, INITIAL_SHIP, shipReducer, type ShipEvent, type ShipState } from './shipMachine'
import { planTransfer } from './transfer'
import type { Vec3 } from '../universe/orbits'

const calm: FocusContext = { focused: false, shipMode: 'escort', tutorial: null, presenting: false, crashActive: false }
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])

describe('clique na nave (máquina do modo de foco)', () => {
  it('na escolta e na visita, o clique entra no modo', () => {
    expect(shipClick(calm)).toBe('enter')
    expect(shipClick({ ...calm, shipMode: 'visiting' })).toBe('enter')
  })

  it('já no modo, o clique é brincadeira (não entra de novo)', () => {
    expect(shipClick({ ...calm, focused: true, shipMode: 'focus' })).toBe('play')
  })

  it('em voo, entrando ou voltando, não faz nada', () => {
    for (const shipMode of ['entering', 'traveling', 'returning'] as const) expect(shipClick({ ...calm, shipMode })).toBe('none')
  })

  it('no tutorial guiado e na apresentação, não faz nada', () => {
    for (const tutorial of ['welcome', 'repos', 'tech'] as const) expect(shipClick({ ...calm, tutorial })).toBe('none')
    expect(shipClick({ ...calm, presenting: true })).toBe('none')
  })

  it('no último passo do tutorial (livre) entra, como qualquer seleção', () => {
    expect(shipClick({ ...calm, tutorial: 'free' })).toBe('enter')
  })

  it('com a trombada em curso, o clique só a cancela (como antes)', () => {
    expect(shipClick({ ...calm, crashActive: true })).toBe('cancelCrash')
    expect(shipClick({ ...calm, crashActive: true, shipMode: 'returning' })).toBe('cancelCrash')
    expect(focusAllowed({ ...calm, crashActive: true })).toBe(false)
  })
})

describe('shipReducer com o modo de foco', () => {
  const apply = (s: ShipState, ...events: ShipEvent[]) => events.reduce(shipReducer, s)
  const escort = apply(INITIAL_SHIP, { type: 'tick', dt: ENTER_DURATION })
  const sun = { kind: 'sun' } as const

  it('entra pela escolta e pela visita, e fica (o tempo não tira dele)', () => {
    const focus = apply(escort, { type: 'focus' })
    expect(focus).toMatchObject({ mode: 'focus', target: null, path: null })
    expect(apply(focus, { type: 'tick', dt: 60 }).mode).toBe('focus')
    expect(apply(INITIAL_SHIP, { type: 'arrive', target: sun }, { type: 'focus' }).mode).toBe('focus')
  })

  it('não entra no meio de um voo nem da entrada', () => {
    expect(apply(INITIAL_SHIP, { type: 'focus' }).mode).toBe('entering')
    const traveling = apply(escort, { type: 'travel', path: planTransfer([10, 0, 0], [-10, 0, 5]), target: sun })
    expect(apply(traveling, { type: 'focus' }).mode).toBe('traveling')
  })

  it('sair volta para a escolta pelo voo de volta; escolher um alvo viaja', () => {
    const focus = apply(escort, { type: 'focus' })
    expect(apply(focus, { type: 'release', duration: 1.5 })).toMatchObject({ mode: 'returning', returnDuration: 1.5 })
    expect(apply(focus, { type: 'travel', path: planTransfer([10, 0, 0], [-10, 0, 5]), target: sun }).mode).toBe('traveling')
  })
})

describe('onde a nave estaciona (focusParking)', () => {
  const eye: Vec3 = [3, 20, 50]
  const forward: Vec3 = [0, -0.6, -0.8]

  it('fica na frente da câmera, no eixo da visão, a meio caminho do que ela olha', () => {
    const p = focusParking(eye, forward, 16)
    const d = sub(p, eye)
    expect(dot(d, forward)).toBeCloseTo(len(d), 6)
    expect(len(d)).toBeCloseTo(8, 6)
  })

  it('longe do alvo (visão geral), não passa do teto; perto, não chega mais que o piso', () => {
    expect(len(sub(focusParking(eye, forward, 500), eye))).toBeCloseTo(PARK_MAX_DISTANCE, 6)
    expect(len(sub(focusParking(eye, forward, 1), eye))).toBeCloseTo(PARK_MIN_DISTANCE, 6)
  })

  it('nunca dentro do plano próximo, nem com a nave inteira (meia envergadura) em volta', () => {
    for (const target of [0, 0.01, 1, 10, 1e6]) {
      const p = focusParking(eye, forward, target, 0.1)
      expect(dot(sub(p, eye), forward)).toBeGreaterThan(0.1 + SHIP_WORLD_WIDTH / 2)
    }
  })

  it('um "para a frente" não unitário vale o mesmo', () => {
    const a = focusParking(eye, forward, 16)
    const b = focusParking(eye, [0, -6, -8], 16)
    for (let k = 0; k < 3; k++) expect(b[k]).toBeCloseTo(a[k], 6)
  })
})

describe('enquadramento de três-quartos (focusPose)', () => {
  const center: Vec3 = [5, 1, -2]
  const front = focusFront(center, [5, 4, 10])

  it('a frente da nave aponta para a câmera de onde ela veio, no plano', () => {
    expect(front[1]).toBe(0)
    expect(front[2]).toBeCloseTo(1, 6)
  })

  it('olha para a nave, de frente e um pouco de lado e de cima, na distância padrão', () => {
    const pose = focusPose(center, front, { aspect: 16 / 9, fov: 50 })
    expect(pose.target).toEqual(center)
    const offset = sub(pose.position, center)
    expect(len(offset)).toBeCloseTo(FOCUS_DISTANCE, 6)
    expect(dot(offset, front)).toBeGreaterThan(0.6 * FOCUS_DISTANCE)
    expect(Math.abs(offset[0])).toBeGreaterThan(0.2 * FOCUS_DISTANCE)
    expect(offset[1]).toBeGreaterThan(0)
  })

  it('numa tela em pé, se afasta para a envergadura caber, sem passar do limite do zoom', () => {
    const wide = len(sub(focusPose(center, front, { aspect: 16 / 9, fov: 50 }).position, center))
    const tall = len(sub(focusPose(center, front, { aspect: 375 / 667, fov: 50 }).position, center))
    expect(tall).toBeGreaterThan(wide)
    expect(tall).toBeLessThanOrEqual(FOCUS_MAX_DISTANCE)
    expect(FOCUS_MIN_DISTANCE).toBeLessThan(FOCUS_DISTANCE)
  })
})
