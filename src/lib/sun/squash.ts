import type { SunMode } from './sunMachine'

/**
 * Squash & stretch do sol: duas molas 1D com o mesmo Euler semi-implícito do `faceSpring`.
 * `puff` incha por igual; `stretch` estica (> 0) ou achata (< 0) na vertical preservando o volume.
 */
export interface Squash {
  puff: number
  vPuff: number
  stretch: number
  vStretch: number
}

/** ζ = 8 / (2·√140) ≈ 0,34: mola com balanço (achata, passa do ponto, assenta em ~1,5 s). */
const STIFFNESS = 140
const DAMPING = 8
const SUBSTEP = 1 / 240
const MAX_DT = 0.25
const MAX_SPEED = 6
/** Nem o puff nem o stretch passam de ±25%. */
export const MAX_SQUASH = 0.25

export const SQUASH_AT_REST: Squash = { puff: 0, vPuff: 0, stretch: 0, vStretch: 0 }

/** Onde cada modo descansa: hover um pouco maior; away murcho (mais baixo e largo). */
export const SQUASH_TARGET: Record<SunMode, { puff: number; stretch: number }> = {
  idle: { puff: 0, stretch: 0 },
  hover: { puff: 0.03, stretch: 0 },
  click: { puff: 0, stretch: 0 },
  away: { puff: -0.015, stretch: -0.05 },
}

/** Empurrão ao entrar no modo: hover dá o "puff"; o clique achata primeiro (velocidade para baixo). */
const KICK: Record<SunMode, { vPuff: number; vStretch: number }> = {
  idle: { vPuff: 0, vStretch: 0 },
  hover: { vPuff: 0.9, vStretch: 0 },
  click: { vPuff: 0, vStretch: -2.2 },
  away: { vPuff: 0, vStretch: 0 },
}

const clamp = (v: number, m: number) => Math.min(m, Math.max(-m, v))

export function kickSquash(s: Squash, mode: SunMode): Squash {
  const k = KICK[mode]
  return { ...s, vPuff: clamp(s.vPuff + k.vPuff, MAX_SPEED), vStretch: clamp(s.vStretch + k.vStretch, MAX_SPEED) }
}

export function stepSquash(s: Squash, target: { puff: number; stretch: number }, dt: number): Squash {
  let { puff, vPuff, stretch, vStretch } = s
  let remaining = Math.min(Math.max(dt, 0), MAX_DT)
  while (remaining > 1e-9) {
    const h = Math.min(remaining, SUBSTEP)
    vPuff = clamp(vPuff + (STIFFNESS * (target.puff - puff) - DAMPING * vPuff) * h, MAX_SPEED)
    vStretch = clamp(vStretch + (STIFFNESS * (target.stretch - stretch) - DAMPING * vStretch) * h, MAX_SPEED)
    puff = clamp(puff + vPuff * h, MAX_SQUASH)
    stretch = clamp(stretch + vStretch * h, MAX_SQUASH)
    remaining -= h
  }
  return { puff, vPuff, stretch, vStretch }
}

/** Escala [x, y, z]: y = (1 + puff)(1 + stretch), x = z = (1 + puff)/√(1 + stretch); volume = (1 + puff)³. */
export function squashScale(s: Squash, out: [number, number, number] = [1, 1, 1]): [number, number, number] {
  const size = 1 + s.puff
  const side = size / Math.sqrt(1 + s.stretch)
  out[0] = side
  out[1] = size * (1 + s.stretch)
  out[2] = side
  return out
}
