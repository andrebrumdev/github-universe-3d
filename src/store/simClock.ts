import type { ClockState } from '@/lib/universe/clock'

/** Mutável de propósito: lido e escrito a cada frame, fora do React. */
export const simClock: ClockState = { time: 0, scale: 1 }
