import type { ClockState } from '@/lib/universe/clock'

/**
 * Mutável de propósito: lido e escrito a cada frame, fora do React. `turn` é a virada do sentido do modo disco
 * (ver `clockDirection`): com ele, o tempo pode andar para trás.
 */
export const simClock: Required<ClockState> = { time: 0, scale: 1, turn: 0 }
