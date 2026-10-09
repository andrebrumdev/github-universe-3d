export type SunMode = 'idle' | 'hover' | 'click' | 'away'
/** `admiring`: olhando um planeta (ver `gaze.ts`), não vem de um modo. */
export type SunExpression = 'happy' | 'veryHappy' | 'surprised' | 'sad' | 'admiring'

export interface SunState {
  mode: SunMode
  clickLeft: number
  /** Para onde voltar quando o clique terminar. */
  resumeMode: Exclude<SunMode, 'click'>
  awayFor: number
}

export type SunEvent = { type: 'near' } | { type: 'far' } | { type: 'click' } | { type: 'tick'; dt: number }

export const CLICK_DURATION = 0.6
export const AWAY_TO_IDLE = 4
export const INITIAL_SUN_STATE: SunState = { mode: 'idle', clickLeft: 0, resumeMode: 'idle', awayFor: 0 }

export function sunReducer(s: SunState, e: SunEvent): SunState {
  switch (e.type) {
    case 'click':
      return { ...s, mode: 'click', clickLeft: CLICK_DURATION, resumeMode: s.mode === 'click' ? s.resumeMode : s.mode }
    case 'near':
      if (s.mode === 'click') return s.resumeMode === 'hover' ? s : { ...s, resumeMode: 'hover' }
      return s.mode === 'hover' ? s : { ...s, mode: 'hover', awayFor: 0 }
    case 'far':
      if (s.mode === 'click') return s.resumeMode === 'hover' ? { ...s, resumeMode: 'away' } : s
      return s.mode === 'hover' ? { ...s, mode: 'away', awayFor: 0 } : s
    case 'tick': {
      if (s.mode === 'click') {
        const left = s.clickLeft - e.dt
        return left > 0 ? { ...s, clickLeft: left } : { ...s, mode: s.resumeMode, clickLeft: 0, awayFor: 0 }
      }
      if (s.mode === 'away') {
        const awayFor = s.awayFor + e.dt
        return awayFor >= AWAY_TO_IDLE ? { ...s, mode: 'idle', awayFor: 0 } : { ...s, awayFor }
      }
      return s
    }
  }
}

export const SUN_LOOK: Record<SunMode, { expression: SunExpression; glow: number }> = {
  idle: { expression: 'happy', glow: 1 },
  hover: { expression: 'veryHappy', glow: 1.6 },
  click: { expression: 'surprised', glow: 2.4 },
  away: { expression: 'sad', glow: 0.6 },
}

export function nextBlinkDelay(rng: () => number = Math.random): number {
  return 3 + rng() * 2
}
