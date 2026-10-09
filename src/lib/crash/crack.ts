/**
 * Vidro trincado procedural (em px da tela): rachaduras radiais em zigue-zague saindo do ponto do impacto até a borda
 * da tela (de ponta a ponta), alguns galhos, e anéis de fratura concêntricos perto do impacto ligando radiais vizinhas. Determinístico pela semente (testável e igual a
 * cada vez com a mesma semente); vira um SVG no CrashOverlay, sem imagem nenhuma e nítido em qualquer tela.
 */
import { mulberry32 } from '../universe/random'

export type Point = [number, number]

export interface Crack {
  kind: 'ray' | 'branch' | 'ring'
  /** Polilinha (px). Rachaduras e galhos começam no lado de dentro (a cura recolhe para lá). */
  points: Point[]
  /** Comprimento da polilinha (px): o tracejado da cura usa ele. */
  length: number
  /** Atraso relativo da cura (0..1): anéis e galhos se consertam primeiro. */
  delay: number
  /** Fração da cura que ela leva para se recolher (delay + span ≤ 1). */
  span: number
  /** Só nos anéis: qual anel (0 = o de dentro). */
  level?: number
  /** Só nos galhos: índice da radial em que nasce e a que distância (px, ao longo dela) do impacto. */
  parent?: number
  root?: number
}

export interface CrackPattern {
  rays: Crack[]
  rings: Crack[]
}

/** Rachaduras radiais (de ponta a ponta) e o tremido do ângulo de cada uma, em fração do espaçamento. */
const MIN_RAYS = 11
const MAX_RAYS = 14
const ANGLE_JITTER = 0.2
/** Galhos secundários. */
const MIN_BRANCHES = 3
const MAX_BRANCHES = 5
/**
 * Anéis de fratura perto do impacto: raio em fração do menor lado da tela, e a chance de cada pedaço faltar — os de
 * fora são mais soltos. Sempre os dois primeiros; o terceiro, às vezes.
 */
const RINGS = [
  { radius: 0.06, gap: 0.15 },
  { radius: 0.14, gap: 0.35 },
  { radius: 0.25, gap: 0.55 },
]
/** Comprimento de cada trecho do zigue-zague (fração da diagonal) e o desvio máximo de direção (rad) a cada trecho. */
const STEP = 0.055
const WOBBLE = 0.32
/** Parte do tempo da cura em que cada rachadura se recolhe (o resto é o atraso dela). */
const RETRACT_SHARE = 0.6
const MAX_DELAY = 1 - RETRACT_SHARE

