export type Rgb = [number, number, number]

/** sRGB (0–255 por canal, como no hex) → linear. */
export function hexToLinear(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16)
  const c = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return [c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255)]
}

const IN = [
  [0.59719, 0.35458, 0.04823],
  [0.076, 0.90834, 0.01566],
  [0.0284, 0.13383, 0.83777],
]
const OUT = [
  [1.60475, -0.53108, -0.07367],
  [-0.10208, 1.10813, -0.00605],
  [-0.00327, -0.07276, 1.07602],
]
const mul = (m: number[][], v: Rgb): Rgb => [0, 1, 2].map((i) => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]) as Rgb
const fit = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)

/** O mesmo ACES Filmic do three (tonemapping_pars_fragment), com exposição 1: linear → linear em [0, 1]. */
export function acesFilmic(color: Rgb): Rgb {
  const v = mul(IN, color.map((c) => c / 0.6) as Rgb).map(fit) as Rgb
  return mul(OUT, v).map((c) => Math.min(1, Math.max(0, c))) as Rgb
}

/**
 * Cor linear que, depois do ACES Filmic, sai igual a `hex`. O ACES esmaga os quase-pretos para 0: com o bloom
 * (o tone mapping vira um efeito que pega também o fundo), o fundo #03050d sairia preto e não bateria com a página.
 */
export function preToneMapped(hex: string): Rgb {
  const target = hexToLinear(hex)
  const x: Rgb = [...target]
  for (let it = 0; it < 200; it++) {
    const y = acesFilmic(x)
    // passo por canal: o ACES é quase diagonal perto do preto
    for (let i = 0; i < 3; i++) x[i] = Math.max(0, x[i] + (target[i] - y[i]) * 2)
  }
  return x
}
