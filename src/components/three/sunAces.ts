import type { Rgb } from './acesBackground'

/**
 * Inverso do ACES Filmic que o ToneMapping do GlowBloom aplica (postprocessing ACES_FILMIC = `ACESFilmicToneMapping`
 * do three, exposição 1): dado o linear que deve SAIR do ToneMapping, devolve o linear que deve ENTRAR. É o que o sol
 * usa com bloom para sair igual ao `?nobloom` (lá ele é `toneMapped: false`, sem ACES).
 * ACES(x) = saturate(OUT · RRT(IN · x/0,6)); o RRT é uma razão de quadráticas por canal, invertida pela raiz positiva.
 */
type M3 = [Rgb, Rgb, Rgb]

/** As matrizes do three (linhas), as mesmas de `acesBackground.ts`. */
const IN: M3 = [
  [0.59719, 0.35458, 0.04823],
  [0.076, 0.90834, 0.01566],
  [0.0284, 0.13383, 0.83777],
]
const OUT: M3 = [
  [1.60475, -0.53108, -0.07367],
  [-0.10208, 1.10813, -0.00605],
  [-0.00327, -0.07276, 1.07602],
]

function invert(m: M3): M3 {
  const [[a, b, c], [d, e, f], [g, h, i]] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ]
}

const IN_INV = invert(IN)
const OUT_INV = invert(OUT)
const mul = (m: M3, v: Rgb): Rgb => [0, 1, 2].map((r) => m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2]) as Rgb
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** x com RRT(x) = v: (1 − 0,983729v)x² + (0,0245786 − 0,432951v)x − (0,000090537 + 0,238081v) = 0. */
function rrtInverse(v: number): number {
  const a = 1 - 0.983729 * v
  const b = 0.0245786 - 0.432951 * v
  const k = -(0.000090537 + 0.238081 * v)
  return (-b + Math.sqrt(b * b - 4 * a * k)) / (2 * a)
}

/** Linear de entrada que o ACES Filmic leva a `c`. Perto de 1 trava (v ≤ 1): o branco puro dá uma entrada finita. */
export function acesFilmicInverse(c: Rgb): Rgb {
  const v = mul(OUT_INV, c).map((x) => clamp(x, 0, 1)) as Rgb
  return mul(IN_INV, v.map(rrtInverse) as Rgb).map((x) => Math.max(0, x) * 0.6) as Rgb
}

const f = (n: number) => n.toFixed(6)
/** mat3 do GLSL é por colunas. */
const glslMat = (m: M3) => `mat3( ${[0, 1, 2].map((col) => `vec3( ${f(m[0][col])}, ${f(m[1][col])}, ${f(m[2][col])} )`).join(', ')} )`

export const ACES_INVERSE_GLSL = /* glsl */ `vec3 sunAcesInverse( vec3 c ) {
	vec3 v = clamp( ${glslMat(OUT_INV)} * c, 0.0, 1.0 );
	vec3 a = 1.0 - 0.983729 * v;
	vec3 b = 0.0245786 - 0.432951 * v;
	vec3 k = -( 0.000090537 + 0.238081 * v );
	vec3 x = ( -b + sqrt( b * b - 4.0 * a * k ) ) / ( 2.0 * a );
	return max( ${glslMat(IN_INV)} * x, 0.0 ) * 0.6;
}`
