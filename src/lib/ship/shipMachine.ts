import type { ShipTarget } from './escort'
import type { TravelPath } from './travel'

export type ShipMode = 'entering' | 'escort' | 'traveling' | 'visiting' | 'returning'

export interface ShipState {
  mode: ShipMode
  elapsed: number
  path: TravelPath | null
  target: ShipTarget | null
}

export type ShipEvent =
  | { type: 'tick'; dt: number }
  | { type: 'travel'; path: TravelPath; target: ShipTarget }
  /** Chegada instantânea (movimento reduzido). */
  | { type: 'arrive'; target: ShipTarget }
  | { type: 'release' }

export const ENTER_DURATION = 2
export const RETURN_DURATION = 1.2
export const INITIAL_SHIP: ShipState = { mode: 'entering', elapsed: 0, path: null, target: null }

export function shipReducer(s: ShipState, e: ShipEvent): ShipState {
  switch (e.type) {
    case 'travel':
      return { mode: 'traveling', elapsed: 0, path: e.path, target: e.target }
    case 'arrive':
      return { mode: 'visiting', elapsed: 0, path: null, target: e.target }
    case 'release':
      return s.mode === 'traveling' || s.mode === 'visiting' ? { mode: 'returning', elapsed: 0, path: null, target: null } : s
    case 'tick': {
      const elapsed = s.elapsed + e.dt
      if (s.mode === 'entering' && elapsed >= ENTER_DURATION) return { ...s, mode: 'escort', elapsed: 0 }
      if (s.mode === 'traveling' && s.path && elapsed >= s.path.duration) return { ...s, mode: 'visiting', elapsed: 0, path: null }
      if (s.mode === 'returning' && elapsed >= RETURN_DURATION) return { ...s, mode: 'escort', elapsed: 0 }
      return { ...s, elapsed }
    }
  }
}
