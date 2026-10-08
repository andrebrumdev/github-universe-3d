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

/**
 * Profundidade (z) da frente da cabeça no ponto (x, y) do piloto; 0 fora da silhueta.
 * `grow` infla a elipsoide por igual (para pôr algo logo acima da superfície, como o rosto).
 */
export function headFrontZ(x: number, y: number, grow = 0): number {
  const k = 1 - (x / (HEAD.rx + grow)) ** 2 - ((y - HEAD.center[1]) / (HEAD.ry + grow)) ** 2
  return (HEAD.rz + grow) * Math.sqrt(Math.max(0, k))
}

/** Braço livre (acena): M160 254 Q124 236 120 198. */
export const FREE_ARM = { from: svgTo3d(160, 254), control: svgTo3d(124, 236), to: svgTo3d(120, 198) } as const
/** Braço no manche: M238 262 Q256 250 262 262. */
export const STICK_ARM = { from: svgTo3d(238, 262), control: svgTo3d(256, 250), to: svgTo3d(262, 262) } as const
/** Manche: rect x 262, y 262, 8 × 32; bola cx 266, cy 258, r 10. */
export const JOYSTICK = { base: svgTo3d(266, 278), height: 0.32, knob: svgTo3d(266, 258), knobRadius: 0.1 } as const
export const ARM_RADIUS = 0.065
export const ARM_Z = 0.2
/** Mão na ponta do braço livre (a ponta redonda do traço do SVG). */
export const HAND_RADIUS = ARM_RADIUS * 1.4

/**
 * Bolhas de pensamento (x, y, z, raio). Na folha de expressões ficam em (276, 114), (292, 96), (310, 74) com
 * r 5/7/9; aqui sobem do mesmo jeito, mas mais perto da cabeça, para caberem na bolha de vidro da cabine.
 */
export const THOUGHTS: [number, number, number, number][] = [
  [...svgTo3d(266, 120), 0.3, 0.05],
  [...svgTo3d(270, 104), 0.3, 0.07],
  [...svgTo3d(274, 88), 0.3, 0.09],
]

export interface Block {
  position: [number, number, number]
  size: [number, number, number]
  color: string
}

/** A copa abraça a cabeça: funda o bastante para a cabeça não furar a frente acima da aba. */
export const CROWN_DEPTH = 0.9
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
/** Ponto 2D: (x, z) na planta ou (dr, y) numa seção. */
export type Vec2 = [number, number]

/**
 * Planta da cabine: elipse alongada em z. O casco ("banheira"), o aro e a cúpula usam a mesma elipse,
 * amostrada em PLAN_SEGMENTS pontos; φ = 0 é a frente (+z) e as facetas ficam centradas em φ = m·Δ.
 */
export const PLAN = { a: 0.95, b: 1.5 } as const
export const PLAN_SEGMENTS = 16
const PLAN_STEP = (Math.PI * 2) / PLAN_SEGMENTS

/** Ângulo do k-ésimo ponto da planta: meia faceta deslocado, para uma faceta ficar centrada na frente. */
export function planAngle(k: number): number {
  return (k + 0.5) * PLAN_STEP
}

/** Ponto (x, z) da elipse de semieixos a (x) e b (z) no ângulo φ. */
export function planPoint(phi: number, a: number, b: number): Vec2 {
  return [a * Math.sin(phi), b * Math.cos(phi)]
}

/** Normal para fora da elipse no ângulo φ (unitária). */
export function planNormal(phi: number, a: number, b: number): Vec2 {
  const [nx, nz] = [Math.sin(phi) / a, Math.cos(phi) / b]
  const len = Math.hypot(nx, nz)
  return [nx / len, nz / len]
}

/** Faceta m de uma elipse amostrada: centro (x, z) e yaw (rotação em y que vira +z para fora da faceta). */
export function planFacet(m: number, a: number, b: number): { center: Vec2; yaw: number } {
  const [x0, z0] = planPoint(planAngle(m - 1), a, b)
  const [x1, z1] = planPoint(planAngle(m), a, b)
  const [tx, tz] = [x1 - x0, z1 - z0]
  // normal para fora = (−tz, tx); yaw = atan2(nx, nz)
  return { center: [(x0 + x1) / 2, (z0 + z1) / 2], yaw: Math.atan2(-tz, tx) }
}

/** Piso da cabine, onde o piloto senta. */
export const DECK_Y = -0.24

