/**
 * Giro da nave no modo de foco: arrastar começando na nave gira em volta do eixo vertical (e inclina um pouco com o
 * arrasto vertical). Arrastando, o ângulo segue o dedo direto; soltando com o dedo em movimento, continua girando e
 * desacelera (decaimento exponencial exato: o resultado não depende da taxa de quadros); a inclinação volta ao nível
 * por uma mola criticamente amortecida, também em forma fechada. Com movimento reduzido: só o arrasto direto, sem
 * embalo nem mola. Mutável no lugar (o caminho por quadro não aloca). Puro, imports relativos.
 */

export interface Spin {
  /** Giro em volta do eixo vertical da nave (rad), sempre em [−π, π]. */
  yaw: number
  /** Velocidade do giro solto (rad/s). */
  yawVel: number
  /** Inclinação para a frente/trás (rad), em [−MAX_TILT, MAX_TILT]. */
  tilt: number
  tiltVel: number
  dragging: boolean
  /** Velocidade estimada do dedo enquanto arrasta (rad/s) e a hora do último movimento (ms, a do evento). */
  dragVel: number
  lastMoveAt: number
}

/** rad por px de arrasto: meia tela de celular dá uma volta inteira, mais ou menos. */
export const SPIN_PER_PX = 0.012
export const TILT_PER_PX = 0.003
/** Teto da velocidade do giro solto (rad/s) e da inclinação (rad, ~20°). */
export const MAX_SPIN = 14
export const MAX_TILT = 0.35
/** Atrito do giro solto (1/s): de 14 rad/s, para em ~3 s. */
export const SPIN_DAMPING = 1.4
/** Abaixo disso (rad/s) o giro solto para de vez. */
const STOP_SPIN = 0.02
/** Frequência da mola que nivela a inclinação (rad/s, criticamente amortecida). */
export const TILT_OMEGA = 7
/** Ritmo (1/s) com que a nave volta à pose de frente fora do modo. */
export const SETTLE_RATE = 6
/** O dedo parado por mais que isto antes de soltar: sem embalo. */
export const FLING_WINDOW_MS = 80
/** Constante de tempo da média da velocidade do dedo (ms). */
const VELOCITY_SMOOTHING_MS = 40

const TAU = Math.PI * 2
/** Ângulo equivalente em [−π, π]. */
export const wrapAngle = (a: number) => a - TAU * Math.round(a / TAU)
const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v))

export function newSpin(): Spin {
  return { yaw: 0, yawVel: 0, tilt: 0, tiltVel: 0, dragging: false, dragVel: 0, lastMoveAt: 0 }
}

/** O dedo pegou a nave (`time` em ms): o giro solto para na mão. */
export function grabSpin(s: Spin, time: number): Spin {
  s.dragging = true
  s.yawVel = 0
  s.tiltVel = 0
  s.dragVel = 0
  s.lastMoveAt = time
  return s
}

/** Um movimento do dedo (px desde o último, `time` em ms): gira e inclina direto, e estima a velocidade. */
export function dragSpin(s: Spin, dxPx: number, dyPx: number, time: number, reduced: boolean): Spin {
  const turn = dxPx * SPIN_PER_PX
  s.yaw = wrapAngle(s.yaw + turn)
  s.tilt = clamp(s.tilt + dyPx * TILT_PER_PX, MAX_TILT)
  if (!reduced) {
    const ms = Math.max(1, time - s.lastMoveAt)
    const k = 1 - Math.exp(-ms / VELOCITY_SMOOTHING_MS)
    s.dragVel += (clamp((turn * 1000) / ms, MAX_SPIN) - s.dragVel) * k
  }
  s.lastMoveAt = time
  return s
}

/** Soltou (`time` em ms): com o dedo ainda em movimento, o giro continua com a velocidade dele (com teto). */
export function releaseSpin(s: Spin, time: number, reduced: boolean): Spin {
  s.dragging = false
  s.yawVel = reduced || time - s.lastMoveAt > FLING_WINDOW_MS ? 0 : clamp(s.dragVel, MAX_SPIN)
  s.dragVel = 0
  s.tiltVel = 0
  return s
}

/** Avança o giro solto e a mola da inclinação `dt` s (o passo suavizado da nave). Arrastando, quem manda é o dedo. */
export function stepSpin(s: Spin, dt: number, reduced: boolean): Spin {
  if (s.dragging || reduced || dt <= 0) return s
  if (s.yawVel !== 0) {
    const e = Math.exp(-SPIN_DAMPING * dt)
    s.yaw = wrapAngle(s.yaw + (s.yawVel * (1 - e)) / SPIN_DAMPING)
    s.yawVel *= e
    if (Math.abs(s.yawVel) < STOP_SPIN) s.yawVel = 0
  }
  if (s.tilt !== 0 || s.tiltVel !== 0) {
    // x(t) = (x0 + (v0 + ωx0)t)e^(−ωt): exata para qualquer passo
    const w = TILT_OMEGA
    const a = s.tiltVel + w * s.tilt
    const e = Math.exp(-w * dt)
    const x = (s.tilt + a * dt) * e
    const v = (s.tiltVel - w * a * dt) * e
    if (Math.abs(x) < 1e-5 && Math.abs(v) < 1e-4) {
      s.tilt = 0
      s.tiltVel = 0
    } else {
      s.tilt = clamp(x, MAX_TILT)
      s.tiltVel = v
    }
  }
  return s
}

/** Fora do modo: volta à pose de frente pelo caminho mais curto (na hora com movimento reduzido). */
export function settleSpin(s: Spin, dt: number, reduced: boolean): Spin {
  s.dragging = false
  s.yawVel = 0
  s.tiltVel = 0
  s.dragVel = 0
  if (reduced) {
    s.yaw = 0
    s.tilt = 0
    return s
  }
  const k = Math.exp(-SETTLE_RATE * Math.max(0, dt))
  s.yaw = wrapAngle(s.yaw) * k
  s.tilt *= k
  if (Math.abs(s.yaw) < 1e-3) s.yaw = 0
  if (Math.abs(s.tilt) < 1e-3) s.tilt = 0
  return s
}

/** Velocidade do giro agora (rad/s, sem sinal): a do dedo enquanto ele se mexe, a do embalo solto depois. */
export function spinSpeed(s: Spin, time: number): number {
  if (s.dragging) return time - s.lastMoveAt <= FLING_WINDOW_MS ? Math.abs(s.dragVel) : 0
  return Math.abs(s.yawVel)
}
