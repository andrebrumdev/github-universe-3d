/**
 * Girar o sol arrastando (e ele fica tonto se girar demais). Tudo puro: o Sun lê o ponteiro e o relógio e chama isto.
 * - Arrasto: o gesto é o arrasto compartilhado com a nave (lib/pointerDrag, com a trava da câmera com dono): passou da
 *   folga → gira o sol; um toque rápido → clique (seleciona o perfil); começou fora do sol → a câmera gira como sempre.
 * - Giro: arrastando, o ângulo segue o mouse; solto, continua com inércia e freia sozinho (exponencial exata: igual
 *   em qualquer taxa de quadros). Movimento reduzido: o arrasto gira direto, sem inércia.
 * - Tontura: acumula |velocidade| ao longo do tempo e vaza de volta a zero (como a da nave); passou de ~3,5 voltas
 *   rápidas, fica tonto por ~3 s. Movimento reduzido: nunca.
 */

/** Radianos de giro por px arrastado na horizontal (meia tela ≈ uma volta). */
export const SPIN_PER_PX = 0.012
/** Freio do giro solto (1/s): a velocidade cai pela metade em ~0,4 s. */
export const SPIN_DAMPING = 1.6
/** Velocidade máxima do giro (rad/s). */
export const MAX_SPIN = 40
/** Voltas rápidas acumuladas para ficar tonto. */
export const DIZZY_TURNS = 3.5
/** Vazamento do acumulado (rad/s): girar mais devagar que isto nunca deixa tonto. */
export const DIZZY_LEAK = 2
/** Quanto tempo fica tonto (s). */
export const DIZZY_SECONDS = 3

export interface Spin {
  /** Ângulo acumulado em volta do eixo vertical (rad). */
  angle: number
  /** Velocidade (rad/s). */
  velocity: number
}

export function newSpin(): Spin {
  return { angle: 0, velocity: 0 }
}

const clamp = (v: number, m: number) => Math.min(m, Math.max(-m, v))

/** Arrastando: o ângulo segue o ponteiro (`dxPx` neste quadro) e a velocidade é medida dele (suavizada). */
export function dragSpin(s: Spin, dxPx: number, dt: number, reduced: boolean): Spin {
  const step = dxPx * SPIN_PER_PX
  if (reduced || dt <= 0) return { angle: s.angle + step, velocity: reduced ? 0 : s.velocity }
  const measured = clamp(step / dt, MAX_SPIN)
  const k = 1 - Math.exp(-dt / 0.05)
  return { angle: s.angle + step, velocity: s.velocity + (measured - s.velocity) * k }
}

/** Soltou o sol: com inércia segue a velocidade medida; com movimento reduzido para na hora. */
export function releaseSpin(s: Spin, reduced: boolean): Spin {
  return reduced ? { angle: s.angle, velocity: 0 } : s
}

/** Solto: gira e freia (integral exata da queda exponencial: igual em qualquer passo). */
export function stepSpin(s: Spin, dt: number, reduced: boolean): Spin {
  if (reduced) return { angle: s.angle, velocity: 0 }
  const e = Math.exp(-SPIN_DAMPING * dt)
  return { angle: s.angle + (s.velocity * (1 - e)) / SPIN_DAMPING, velocity: s.velocity * e }
}

/** Girando rápido o sol achata um pouco (alvo extra de stretch, ≤ 0, até −0,08). */
export function spinFlatten(velocity: number): number {
  const f = Math.min(0.08, 0.004 * Math.abs(velocity))
  return f === 0 ? 0 : -f
}

export interface Dizziness {
  /** Giro acumulado (rad), já descontado o vazamento. */
  level: number
  /** Tempo de tontura que falta (s); > 0 = tonto. */
  dizzyLeft: number
}

export function newDizziness(): Dizziness {
  return { level: 0, dizzyLeft: 0 }
}

/** Acumula |velocidade|, vaza `DIZZY_LEAK`; passou de `DIZZY_TURNS` voltas, fica tonto `DIZZY_SECONDS` s (sem acumular). */
export function stepDizziness(d: Dizziness, velocity: number, dt: number, reduced: boolean): Dizziness {
  if (reduced) return { level: 0, dizzyLeft: 0 }
  const dizzyLeft = Math.max(0, d.dizzyLeft - dt)
  // tonto, não acumula: quando passa, começa do zero (não dispara de novo na hora)
  if (d.dizzyLeft > 0) return { level: 0, dizzyLeft }
  const level = Math.max(0, d.level + (Math.abs(velocity) - DIZZY_LEAK) * dt)
  if (dizzyLeft === 0 && level >= DIZZY_TURNS * 2 * Math.PI) return { level: 0, dizzyLeft: DIZZY_SECONDS }
  return { level, dizzyLeft }
}