/** Anel horizontal do casco: elipse da planta escalada por f, na altura y, com o centro deslocado em z. */
export interface TubRing {
  f: number
  y: number
  dz: number
}

/**
 * Casco em "banheira" (barco): anéis de baixo para cima pela parede de fora, depois a borda de dentro e o piso
 * (o loft fecha o piso com tampa). Os anéis de baixo vão para trás (dz < 0): a proa sobe arredondada.
 */
export const TUB = {
  rings: [
    { f: 0.32, y: -0.46, dz: -0.3 },
    { f: 0.66, y: -0.43, dz: -0.16 },
    { f: 0.88, y: -0.32, dz: -0.06 },
    { f: 0.98, y: -0.17, dz: 0 },
    { f: 0.99, y: -0.03, dz: 0 },
    { f: 0.86, y: -0.03, dz: 0 },
    { f: 0.86, y: DECK_Y, dz: 0 },
  ] as TubRing[],
  /** Quantos anéis (do começo) formam a parede de fora. */
  outerWall: 5,
} as const

/** Escala da planta e deslocamento em z da parede de fora do casco na altura y (null fora do casco). */
export function tubRingAt(y: number): { f: number; dz: number } | null {
  const wall = TUB.rings.slice(0, TUB.outerWall)
  if (y < wall[0].y || y > wall[wall.length - 1].y) return null
  for (let i = 0; i < wall.length - 1; i++) {
    const [r0, r1] = [wall[i], wall[i + 1]]
    if (y <= r1.y) {
      const t = (y - r0.y) / (r1.y - r0.y)
      return { f: r0.f * (1 - t) + r1.f * t, dz: r0.dz * (1 - t) + r1.dz * t }
    }
  }
  return null
}

/** Meia largura da parede de fora do casco em (z, y); 0 fora do casco. */
export function tubHalfWidth(z: number, y: number): number {
  const ring = tubRingAt(y)
  if (!ring) return 0
  const k = 1 - ((z - ring.dz) / (ring.f * PLAN.b)) ** 2
  return k > 0 ? ring.f * PLAN.a * Math.sqrt(k) : 0
}

/** Aro creme fino e polido em volta da borda de cima do casco (seção pela normal da planta). */
export const RIM = { width: 0.07, bottom: -0.04, top: 0.04, chamfer: 0.015 } as const
/** Seção do aro: (dr para fora a partir da elipse da planta, y), anti-horária. */
export const RIM_SECTION: Vec2[] = [
  [-RIM.width, RIM.bottom],
  [-RIM.chamfer, RIM.bottom],
  [0, RIM.bottom + RIM.chamfer],
  [0, RIM.top - RIM.chamfer],
  [-RIM.chamfer, RIM.top],
  [-RIM.width, RIM.top],
]

/** 7 quadradinhos de contribuição na face de fora do aro, um por faceta, centrados na frente. */
export const SQUARES = { facets: [-3, -2, -1, 0, 1, 2, 3], size: 0.045, depth: 0.015 } as const

/** Faróis: discos na frente do casco, um de cada lado da proa (facetas ±1), um pouco abaixo do aro. */
export const HEADLIGHTS = { facets: [-1, 1], y: -0.16, radius: 0.1 } as const

/**
 * Cúpula de vidro: meio elipsoide longo e baixo apoiado no aro, cobrindo quase todo o casco. Inclinada
 * para a frente (`lean`: z += lean·altura), então o ponto mais alto fica um pouco à frente do meio.
 */
export const CANOPY = { base: 0.03, a: 0.89, b: 1.44, height: 1.2, lean: 0.22 } as const

/** O ponto está dentro da cúpula (acima da base)? */
export function canopyContains([x, y, z]: Vec3): boolean {
  const h = y - CANOPY.base
  if (h < 0) return false
  const zu = z - CANOPY.lean * h
  return (x / CANOPY.a) ** 2 + (h / CANOPY.height) ** 2 + (zu / CANOPY.b) ** 2 < 1
}

/**
 * Onde o grupo do piloto (coordenadas do SVG) entra na nave: posição da origem do SVG e escala, com a base
 * do corpo no piso, sob o ponto mais alto da cúpula. `bubbleRadius` é o menor semieixo da cúpula (folga lateral).
 */
const PILOT_SCALE = 0.6
const PILOT_Z = 0.2
export const COCKPIT = {
  position: [0, DECK_Y - TORSO.base[1] * PILOT_SCALE, PILOT_Z] as Vec3,
  scale: PILOT_SCALE,
  bubbleRadius: CANOPY.a,
} as const

