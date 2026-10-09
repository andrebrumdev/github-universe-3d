import { mulberry32 } from './random'

export interface ParallaxStars {
  count: number
  /** xyz por estrela. */
  positions: Float32Array
  /** Diâmetro em unidades de mundo (o ponto é atenuado pela distância). */
  sizes: Float32Array
  /** rgb por estrela, já escurecido para ficar abaixo do limiar do bloom. */
  colors: Float32Array
}

export interface ParallaxStarsOptions {
  count: number
  seed: number
  /** Raio interno da casca (fora do alcance do sistema). */
  innerRadius: number
  /** Raio externo da casca (dentro do céu preso à câmera). */
  outerRadius: number
}

/** Tons branco / azulado / creme, a ~55% de brilho: bem abaixo do limiar 0,8 do bloom. */
const TINTS: [number, number, number][] = [
  [0.55, 0.55, 0.55],
  [0.42, 0.48, 0.58],
  [0.5, 0.52, 0.6],
  [0.56, 0.53, 0.47],
]
/** Tamanho angular (rad) de cada estrela, vezes o raio médio da casca. */
const ANGULAR_MIN = 0.003
const ANGULAR_MAX = 0.008

/** Estrelas fixas no mundo, uniformes em volume numa casca esférica [innerRadius, outerRadius]. Determinístico. */
export function generateParallaxStars({ count, seed, innerRadius, outerRadius }: ParallaxStarsOptions): ParallaxStars {
  const rand = mulberry32(seed)
  const positions = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const colors = new Float32Array(count * 3)
  const i3 = innerRadius ** 3
  const o3 = outerRadius ** 3
  const mean = (innerRadius + outerRadius) / 2
  for (let i = 0; i < count; i++) {
    const r = Math.cbrt(i3 + rand() * (o3 - i3))
    const cosT = 2 * rand() - 1
    const sinT = Math.sqrt(1 - cosT * cosT)
    const phi = 2 * Math.PI * rand()
    positions[i * 3] = r * sinT * Math.cos(phi)
    positions[i * 3 + 1] = r * cosT
    positions[i * 3 + 2] = r * sinT * Math.sin(phi)
    sizes[i] = mean * (ANGULAR_MIN + rand() * (ANGULAR_MAX - ANGULAR_MIN))
    const tint = TINTS[Math.floor(rand() * TINTS.length)]
    const k = 0.75 + rand() * 0.25
    colors[i * 3] = tint[0] * k
    colors[i * 3 + 1] = tint[1] * k
    colors[i * 3 + 2] = tint[2] * k
  }
  return { count, positions, sizes, colors }
}