export function polylineLength(points: readonly (readonly [number, number])[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  return total
}

/** Ponto da polilinha a `r` px do centro (a primeira travessia), ou null se ela não chega lá. */
function pointAtRadius(points: Point[], cx: number, cy: number, r: number): Point | null {
  for (let i = 1; i < points.length; i++) {
    const d0 = Math.hypot(points[i - 1][0] - cx, points[i - 1][1] - cy)
    const d1 = Math.hypot(points[i][0] - cx, points[i][1] - cy)
    if (d0 <= r && d1 >= r) {
      const k = d1 === d0 ? 0 : (r - d0) / (d1 - d0)
      return [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * k, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * k]
    }
  }
  return null
}

/** Onde o trecho de `a` (dentro da tela) a `b` (fora) cruza a borda do retângulo [0, w] × [0, h]. */
function clipToBorder(a: Point, b: Point, w: number, h: number): Point {
  let t = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (b[0] < 0) t = Math.min(t, -a[0] / dx)
  if (b[0] > w) t = Math.min(t, (w - a[0]) / dx)
  if (b[1] < 0) t = Math.min(t, -a[1] / dy)
  if (b[1] > h) t = Math.min(t, (h - a[1]) / dy)
  t = Math.max(0, t)
  return [Math.min(w, Math.max(0, a[0] + dx * t)), Math.min(h, Math.max(0, a[1] + dy * t))]
}

const outside = ([x, y]: Point, w: number, h: number) => x < 0 || y < 0 || x > w || y > h

/**
 * Zigue-zague a partir de `start` na direção `angle`, até `length` px ou até a borda da tela (o último trecho é cortado
 * exatamente nela). O primeiro trecho sai reto (em leque, sem buracos em volta do impacto); depois o desvio puxa de
 * volta para a direção original: não enrola, e uma rachadura sem limite sempre chega à borda.
 */
function zigzag(rnd: () => number, start: Point, angle: number, length: number, step: number, w: number, h: number): Point[] {
  const points: Point[] = [start]
  let [x, y] = start
  let walked = 0
  let a = angle
  while (walked < length - 1e-6 && points.length < 1000) {
    const s = Math.min(step * (0.6 + 0.8 * rnd()), length - walked)
    if (walked > 0) a = angle + (a - angle) * 0.5 + (rnd() * 2 - 1) * WOBBLE
    const next: Point = [x + Math.cos(a) * s, y + Math.sin(a) * s]
    if (outside(next, w, h)) {
      points.push(clipToBorder([x, y], next, w, h))
      break
    }
    ;[x, y] = next
    walked += s
    points.push(next)
  }
  return points
}

const crack = (kind: Crack['kind'], points: Point[], delay: number, extra: Partial<Crack> = {}): Crack => ({
  kind,
  points,
  length: polylineLength(points),
  delay: Math.min(MAX_DELAY, Math.max(0, delay)),
  span: RETRACT_SHARE,
  ...extra,
})

/** Inversa do smoothstep em [0, 1]. */
const unsmooth = (r: number) => 0.5 - Math.sin(Math.asin(1 - 2 * Math.min(1, Math.max(0, r))) / 3)

/**
 * Trinca da tela `w` × `h` (px) com o impacto em (cx, cy): de ponta a ponta. 11–14 rachaduras radiais em ângulos
 * espalhados por igual (com tremido), cada uma do impacto até a borda da tela — o comprimento sai do retângulo, então
 * funciona do celular em pé ao ultrawide; 3–5 galhos; e 2–3 anéis de fratura perto do impacto, cada vez mais soltos.
 */
export function crackPattern(seed: number, cx: number, cy: number, w: number, h: number): CrackPattern {
  const rnd = mulberry32(seed >>> 0)
  const diag = Math.hypot(w, h)
  const step = STEP * diag
  // o impacto fica dentro da tela (a nave pode estar com a ponta para fora)
  const center: Point = [Math.min(w - 1, Math.max(1, cx)), Math.min(h - 1, Math.max(1, cy))]
  const count = MIN_RAYS + Math.floor(rnd() * (MAX_RAYS - MIN_RAYS + 1))
  const offset = rnd() * 2 * Math.PI
  const rays: Crack[] = []
  const mains: Point[][] = []
  const angles: number[] = []
  for (let i = 0; i < count; i++) {
    const angle = offset + ((i + (rnd() - 0.5) * ANGLE_JITTER) / count) * 2 * Math.PI
    // sem limite de comprimento: anda até a borda
    const points = zigzag(rnd, center, angle, Infinity, step, w, h)
    mains.push(points)
    angles.push(angle)
    rays.push(crack('ray', points, MAX_DELAY * (0.5 + 0.5 * rnd())))
  }
  // galhos: em radiais diferentes, saindo do trecho do meio para um lado
  const branches = MIN_BRANCHES + Math.floor(rnd() * (MAX_BRANCHES - MIN_BRANCHES + 1))
  const order = mains.map((_, i) => i).sort(() => rnd() - 0.5)
  let made = 0
  for (const i of order) {
    if (made >= branches) break
    const points = mains[i]
    if (points.length < 4) continue
    const at = Math.max(1, Math.floor(points.length * (0.25 + 0.35 * rnd())))
    const side = rnd() < 0.5 ? -1 : 1
    const branch = zigzag(rnd, points[at], angles[i] + side * (0.45 + 0.4 * rnd()), diag * (0.08 + 0.08 * rnd()), step * 0.7, w, h)
    if (branch.length < 2) continue
    // A radial se recolhe para o impacto: a ponta visível dela passa pela raiz do galho quando a cura chega a `passes`.
    // O galho começa junto com a cura e termina antes disso (com folga): nunca fica um tracinho solto.
    const parent = rays[i]
    const root = polylineLength(points.slice(0, at + 1))
    const passes = parent.delay + parent.span * unsmooth(1 - root / parent.length)
    rays.push(crack('branch', branch, 0, { span: Math.max(0.02, 0.9 * passes), parent: i, root }))
    made++
  }
  // anéis: pedaços ligando radiais vizinhas na mesma distância, com o meio um pouco para dentro (o vidro afunda)
  const rings: Crack[] = []
  const levels = rnd() < 0.5 ? 2 : 3
  const short = Math.min(w, h)
  for (let li = 0; li < levels; li++) {
    const r = RINGS[li].radius * short * (0.9 + 0.2 * rnd())
    for (let i = 0; i < count; i++) {
      if (rnd() < RINGS[li].gap) continue
      const a = pointAtRadius(mains[i], center[0], center[1], r)
      const b = pointAtRadius(mains[(i + 1) % count], center[0], center[1], r)
      if (!a || !b) continue
      const k = 0.94 - 0.06 * rnd()
      const mid: Point = [center[0] + ((a[0] + b[0]) / 2 - center[0]) * k, center[1] + ((a[1] + b[1]) / 2 - center[1]) * k]
      // o de fora conserta primeiro
      rings.push(crack('ring', [a, mid, b], MAX_DELAY * 0.25 * (1 - li / RINGS.length), { level: li }))
    }
  }
  return { rays, rings }
}

/** Quanto uma rachadura (atraso `delay`, duração `span`) já se recolheu (0..1) quando a cura total está em `heal`. */
export function crackRetraction(heal: number, delay: number, span: number = RETRACT_SHARE): number {
  const u = Math.min(1, Math.max(0, (heal - delay) / span))
  return u * u * (3 - 2 * u)
}
