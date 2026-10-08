/**
 * Medidas do Octocat piloto tiradas do SVG de design/Octocat.dc.html (viewBox 0 0 400 420).
 * 100 px = 1 unidade; origem no centro do casco (200, 312); y para cima; a nave olha para +z.
 */
const ORIGIN_X = 200
const ORIGIN_Y = 312
const PX = 100

export function svgTo3d(x: number, y: number): [number, number] {
  return [(x - ORIGIN_X) / PX, (ORIGIN_Y - y) / PX]
}

export const COLORS = {
  ship: '#C4B5FD',
  stripe: '#E6EAF0',
  dome: '#A5F3FC',
  thruster: '#67E8F9',
  headlight: '#FFF3C4',
  body: '#1F2329',
  skin: '#F2C9A6',
  face: '#7A2F2F',
  blush: '#F29C8A',
  hat: '#D97757',
  hatBrim: '#B85C3E',
  hatEyes: '#141413',
  stick: '#4A5878',
  thought: '#9AA3B8',
} as const

export const CONTRIBUTION_COLORS = ['#39D353', '#26A641', '#39D353', '#0E4429', '#39D353', '#26A641', '#39D353'] as const

/** Casco: elipse rx 150, ry 52; a profundidade (rz) é escolha do 3D. */
export const HULL = { rx: 1.5, ry: 0.38, rz: 1.1 } as const
/** Cúpula: path M54 292 Q54 56 200 54 Q346 56 346 292. */
export const DOME = { base: svgTo3d(200, 292), rx: 1.46, ry: 2.38, rz: 1.1 } as const
/** Corpo: path M150 296 Q146 232 200 226 Q254 232 250 296. */
export const TORSO = { base: svgTo3d(200, 296), rx: 0.5, ry: 0.7, rz: 0.42 } as const
/** Cabeça: elipse cx 200, cy 190, rx 62, ry 54. */
export const HEAD = { center: svgTo3d(200, 190), rx: 0.62, ry: 0.54, rz: 0.5 } as const
/** Rosto: elipse cx 200, cy 204, rx 46, ry 34; disco logo à frente da cabeça. */
export const FACE = { center: svgTo3d(200, 204), rx: 0.46, ry: 0.34, z: 0.49 } as const

const pts = (list: [number, number][]) => list.map(([x, y]) => svgTo3d(x, y))
/** Asa superior esquerda: M96 286 L60 250 L74 246 L118 286 (a direita é espelhada). */
export const UPPER_FIN = pts([[96, 286], [60, 250], [74, 246], [118, 286]])
/** Asa inferior esquerda: M150 330 L70 392 L104 398 L190 336. */
export const LOWER_FIN = pts([[150, 330], [70, 392], [104, 398], [190, 336]])

/** Braço livre (acena): M160 254 Q124 236 120 198. */
export const FREE_ARM = { from: svgTo3d(160, 254), control: svgTo3d(124, 236), to: svgTo3d(120, 198) } as const
/** Braço no manche: M238 262 Q256 250 262 262. */
export const STICK_ARM = { from: svgTo3d(238, 262), control: svgTo3d(256, 250), to: svgTo3d(262, 262) } as const
/** Manche: rect x 262, y 262, 8 × 32; bola cx 266, cy 258, r 10. */
export const JOYSTICK = { base: svgTo3d(266, 278), height: 0.32, knob: svgTo3d(266, 258), knobRadius: 0.1 } as const
/** Farol: circle cx 200, cy 336, r 8. */
export const HEADLIGHT = svgTo3d(200, 336)
/** Quadradinhos de contribuição na faixa (rects de 10 px a partir de x = 112, passo 28). */
export const SQUARES_X = [117, 145, 173, 201, 229, 257, 285].map((x) => (x - ORIGIN_X) / PX)
export const ARM_RADIUS = 0.065
export const ARM_Z = 0.2

export interface Block {
  position: [number, number, number]
  size: [number, number, number]
  color: string
}

export const CROWN_DEPTH = 0.75
/** A aba é mais funda que o rosto (FACE.z) para cobrir a testa, como no SVG. */
export const BRIM_DEPTH = 1.05

/** Retângulos do gorro-Clawd (dentro de translate(80 44)): x, y, w, h, profundidade 3D, cor. */
const HAT_RECTS: [number, number, number, number, number, string][] = [
  [92, 34, 9, 18, 0.3, COLORS.hat],
  [108, 34, 9, 18, 0.3, COLORS.hat],
  [124, 34, 9, 18, 0.3, COLORS.hat],
  [140, 34, 9, 18, 0.3, COLORS.hat],
  [62, 50, 116, 80, CROWN_DEPTH, COLORS.hat],
  [40, 96, 24, 14, 0.3, COLORS.hat],
  [176, 96, 24, 14, 0.3, COLORS.hat],
  [40, 110, 14, 34, 0.3, COLORS.hat],
  [186, 110, 14, 34, 0.3, COLORS.hat],
  [58, 120, 124, 14, BRIM_DEPTH, COLORS.hatBrim],
]
const HAT_EYE_RECTS: [number, number, number, number][] = [
  [96, 66, 10, 24],
  [134, 66, 10, 24],
]

function rectToBlock(x: number, y: number, w: number, h: number, depth: number, color: string, z = 0): Block {
  const [cx, cy] = svgTo3d(80 + x + w / 2, 44 + y + h / 2)
  return { position: [cx, cy, z], size: [w / PX, h / PX, depth], color }
}

export const HAT_BLOCKS: Block[] = HAT_RECTS.map(([x, y, w, h, depth, color]) => rectToBlock(x, y, w, h, depth, color))
export const HAT_EYE_BLOCKS: Block[] = HAT_EYE_RECTS.map(([x, y, w, h]) =>
  rectToBlock(x, y, w, h, 0.02, COLORS.hatEyes, CROWN_DEPTH / 2 + 0.011),
)
