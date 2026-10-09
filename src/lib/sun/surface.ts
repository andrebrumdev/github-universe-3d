/**
 * Superfície viva do sol (constantes e funções puras que o shader repete em GLSL).
 * O rosto fica no +z do espaço do objeto (a mola gira a malha inteira), então "longe do rosto" é o ângulo até +z.
 */

/** Balanço de desenho animado: deslocamento máximo ao longo da normal, em fração do raio (bem suave, sem fervura). */
export const SURFACE_AMPLITUDE = 0.007
/** Até este ângulo do centro do rosto a superfície não balança (olhos, sobrancelhas e boca ficam a ≤ ~36°). */
export const FACE_CALM_INNER = (40 * Math.PI) / 180
/** Daqui até o limbo e atrás, balanço inteiro. */
export const FACE_CALM_OUTER = (85 * Math.PI) / 180

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Peso do balanço pelo ângulo até a direção do rosto: 0 no rosto, 1 no limbo, rampa suave. */
export function faceCalmWeight(angle: number): number {
  return smoothstep(FACE_CALM_INNER, FACE_CALM_OUTER, angle)
}

/**
 * Sombra do globo de LED, como nas fotos do Sphere: ouro no miolo (um pouco acima do centro), âmbar para a borda e mais
 * fundo na metade de baixo. Entra a normal no espaço da vista (x para a direita, y para cima); 0 = miolo, 1 = âmbar fundo.
 * O shader repete a mesma conta.
 */
export const SHADE_CORE_Y = 0.22
export const SHADE_START = 0.45
export const SHADE_END = 1.15
/** Quanto a metade de baixo afunda a mais (por unidade de −y). */
export const SHADE_LOW = 0.2

export function sunShade(nx: number, ny: number): number {
  const d = Math.hypot(nx, ny - SHADE_CORE_Y)
  return clamp01(smoothstep(SHADE_START, SHADE_END, d) + SHADE_LOW * Math.max(0, -ny))
}
