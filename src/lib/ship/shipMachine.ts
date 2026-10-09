import type { ShipTarget } from './escort'
import type { TravelPath } from './travel'

/** `focus`: estacionada no mundo para o usuário girar e brincar (modo de foco, ver focus.ts). */
export type ShipMode = 'entering' | 'escort' | 'traveling' | 'visiting' | 'returning' | 'focus'

export interface ShipState {
  mode: ShipMode
  elapsed: number
  path: TravelPath | null
  target: ShipTarget | null
  /** Duração da volta em curso (s); sem ela, RETURN_DURATION. */
  returnDuration?: number
}

export type ShipEvent =
  | { type: 'tick'; dt: number }
  | { type: 'travel'; path: TravelPath; target: ShipTarget }
  /** Chegada instantânea (movimento reduzido). */
  | { type: 'arrive'; target: ShipTarget }
  /** Volta para a escolta; `duration` é a da volta planejada (ver returnFlight). */
  | { type: 'release'; duration?: number }
  /** Estaciona para o modo de foco (só parada: da escolta ou da visita). */
  | { type: 'focus' }

export const ENTER_DURATION = 2
export const RETURN_DURATION = 1.2
export const INITIAL_SHIP: ShipState = { mode: 'entering', elapsed: 0, path: null, target: null }

export function shipReducer(s: ShipState, e: ShipEvent): ShipState {
  switch (e.type) {
    case 'travel':
      return { mode: 'traveling', elapsed: 0, path: e.path, target: e.target }
    case 'arrive':
      return { mode: 'visiting', elapsed: 0, path: null, target: e.target }
    case 'focus':
      return s.mode === 'escort' || s.mode === 'visiting' ? { mode: 'focus', elapsed: 0, path: null, target: null } : s
    case 'release':
      return s.mode === 'traveling' || s.mode === 'visiting' || s.mode === 'focus'
        ? { mode: 'returning', elapsed: 0, path: null, target: null, returnDuration: e.duration ?? RETURN_DURATION }
        : s
    case 'tick': {
      const elapsed = s.elapsed + e.dt
      if (s.mode === 'entering' && elapsed >= ENTER_DURATION) return { ...s, mode: 'escort', elapsed: 0 }
      if (s.mode === 'traveling' && s.path && elapsed >= s.path.duration) return { ...s, mode: 'visiting', elapsed: 0, path: null }
      if (s.mode === 'returning' && elapsed >= (s.returnDuration ?? RETURN_DURATION)) return { ...s, mode: 'escort', elapsed: 0 }
      return { ...s, elapsed }
    }
  }
}