/** Assento sob o piloto: almofadas creme numa concha lilás (assento + encosto). */
export const SEAT = {
  z: PILOT_Z,
  width: 0.56,
  cushion: { depth: 0.42, height: 0.08 },
  back: { height: 0.56, thickness: 0.09, z: PILOT_Z - 0.3, tilt: 0.18 },
  shell: 0.04,
} as const

/** Painel na frente da cabine com o volante redondo e duas luzinhas. */
export const DASHBOARD = {
  z: 1.0,
  width: 0.7,
  depth: 0.24,
  height: 0.3,
  wheel: { radius: 0.12, tube: 0.022, y: DECK_Y + 0.44, z: 0.78, tilt: 0.5 },
  lights: [
    { x: -0.18, color: '#39D353' },
    { x: 0.18, color: '#67E8F9' },
  ],
} as const

/** Coluna grossa em arco: do piso de trás, atrás do assento, subindo para a frente até o alto da cúpula. */
export const PILLAR = {
  points: [
    [0, DECK_Y, -1.1],
    [0, 0.42, -1.04],
    [0, 0.85, -0.72],
    [0, 1.07, -0.3],
  ] as Vec3[],
  radius: 0.09,
} as const

/** Antena: fio em arco que sai do topo da coluna (junção com a cúpula) para trás, com mola e bolinha na ponta. */
export const ANTENNA = {
  points: [
    [0, 1.18, -0.32],
    [0, 1.5, -0.5],
    [0, 1.76, -0.82],
    [0, 1.8, -1.18],
    [0, 1.64, -1.42],
  ] as Vec3[],
  radius: 0.022,
  tipRadius: 0.07,
  /** Trecho em mola: voltas em volta do arco entre as frações `from` e `to` do comprimento. */
  coil: { turns: 3, radius: 0.06, from: 0.3, to: 0.8 },
} as const

/** Seção elíptica da fuselagem traseira: centro (0, cy, z), semieixos rx × ry. */
export interface FuselageSection {
  z: number
  cy: number
  rx: number
  ry: number
}

/**
 * Motor: nacela curta, baixa e encorpada, encaixada sob e atrás da traseira do casco. Nasce sob o piso,
 * fica com ~3/4 da largura da cabine e afunila um pouco até o bocal.
 */
