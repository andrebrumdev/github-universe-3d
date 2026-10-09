import type { SunExpression } from './sunMachine'

/**
 * Rosto do sol no estilo do Sphere de Las Vegas com o emoji (referências `sun-reference-sphere*.png`): traços pequenos
 * perto do tamanho do globo, um pouco abaixo do equador — olhos brancos redondos com pupila preta grande, sobrancelhas
 * em barra reta logo acima e uma boquinha. Medidas em unidades de desenho de um mapa 512×256 (equirretangular,
 * 1 unidade ≈ 0,7°); o canvas real pode ser maior. O centro do rosto (128, 128) é o +z da esfera.
 */
export const FACE_W = 512
export const FACE_H = 256
export const FACE_CENTER: readonly [number, number] = [128, 128]
/**
 * Olhos: centros em (±dx, y) a partir do centro do rosto (y > 0 = abaixo do equador); brancos redondos de raio rx = ry.
 * Cada olho tem ~11,5% do diâmetro do disco visto de frente, e o vão entre eles ~ uma largura de olho.
 */
export const EYE = { dx: 19, y: 4, rx: 9.5, ry: 9.5 } as const
/** Altura da boca (centro), a partir do centro do rosto. */
export const MOUTH_Y = 20

/** Pupila por expressão: raio e posição de repouso dentro do olho (y para baixo, como no canvas). */
export const PUPIL: Record<SunExpression, { r: number; x: number; y: number }> = {
  // viajando não tem pupila (olhos em traço); o valor só completa a tabela
  viajando: { r: 0, x: 0, y: 0 },
  serious: { r: 4.6, x: 0, y: 0 },
  // de olho, com a pálpebra pesada: pupila meio escondida sob a pálpebra, como na foto do Sphere de lado
  watching: { r: 4.6, x: 0, y: 0.6 },
  happy: { r: 4.6, x: 0, y: 0.3 },
  // olhos arregalados: pupila menor
  surprised: { r: 3.9, x: 0, y: 0 },
  sad: { r: 4.4, x: 0, y: 1 },
  // admirando: pupila grande (com brilho, ver `hasSparkle`)
  admiring: { r: 5.2, x: 0, y: 0.3 },
}
/** As pupilas adiantam o olhar para a câmera enquanto a mola do rosto ainda está virando: unidades por radiano. */
export const PUPIL_GAIN = 10
/** Quanto a pupila anda, no máximo, a partir do repouso (a pupila inteira fica dentro do branco). */
export const PUPIL_REACH = 3.6
/** De olho (pálpebra pesada): a pupila corre para a borda do branco do lado para onde a cabeça virou (unidades/rad). */
export const SIDE_EYE_GAIN = 6

/** Viajando não tem pupila: os olhos são traços. */
export function hasPupils(expression: SunExpression): boolean {
  return expression !== 'viajando'
}

/** De olho: pálpebra pesada preenchida cobrindo o topo do branco (o olhar de lado do Sphere); ela é a sobrancelha. */
export function hasLidCap(expression: SunExpression): boolean {
  return expression === 'watching'
}

/** Pálpebra pesada: fração do branco coberta de cima para baixo, quanto passa da borda do olho e a curva da borda de baixo. */
export const LID = { cover: 0.38, overhang: 1.3, sag: 1.2 } as const

/** De olho e admirando: as pupilas correm para o lado para onde a cabeça virou (olhando o que chamou a atenção). */
export function sideEyes(expression: SunExpression): boolean {
  return expression === 'watching' || expression === 'admiring'
}

/** Admirando ("own"): um brilho branco em cada pupila. */
export function hasSparkle(expression: SunExpression): boolean {
  return expression === 'admiring'
}

/**
 * Sobrancelha em barra reta: quanto sobe acima do topo do olho e quanto a ponta de dentro sobe a mais que a de fora
 * (`tilt` > 0: preocupado/encantado; 0: nivelada). Reta e nivelada só no sério; viajando e de olho não têm.
 */
const BROW: Partial<Record<SunExpression, { lift: number; tilt: number; arch: number }>> = {
  serious: { lift: 3, tilt: 0, arch: 0 },
  happy: { lift: 5, tilt: 0, arch: 0 },
  surprised: { lift: 7, tilt: 0, arch: 0 },
  sad: { lift: 3.5, tilt: 1.6, arch: 0 },
  // "own": levantadas, macias (curvas) e com a ponta de dentro mais alta
  admiring: { lift: 5.5, tilt: 1.2, arch: 1.6 },
}

/** Curva da sobrancelha (unidades que o meio sobe acima da reta); 0 = barra reta. */
export function browArch(expression: SunExpression): number {
  return BROW[expression]?.arch ?? 0
}
const BROW_HALF = 11

/**
 * Barra da sobrancelha do olho `side` (−1 esquerdo, 1 direito): [x, y] da ponta de dentro e [x, y] da de fora;
 * `null` nas expressões sem sobrancelha (viajando, de olho).
 */
export function browBar(expression: SunExpression, side: -1 | 1): [number, number, number, number] | null {
  const brow = BROW[expression]
  if (!brow) return null
  const ex = side * EYE.dx
  const y = EYE.y - EYE.ry - brow.lift
  return [ex - side * BROW_HALF, y - brow.tilt, ex + side * BROW_HALF, y + brow.tilt]
}

/**
 * Viajando (a referência `sun-reference-sphere-viajando.png`): olhos em traço grosso, boquinha oval, sem sobrancelha;
 * o rosto um pouco à direita e abaixo; uma bolinha de pensamento contornada no alto à direita, balançando devagar.
 */
export const VIAJANDO = { offsetX: 6, offsetY: 2, dashHalf: 10, dashWidth: 4.2, mouthRx: 3.4, mouthRy: 2.3 } as const
/** Bolinha de pensamento (relativa ao centro do rosto viajando): centro, raio, traço e balanço (unidades). */
export const BUBBLE = { x: 34, y: -24, r: 4.5, width: 1.6, bobX: 0.8, bobY: 1.4 } as const

/**
 * Posição [x, y] e raio da pupila (unidades de desenho, relativas ao centro do olho) a partir do atraso da mola:
 * `lagYaw` > 0 é câmera mais para +x (direita no mapa); `lagPitch` > 0 é câmera mais para cima (y menor no mapa).
 * De olho e admirando, `awayYaw`/`awayPitch` (quanto a cabeça já virou para longe de quem vê) empurram a pupila para a
 * borda do branco do mesmo lado.
 */
export function pupilLook(
  expression: SunExpression,
  lagYaw: number,
  lagPitch: number,
  out: [number, number, number] = [0, 0, 0],
  awayYaw = 0,
  awayPitch = 0,
): [number, number, number] {
  const base = PUPIL[expression]
  const side = sideEyes(expression) ? SIDE_EYE_GAIN : 0
  let x = PUPIL_GAIN * lagYaw + side * awayYaw
  let y = -(PUPIL_GAIN * lagPitch + side * awayPitch)
  const len = Math.hypot(x, y)
  if (len > PUPIL_REACH) {
    x *= PUPIL_REACH / len
    y *= PUPIL_REACH / len
  }
  out[0] = base.x + x
  out[1] = base.y + y
  out[2] = base.r
  return out
}
