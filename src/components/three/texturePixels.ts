/**
 * Pintura de texturas em canvas 2D que roda igual no worker da cena (OffscreenCanvas) e na thread principal (canvas
 * do DOM, sem worker): quem chama escolhe o canvas. A saída é RGBA de 8 bits de baixo para cima (a linha 0 é v = 0),
 * pronta para um DataTexture sem flipY — o mesmo que o CanvasTexture com flipY subia.
 */
export type MakeCanvas = (width: number, height: number) => OffscreenCanvas | HTMLCanvasElement

/** Canvas do DOM (thread principal). */
export const domCanvas: MakeCanvas = (width, height) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** OffscreenCanvas (worker). */
export const offscreenCanvas: MakeCanvas = (width, height) => new OffscreenCanvas(width, height)

/**
 * Contexto 2D com as opções padrão, sempre num canvas novo por pintura: o Chrome rasteriza igual no worker e na
 * thread principal, e igual ao canvas que as texturas usavam antes (um canvas lido várias vezes troca de rasterizador
 * no meio, e `willReadFrequently` antisserrilha diferente). Sem 2D, null.
 */
function fresh2d(canvas: OffscreenCanvas | HTMLCanvasElement): CanvasRenderingContext2D | null {
  return canvas.getContext('2d') as CanvasRenderingContext2D | null
}

/** `fresh2d`, com erro se o navegador não tiver canvas 2D. */
export function context2d(canvas: OffscreenCanvas | HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = fresh2d(canvas)
  if (!ctx) throw new Error('canvas 2D indisponível')
  return ctx
}

/**
 * Pinta um canvas 2D temporário e devolve os pixels (RGBA, de cima para baixo); o canvas vai embora com o GC. Sem
 * contexto 2D, pixels zerados (thread principal, como antes); o worker confere o 2D antes (ver scene.worker).
 */
export function paintPixels(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
  makeCanvas: MakeCanvas = domCanvas,
): Uint8ClampedArray {
  const ctx = fresh2d(makeCanvas(width, height))
  if (!ctx) return new Uint8ClampedArray(width * height * 4)
  paint(ctx)
  return ctx.getImageData(0, 0, width, height).data
}

/** Linhas de cima para baixo (getImageData) → de baixo para cima (DataTexture sem flipY). */
export function flipRows(pixels: ArrayLike<number>, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4)
  const row = width * 4
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < row; i++) out[(height - 1 - y) * row + i] = pixels[y * row + i]
  }
  return out
}

/** Retângulo `[x, y, w, h]` (px, de cima para baixo) do canvas, de baixo para cima. */
export function readRows(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): Uint8Array {
  return flipRows(ctx.getImageData(x, y, w, h).data, w, h)
}