export const FUSELAGE: FuselageSection[] = [
  { z: -0.75, cy: -0.46, rx: 0.36, ry: 0.16 },
  { z: -1.4, cy: -0.46, rx: 0.7, ry: 0.43 },
  { z: -1.7, cy: -0.46, rx: 0.66, ry: 0.41 },
  { z: -1.9, cy: -0.46, rx: 0.6, ry: 0.38 },
  { z: -2.05, cy: -0.46, rx: 0.54, ry: 0.35 },
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

/** 3 faixas ciano em volta do motor (centro em z), de seção retangular: largura em z, espessura radial. */
export const ENGINE_RINGS_Z = [-1.52, -1.68, -1.84]
export const ENGINE_RING = { width: 0.09, thickness: 0.045, gap: 0.01 } as const

/** Bocal: tronco de cone escuro e ovalado (altura = squash × largura) com lábio creme atrás. */
export const NOZZLE = {
  z: FUSELAGE[FUSELAGE.length - 1].z,
  length: 0.16,
  radiusFront: 0.5,
  radiusBack: 0.52,
  lip: 0.07,
  squash: 0.75,
} as const
/** Chama do propulsor (comprimento em thrusterLevel = 1). */
export const THRUSTER = { radius: 0.33, length: 0.9 } as const

/**
 * Corte de uma asa no plano z: uma lente da borda de dentro (`inner`, na lateral do casco ou, atrás da
 * raiz, no bordo de fuga) até a de fora (`outer`, o bordo de ataque enflechado), com espessura no meio.
 * `y` é a altura da superfície média na linha da raiz (WING.root.x); para fora dela a asa sobe com o diedro.
 * Da frente para trás.
 */
export interface WingStation {
  z: number
  inner: number
  outer: number
  y: number
  thickness: number
}

/**
 * Asas: par espelhado de lâminas que ABREM para os lados, como na foto. A raiz corre pela lateral de baixo
 * do casco, da frente sob a cabine até o motor; a lâmina sai para fora com envergadura de cerca de uma
 * largura de casco, sobe com diedro de ~24° e é enflechada, com a ponta atrás do bocal. Visto de lado, o
 * contorno continua um "swoosh" que nasce baixo na frente e sobe até a ponta. A faixa verde-água corre por
 * baixo, perto do bordo de ataque (ângulos de `stripe.from` a `stripe.to` da lente).
 */
export const WING = {
  /** Linha da raiz: a meia largura do casco onde a asa sai dele (dentro disso a lâmina fica embutida). */
  root: { x: 0.6 },
  /** Diedro: a lâmina sobe este ângulo da raiz para fora. */
  dihedral: (24 * Math.PI) / 180,
  stations: [
    { z: 0.9, inner: 0.35, outer: 0.45, y: -0.34, thickness: 0.06 },
    { z: 0.55, inner: 0.5, outer: 0.66, y: -0.37, thickness: 0.12 },
    { z: 0.1, inner: 0.6, outer: 0.86, y: -0.39, thickness: 0.18 },
    { z: -0.5, inner: 0.6, outer: 1.14, y: -0.4, thickness: 0.22 },
    { z: -1.1, inner: 0.45, outer: 1.52, y: -0.39, thickness: 0.21 },
    { z: -1.45, inner: 0.5, outer: 1.82, y: -0.38, thickness: 0.19 },
    { z: -1.75, inner: 1.0, outer: 2.12, y: -0.36, thickness: 0.16 },
    { z: -2.05, inner: 1.6, outer: 2.42, y: -0.33, thickness: 0.12 },
    { z: -2.3, inner: 2.15, outer: 2.62, y: -0.3, thickness: 0.08 },
    { z: -2.5, inner: 2.55, outer: 2.72, y: -0.27, thickness: 0.04 },
    { z: -2.62, inner: 2.74, outer: 2.78, y: -0.26, thickness: 0.015 },
  ] as WingStation[],
  /** Ângulos (rad) da lente: 0 = borda de fora, π/2 = face de cima, π = borda de dentro, 3π/2 = face de baixo. */
  stripe: { from: (290 * Math.PI) / 180, to: (350 * Math.PI) / 180 },
  /** Duas luzinhas em domo na face de cima, perto da ponta: z e ângulo na lente. */
  lights: [
    { z: -2.24, angle: Math.PI / 3 },
    { z: -2.38, angle: Math.PI / 3 },
  ],
  lightRadius: 0.045,
} as const

/** Seção da asa em qualquer z (interpolação linear entre as estações). */
export function wingStationAt(z: number): WingStation {
  const list = WING.stations
  if (z >= list[0].z) return { ...list[0], z }
  for (let i = 0; i < list.length - 1; i++) {
    const [a, b] = [list[i], list[i + 1]]
    if (z >= b.z) {
      const t = (a.z - z) / (a.z - b.z)
      const mix = (u: number, v: number) => u * (1 - t) + v * t
      return {
        z,
        inner: mix(a.inner, b.inner),
        outer: mix(a.outer, b.outer),
        y: mix(a.y, b.y),
        thickness: mix(a.thickness, b.thickness),
      }
    }
  }
  return { ...list[list.length - 1], z }
}

/** Altura da superfície média da asa na seção `station`, à distância |x| do eixo (diedro da raiz para fora). */
export function wingMidY(station: WingStation, x: number): number {
  return station.y + Math.tan(WING.dihedral) * Math.max(0, x - WING.root.x)
}

/** Ponto da superfície da asa na seção `station`, no ângulo `angle` da lente; side = 1 é a asa de +x. */
export function wingPoint(side: 1 | -1, station: WingStation, angle: number): Vec3 {
  const mid = (station.inner + station.outer) / 2
  const half = (station.outer - station.inner) / 2
  const x = mid + half * Math.cos(angle)
  return [side * x, wingMidY(station, x) + (station.thickness / 2) * Math.sin(angle), station.z]
}

/** Comprimento total: da proa (frente do aro) até o fim do lábio do bocal. */
export const SHIP_LENGTH = PLAN.b - (NOZZLE.z - NOZZLE.length - NOZZLE.lip)
/** Altura total: do alto da cúpula até o ponto mais baixo (casco, motor ou asas). */
export const SHIP_HEIGHT =
  CANOPY.base +
  CANOPY.height -
  Math.min(
    TUB.rings[0].y,
    ...FUSELAGE.map((f) => f.cy - f.ry),
    ...WING.stations.map((st) => st.y - st.thickness / 2),
  )
