/**
 * Medidas do Octocat piloto e da nave.
 *
 * Piloto (corpo, cabeça, rosto, braços, manche, gorro): tiradas do SVG de design/Octocat.dc.html
 * (viewBox 0 0 400 420), 100 px = 1 unidade, origem no ponto (200, 312) do SVG, y para cima, frente em +z.
 *
 * Nave (estilo máquina do tempo): frame próprio — origem no eixo da cabine, na altura do aro; y para cima;
 * frente em +z; a fuselagem vai para −z. O grupo do piloto entra na nave por COCKPIT (posição + escala).
 */
const ORIGIN_X = 200
const ORIGIN_Y = 312
const PX = 100

export function svgTo3d(x: number, y: number): [number, number] {
  return [(x - ORIGIN_X) / PX, (ORIGIN_Y - y) / PX]
}

export const COLORS = {
  ship: '#C4B5FD',
  cream: '#F1EAD8',
  engine: '#3A3F4B',
  nozzle: '#262A33',
  wingStripe: '#5EC4B6',
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

/** Corpo: path M150 296 Q146 232 200 226 Q254 232 250 296. */
export const TORSO = { base: svgTo3d(200, 296), rx: 0.5, ry: 0.7, rz: 0.42 } as const
/** Cabeça: elipse cx 200, cy 190, rx 62, ry 54. */
export const HEAD = { center: svgTo3d(200, 190), rx: 0.62, ry: 0.54, rz: 0.5 } as const
/** Rosto: elipse cx 200, cy 204, rx 46, ry 34; disco logo à frente da cabeça. */
export const FACE = { center: svgTo3d(200, 204), rx: 0.46, ry: 0.34, z: 0.49 } as const

/** Braço livre (acena): M160 254 Q124 236 120 198. */
export const FREE_ARM = { from: svgTo3d(160, 254), control: svgTo3d(124, 236), to: svgTo3d(120, 198) } as const
/** Braço no manche: M238 262 Q256 250 262 262. */
export const STICK_ARM = { from: svgTo3d(238, 262), control: svgTo3d(256, 250), to: svgTo3d(262, 262) } as const
/** Manche: rect x 262, y 262, 8 × 32; bola cx 266, cy 258, r 10. */
export const JOYSTICK = { base: svgTo3d(266, 278), height: 0.32, knob: svgTo3d(266, 258), knobRadius: 0.1 } as const
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

// ─── Nave: estilo máquina do tempo (frame da nave; ver o comentário do topo) ───

export type Vec3 = [number, number, number]
/** Ponto de perfil 2D: (raio, y) nas peças de revolução; (z, y) ou (x, z) nas lâminas. */
export type Vec2 = [number, number]

/** Facetas das peças de revolução (tigela e aro). */
export const RADIAL_SEGMENTS = 16
export const FACET_ANGLE = (Math.PI * 2) / RADIAL_SEGMENTS
/** Início do lathe: meia faceta para a esquerda, para uma faceta ficar centrada em +z. */
export const LATHE_PHI_START = -FACET_ANGLE / 2

/** Distância do eixo até o centro de uma faceta plana de um lathe cujos vértices estão no raio r. */
export function facetDistance(r: number): number {
  return r * Math.cos(FACET_ANGLE / 2)
}

/** Piso da cabine, onde o piloto senta. */
export const DECK_Y = -0.06

/** Tigela da cabine: perfil (raio, y) anti-horário, de baixo para cima, fechando no piso. */
export const BOWL_PROFILE: Vec2[] = [
  [0, -1.0],
  [0.45, -0.96],
  [0.78, -0.82],
  [0.96, -0.6],
  [1.04, -0.34],
  [1.06, DECK_Y],
  [0, DECK_Y],
]

/** Raio da parede externa da tigela na altura y e a inclinação dela (rad; 0 = vertical). */
export function bowlRadiusAt(y: number): { radius: number; tilt: number } {
  const wall = BOWL_PROFILE.slice(0, -1)
  for (let i = 0; i < wall.length - 1; i++) {
    const [r0, y0] = wall[i]
    const [r1, y1] = wall[i + 1]
    if (y >= y0 && y <= y1) {
      const t = (y - y0) / (y1 - y0)
      return { radius: r0 * (1 - t) + r1 * t, tilt: Math.atan2(r1 - r0, y1 - y0) }
    }
  }
  return { radius: 0, tilt: 0 }
}

/** Aro grosso creme em cima da tigela: seção retangular com chanfro. */
export const RIM = { inner: 0.92, outer: 1.12, bottom: -0.1, top: 0.1, chamfer: 0.04 } as const
export const RIM_PROFILE: Vec2[] = [
  [RIM.inner, RIM.bottom],
  [RIM.outer - RIM.chamfer, RIM.bottom],
  [RIM.outer, RIM.bottom + RIM.chamfer],
  [RIM.outer, RIM.top - RIM.chamfer],
  [RIM.outer - RIM.chamfer, RIM.top],
  [RIM.inner, RIM.top],
  [RIM.inner, RIM.bottom],
]

/** 7 quadradinhos de contribuição, um por faceta da face externa do aro, centrados na frente. */
export const SQUARES = {
  angles: [-3, -2, -1, 0, 1, 2, 3].map((k) => k * FACET_ANGLE),
  y: (RIM.bottom + RIM.top) / 2,
  size: 0.1,
  depth: 0.03,
} as const

/** Faróis: discos redondos na parede da tigela, um de cada lado da frente. */
export const HEADLIGHTS = { angles: [-2 * FACET_ANGLE, 2 * FACET_ANGLE], y: -0.4, radius: 0.17 } as const

/** Bolha de vidro: quase esfera apoiada no aro, com um arco fino de moldura de frente para trás. */
export const BUBBLE = { center: [0, 0.45, 0] as Vec3, radius: 1.1, frameRadius: 0.03 } as const

/**
 * Onde o grupo do piloto (coordenadas do SVG) entra na nave: escala e posição da origem do SVG,
 * com a base do corpo apoiada no piso da cabine e a cabeça no meio da bolha.
 */
const PILOT_SCALE = 0.65
export const COCKPIT = {
  position: [0, DECK_Y - TORSO.base[1] * PILOT_SCALE, 0] as Vec3,
  scale: PILOT_SCALE,
  bubbleRadius: BUBBLE.radius,
} as const

/** Antena: fio em arco do topo da bolha para trás, com um trecho em mola e bolinha na ponta. */
export const ANTENNA = {
  points: [
    [0, 1.53, -0.12],
    [0, 1.95, -0.22],
    [0, 2.3, -0.55],
    [0, 2.32, -0.95],
    [0, 2.12, -1.22],
  ] as Vec3[],
  radius: 0.025,
  tipRadius: 0.075,
  /** Trecho em mola: voltas em volta do arco entre as frações `from` e `to` do comprimento. */
  coil: { turns: 3, radius: 0.07, from: 0.3, to: 0.8 },
} as const

/** Seção elíptica da fuselagem traseira: centro (0, cy, z), semieixos rx × ry. */
export interface FuselageSection {
  z: number
  cy: number
  rx: number
  ry: number
}

/**
 * Fuselagem (o "motor"): nasce escondida dentro da tigela, fica quase da largura da cabine logo atrás dela
 * e afunila até o bocal.
 */
export const FUSELAGE: FuselageSection[] = [
  { z: -0.6, cy: -0.42, rx: 0.5, ry: 0.3 },
  { z: -1.2, cy: -0.36, rx: 0.78, ry: 0.5 },
  { z: -1.8, cy: -0.34, rx: 0.74, ry: 0.48 },
  { z: -2.4, cy: -0.32, rx: 0.64, ry: 0.42 },
  { z: -2.9, cy: -0.3, rx: 0.52, ry: 0.38 },
  { z: -3.25, cy: -0.29, rx: 0.44, ry: 0.36 },
]

/** Seção da fuselagem em qualquer z (interpolação linear; fora do intervalo, a seção da ponta). */
export function fuselageSection(z: number): FuselageSection {
  if (z >= FUSELAGE[0].z) return { ...FUSELAGE[0], z }
  for (let i = 0; i < FUSELAGE.length - 1; i++) {
    const a = FUSELAGE[i]
    const b = FUSELAGE[i + 1]
    if (z >= b.z) {
      const t = (a.z - z) / (a.z - b.z)
      const mix = (u: number, v: number) => u * (1 - t) + v * t
      return { z, cy: mix(a.cy, b.cy), rx: mix(a.rx, b.rx), ry: mix(a.ry, b.ry) }
    }
  }
  return { ...FUSELAGE[FUSELAGE.length - 1], z }
}

/** 3 faixas ciano em volta da fuselagem (centro em z), de seção retangular: largura em z, espessura radial. */
export const ENGINE_RINGS_Z = [-1.45, -1.85, -2.25]
export const ENGINE_RING = { width: 0.14, thickness: 0.05, gap: 0.01 } as const

/** Bocal: tronco de cone escuro na ponta da fuselagem, com lábio creme atrás. */
export const NOZZLE = { z: FUSELAGE[FUSELAGE.length - 1].z, length: 0.4, radiusFront: 0.36, radiusBack: 0.41, lip: 0.07 } as const
/** Chama do propulsor (comprimento em thrusterLevel = 1). */
export const THRUSTER = { radius: 0.3, length: 1.1 } as const

/**
 * Asas: par espelhado de lâminas longas que correm ao longo do casco, uma de cada lado. Cada uma começa
 * baixa, embaixo da frente da cabine, corre para trás junto da tigela e do motor, passa do bocal e termina
 * numa ponta apontada para trás. A raiz fica dentro da tigela/motor; a lâmina sobe para fora (diedro) e
 * para trás (pitch). Mesma ordem de rotação do Euler 'XYZ' do three: primeiro o diedro, depois o pitch.
 * Contorno no plano da asa: (s, z), com s = distância para fora a partir da raiz e z da nave; convexo.
 */
export const WING = {
  root: { x: 0.55, y: -0.55 },
  /** Sobe para fora (rotação em z da nave, espelhada por lado). */
  dihedral: (20 * Math.PI) / 180,
  /** Sobe para trás (rotação em x): a frente fica baixa, sob a cabine, e a ponta de trás mais alta. */
  pitch: (3 * Math.PI) / 180,
  outline: [
    [0, 0.4],
    [0.75, 0],
    [0.95, -2.2],
    [0.7, -3.7],
    [0.25, -4.5],
    [0, -2.6],
  ] as Vec2[],
  thickness: 0.06,
  /** Faixas verde-água: uma na borda de fora e uma no meio da lâmina, por cima. Linhas (s, z). */
  stripes: [
    { radius: 0.035, line: [[0.75, 0], [0.95, -2.2], [0.7, -3.7], [0.25, -4.5]] as Vec2[] },
    { radius: 0.022, line: [[0.4, 0.05], [0.6, -2.2], [0.35, -3.9]] as Vec2[] },
  ],
  /** Duas luzinhas em domo sobre cada asa, perto da ponta: (s, z). */
  lights: [
    [0.65, -3.0],
    [0.56, -3.55],
  ] as Vec2[],
  lightRadius: 0.06,
} as const

/** Ponto (s, z) do plano de uma asa levado para a nave; side = 1 é a asa de +x, −1 a de −x. */
export function wingPoint(side: 1 | -1, [s, z]: Vec2): Vec3 {
  const x = side * s * Math.cos(WING.dihedral)
  const y = s * Math.sin(WING.dihedral)
  const [cos, sin] = [Math.cos(WING.pitch), Math.sin(WING.pitch)]
  return [side * WING.root.x + x, WING.root.y + y * cos - z * sin, y * sin + z * cos]
}

/** Coluna em arco dentro da bolha: do fundo da cabine, atrás do piloto, até o alto do vidro. */
export const PILLAR = {
  points: [
    [0, DECK_Y, -0.9],
    [0, 0.7, -0.88],
    [0, 1.3, -0.58],
    [0, 1.5, -0.16],
  ] as Vec3[],
  radius: 0.06,
} as const
