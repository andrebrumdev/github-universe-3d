import { describe, expect, it } from 'vitest'
import { ENTER_DURATION, INITIAL_SHIP, RETURN_DURATION, shipReducer, type ShipEvent, type ShipState } from './shipMachine'
import { planTravel } from './travel'

const apply = (s: ShipState, ...events: ShipEvent[]) => events.reduce(shipReducer, s)
const path = planTravel([10, 0, 0], [-10, 0, 5])
const sun = { kind: 'sun' } as const

describe('shipReducer', () => {
  it('entrada vira escolta depois de ENTER_DURATION', () => {
    expect(apply(INITIAL_SHIP, { type: 'tick', dt: ENTER_DURATION - 0.1 }).mode).toBe('entering')
    expect(apply(INITIAL_SHIP, { type: 'tick', dt: ENTER_DURATION }).mode).toBe('escort')
  })

  it('viagem termina em visita no tempo do trajeto', () => {
    const traveling = apply(INITIAL_SHIP, { type: 'travel', path, target: sun })
    expect(traveling).toMatchObject({ mode: 'traveling', elapsed: 0, target: sun })
    expect(apply(traveling, { type: 'tick', dt: path.duration / 2 }).mode).toBe('traveling')
    expect(apply(traveling, { type: 'tick', dt: path.duration }).mode).toBe('visiting')
  })

  it('soltar volta para a escolta', () => {
    const visiting = apply(INITIAL_SHIP, { type: 'arrive', target: sun })
    const returning = apply(visiting, { type: 'release' })
    expect(returning).toMatchObject({ mode: 'returning', target: null })
    expect(apply(returning, { type: 'tick', dt: RETURN_DURATION }).mode).toBe('escort')
  })

  it('soltar na escolta não muda nada', () => {
    const escort = apply(INITIAL_SHIP, { type: 'tick', dt: ENTER_DURATION })
    expect(shipReducer(escort, { type: 'release' })).toBe(escort)
  })

  it('nova viagem durante uma viagem recomeça do zero', () => {
    const first = apply(INITIAL_SHIP, { type: 'travel', path, target: sun }, { type: 'tick', dt: 0.5 })
    expect(apply(first, { type: 'travel', path, target: { kind: 'planet', name: 'a' } })).toMatchObject({
      mode: 'traveling',
      elapsed: 0,
      target: { kind: 'planet', name: 'a' },
    })
  })
})
