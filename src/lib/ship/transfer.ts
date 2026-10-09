/**
 * Viagem da nave por transferência de Hohmann.
 *
 * Formulação (funções puras, sem Three.js):
 *
 * 1. **Transferência.** Em coordenadas esféricas em torno do sol `S` (que bamboleia no baricentro): distância r,
 *    azimute φ (no plano horizontal, crescendo no sentido das órbitas, o de momento angular +y) e latitude β.
 *    O arco varre Δ em azimute, de φ₁ a φ₂. A distância segue uma **cônica com apsides nas pontas**:
 *    r(ν) = p / (1 + e·cos ν), com ν = π·s (s ∈ [0, 1] ao longo do arco), e = (r₂ − r₁)/(r₁ + r₂) e
 *    p = 2·r₁·r₂/(r₁ + r₂). Com Δ = 180° é exatamente a meia elipse de Hohmann (periélio numa ponta, afélio na outra);
 *    com outros Δ é a mesma lei de distância com a anomalia esticada (ν = π·θ/Δ). Assim r vai de r₁ a r₂ de modo
 *    monótono, dr/dθ = 0 nas duas pontas (tangente às órbitas, quase circulares, de saída e de chegada) e o arco
 *    nunca chega mais perto do sol que min(r₁, r₂). A latitude interpola a da saída e a da chegada (o plano
 *    orbital inclina aos poucos de um anel para o outro), mais uma subida de altura limitada (o arco "lê" acima do
 *    plano dos anéis). A distância ao sol é r(ν) exatamente: a subida muda a latitude, não o raio.
 *    Um planeta no caminho (qualquer um, com OBSTACLE_MARGIN) faz a subida crescer até o arco passar por cima dele,
 *    como fazia o arco antigo.
 * 2. **Sentido.** Δ é o ângulo no sentido das órbitas (progrado). Se ele passa de MAX_PROGRADE_SWEEP (o alvo está
 *    logo atrás), a nave vai pelo caminho curto, retrógrado: uma sonda esperaria a janela de lançamento; a nave não
 *    espera.
 * 3. **Tempo.** 2ª lei de Kepler: dt ∝ r²·dθ (área varrida constante), então a nave é mais rápida perto do sol.
 *    A integral é feita por Gauss–Legendre e invertida por Newton, de modo que posição e velocidade analítica
 *    concordam. O tempo físico é mapeado na duração limitada de sempre (`travelDuration`, 1,5–3 s): o perfil de
 *    velocidade é o de Kepler, com queimas suaves só nas pontas (BURN_FRACTION da viagem em cada uma).
 * 4. **Costura.** Um trecho pode receber uma correção de Hermite curta (BLEND_SECONDS) que leva a velocidade da ponta
 *    à pedida sem mexer na posição das pontas: a troca de destino no meio do voo parte com a velocidade atual (sem
 *    quina).
 */
import { SCALE_RATE, type ClockState } from '../universe/clock'
import { planetPosition, type OrbitSystem, type Vec3 } from '../universe/orbits'
import { LAUNCH_MARGIN, minSunDistance, SUN_SAFE_DISTANCE, travelDuration, type TravelPath } from './travel'
import { add, length, normalize, scale, sub } from './vec'

/** Fração da viagem gasta em cada queima (partida e chegada): a aceleração fica só nas pontas. */
export const BURN_FRACTION = 0.18
/** Duração (s) da correção que leva a velocidade do começo do trecho à pedida (troca de destino no meio do voo). */
export const BLEND_SECONDS = 0.5
/** Maior varredura no sentido das órbitas; além disso o alvo está logo atrás e a nave vai pelo caminho curto. */
export const MAX_PROGRADE_SWEEP = 1.25 * Math.PI
/** Subida acima do plano dos anéis (unidades): proporcional à distância, entre MIN_LIFT e MAX_LIFT. */
export const MIN_LIFT = 1
export const LIFT_PER_UNIT = 0.12
export const MAX_LIFT = 6

/** Folga além do raio de qualquer planeta que o caminho não atravessa (as luas podem passar raspando). */
export const OBSTACLE_MARGIN = 0.6
/** Quanto a subida cresce, por tentativa, para passar por cima de um planeta no caminho direto. */
const LIFT_STEPS = [1, 1.7, 2.8, 4.5]

const TAU = Math.PI * 2
const ORIGIN: Vec3 = [0, 0, 0]
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const dist = (a: Vec3, b: Vec3) => length(sub(a, b))

/** Tempo da simulação daqui a `seconds` reais, com o relógio desacelerando até parar (alvo 0, como ao focar). */
export function clockTimeAfter(clock: ClockState, seconds: number): number {
  return clock.time + (clock.scale * (1 - Math.exp(-SCALE_RATE * Math.max(0, seconds)))) / SCALE_RATE
}

/** Planeta no caminho: obstáculo. */
export interface TravelBody {
  name: string
  position: Vec3
  /** Raio do planeta (o caminho não o atravessa). */
  radius: number
  /** Alcance com as luas. */
  extent: number
}

/** Planetas nas posições do instante t: obstáculos da viagem. */
export function travelBodies(system: OrbitSystem, t: number): TravelBody[] {
  return system.orbits.map((o) => ({ name: o.name, position: planetPosition(system.rings[o.ring], o, t), radius: o.radius, extent: o.extent }))
}

// ————— coordenadas esféricas em torno do sol —————

interface Polar {
  r: number
  rho: number
  beta: number
  phi: number
}

function polar(p: Vec3, sun: Vec3): Polar {
  const dx = p[0] - sun[0]
  const dy = p[1] - sun[1]
  const dz = p[2] - sun[2]
  const rho = Math.hypot(dx, dz)
  // φ cresce de +x para −z: o sentido das órbitas (momento angular +y)
  return { r: Math.hypot(rho, dy), rho, beta: Math.atan2(dy, rho), phi: Math.atan2(-dz, dx) }
}

interface Radial {
  r(s: number): number
  dr(s: number): number
}

/** Cônica com apsides nas pontas: r₁ em s = 0, r₂ em s = 1, dr/ds = 0 nas duas. */
function hohmannRadial(r1: number, r2: number): Radial {
  const e = (r2 - r1) / (r1 + r2)
  const p = (2 * r1 * r2) / (r1 + r2)
  return {
    r: (s) => p / (1 + e * Math.cos(Math.PI * s)),
    dr: (s) => {
      const d = 1 + e * Math.cos(Math.PI * s)
      return (p * e * Math.PI * Math.sin(Math.PI * s)) / (d * d)
    },
  }
}

const liftHeight = (chord: number) => clamp(LIFT_PER_UNIT * chord, MIN_LIFT, MAX_LIFT)

/**
 * Arco em coordenadas esféricas: S + r(s)·u(β(s), φ(s)), com φ linear em s, β interpolada mais a subida
 * β += atan(H·sin(πs)/r) (altura extra ≤ H) e r dado por uma lei radial.
 */
class PolarArc {
  readonly sun: Vec3
  readonly start: Vec3
  readonly end: Vec3
  readonly phi0: number
  readonly sweep: number
  readonly beta0: number
  readonly beta1: number
  readonly lift: number
  readonly radial: Radial

  constructor(sun: Vec3, start: Vec3, end: Vec3, phi0: number, sweep: number, beta0: number, beta1: number, lift: number, radial: Radial) {
    this.sun = sun
    this.start = start
    this.end = end
    this.phi0 = phi0
    this.sweep = sweep
    this.beta0 = beta0
    this.beta1 = beta1
    this.lift = lift
    this.radial = radial
  }

  private beta(s: number, r: number, dr: number): [number, number] {
    const w = (this.lift * Math.sin(Math.PI * s)) / r
    const dw = (this.lift * (Math.PI * Math.cos(Math.PI * s) * r - Math.sin(Math.PI * s) * dr)) / (r * r)
    return [this.beta0 + (this.beta1 - this.beta0) * s + Math.atan(w), this.beta1 - this.beta0 + dw / (1 + w * w)]
  }

  point(s: number, out: Vec3 = [0, 0, 0]): Vec3 {
    // pontas exatas (o resto do arco é contínuo com elas a menos de arredondamento)
    if (s <= 0 || s >= 1) {
      const p = s <= 0 ? this.start : this.end
      out[0] = p[0]
      out[1] = p[1]
      out[2] = p[2]
      return out
    }
    const r = this.radial.r(s)
    const [b] = this.beta(s, r, this.radial.dr(s))
    const f = this.phi0 + this.sweep * s
    const cb = Math.cos(b)
    out[0] = this.sun[0] + r * cb * Math.cos(f)
    out[1] = this.sun[1] + r * Math.sin(b)
    out[2] = this.sun[2] - r * cb * Math.sin(f)
    return out
  }

  /** dP/ds. */
  derivative(s: number, out: Vec3 = [0, 0, 0]): Vec3 {
    const r = this.radial.r(s)
    const dr = this.radial.dr(s)
    const [b, db] = this.beta(s, r, dr)
    const f = this.phi0 + this.sweep * s
    const cb = Math.cos(b)
    const sb = Math.sin(b)
    const cf = Math.cos(f)
    const sf = Math.sin(f)
    const df = this.sweep
    // d(r·u) = dr·u + r·(β'·∂u/∂β + φ'·∂u/∂φ)
    out[0] = dr * cb * cf + r * (db * -sb * cf + df * -cb * sf)
    out[1] = dr * sb + r * db * cb
    out[2] = -dr * cb * sf + r * (db * sb * sf + df * -cb * cf)
    return out
  }

  /** Integrando da 2ª lei de Kepler (área varrida por unidade de s, a menos de constante). */
  areal(s: number): number {
    const r = this.radial.r(s)
    return r * r
  }
}

function arcLength(arc: { point(s: number, out?: Vec3): Vec3 }, n = 96): number {
  let total = 0
  let prev = arc.point(0)
  for (let i = 1; i <= n; i++) {
    const p = arc.point(i / n)
    total += dist(p, prev)
    prev = p
  }
  return total
}

// ————— tempo: 2ª lei de Kepler e queimas —————

const GL_X = [-0.9602898564975363, -0.7966664774136267, -0.525532409916329, -0.1834346424956498, 0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363]
const GL_W = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.362683783378362, 0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763]

function gauss(f: (s: number) => number, a: number, b: number): number {
  const m = (a + b) / 2
  const h = (b - a) / 2
  let sum = 0
  for (let i = 0; i < 8; i++) sum += GL_W[i] * f(m + h * GL_X[i])
  return sum * h
}

const PANELS = 16

/** τ(s) = ∫₀ˢ f / ∫₀¹ f (tempo de Kepler normalizado) e a inversa, consistentes com a derivada exata f/A. */
class ArealClock {
  private readonly cum = new Float64Array(PANELS + 1)
  private readonly total: number
  private readonly f: (s: number) => number

  constructor(f: (s: number) => number) {
    this.f = f
    for (let k = 0; k < PANELS; k++) this.cum[k + 1] = this.cum[k] + gauss(f, k / PANELS, (k + 1) / PANELS)
    this.total = this.cum[PANELS]
  }

  tau(s: number): number {
    const x = clamp(s, 0, 1)
    const k = Math.min(PANELS - 1, Math.floor(x * PANELS))
    return (this.cum[k] + gauss(this.f, k / PANELS, x)) / this.total
  }

  /** dτ/ds. */
  rate(s: number): number {
    return this.f(s) / this.total
  }

  /** s(τ): Newton com salvaguarda de bissecção dentro do painel. */
  s(tau: number): number {
    if (tau <= 0) return 0
    if (tau >= 1) return 1
    const target = tau * this.total
    let k = 0
    while (k < PANELS - 1 && this.cum[k + 1] <= target) k++
    const a = k / PANELS
    let lo = a
    let hi = (k + 1) / PANELS
    let s = lo + ((target - this.cum[k]) / (this.cum[k + 1] - this.cum[k])) * (hi - lo)
    for (let i = 0; i < 40; i++) {
      const g = this.cum[k] + gauss(this.f, a, s) - target
      if (Math.abs(g) <= 1e-15 * this.total) break
      if (g > 0) hi = s
      else lo = s
      let next = s - g / this.f(s)
      if (!(next > lo && next < hi)) next = (lo + hi) / 2
      if (Math.abs(next - s) < 1e-16) break
      s = next
    }
    return s
  }
}

const smoothstep = (y: number) => y * y * (3 - 2 * y)
/** ∫₀ʸ smoothstep. */
const smoothRamp = (y: number) => y * y * y - (y * y * y * y) / 2

/**
 * Tempo normalizado x ∈ [0, 1] → tempo de Kepler τ ∈ [0, 1]: ritmo constante, com rampa suave (queima) só nas
 * pontas pedidas. Sem rampa numa ponta, a nave passa por ela em cruzeiro (costura com o vizinho).
 */
class Burn {
  private readonly c: number
  private readonly easeStart: boolean
  private readonly easeEnd: boolean

  constructor(easeStart: boolean, easeEnd: boolean) {
    this.easeStart = easeStart
    this.easeEnd = easeEnd
    this.c = 1 / (1 - (BURN_FRACTION * (Number(easeStart) + Number(easeEnd))) / 2)
  }

  tau(x: number): number {
    const b = BURN_FRACTION
    const c = this.c
    if (x <= 0) return 0
    if (x >= 1) return 1
    if (this.easeEnd && x > 1 - b) return 1 - c * b * smoothRamp((1 - x) / b)
    if (this.easeStart && x < b) return c * b * smoothRamp(x / b)
    return this.easeStart ? (c * b) / 2 + c * (x - b) : c * x
  }

  /** dτ/dx. */
  rate(x: number): number {
    const b = BURN_FRACTION
    if (x < 0 || x > 1) return 0
    let k = this.c
    if (this.easeStart && x < b) k *= smoothstep(x / b)
    if (this.easeEnd && x > 1 - b) k *= smoothstep((1 - x) / b)
    return k
  }
}

// ————— trechos —————

interface Segment {
  readonly duration: number
  point(t: number, out: Vec3): Vec3
  velocity(t: number, out: Vec3): Vec3
}

/** Correção de Hermite: g(0) = 0, g'(0) = 1, e g = g' = 0 a partir de tb. */
const blend = (t: number, tb: number) => (t > 0 && t < tb ? t * (1 - t / tb) ** 2 : 0)
const blendRate = (t: number, tb: number) => (t >= 0 && t < tb ? (1 - t / tb) * (1 - (3 * t) / tb) : 0)

interface Match {
  /** Velocidade pedida no começo / no fim (unidades/s); sem ela, a do próprio arco. */
  start?: Vec3 | null
  end?: Vec3 | null
  blend?: number
}

/** Arco no tempo: Kepler + queimas, mais as correções que casam a velocidade das pontas com a pedida. */
class ArcSegment implements Segment {
  private readonly clock: ArealClock
  private readonly burn: Burn
  private readonly tb: number
  private readonly dStart: Vec3 | null
  private readonly dEnd: Vec3 | null
  readonly arc: PolarArc
  readonly duration: number

  constructor(arc: PolarArc, duration: number, ease: { start: boolean; end: boolean }, match: Match = {}) {
    this.arc = arc
    this.duration = duration
    this.clock = new ArealClock((s) => arc.areal(s))
    this.burn = new Burn(ease.start, ease.end)
    this.tb = Math.min(match.blend ?? BLEND_SECONDS, 0.45 * duration)
    this.dStart = match.start ? sub(match.start, this.baseVelocity(0, [0, 0, 0])) : null
    this.dEnd = match.end ? sub(match.end, this.baseVelocity(duration, [0, 0, 0])) : null
  }

  private param(t: number): [number, number] {
    const x = clamp(t / this.duration, 0, 1)
    return [x, this.clock.s(this.burn.tau(x))]
  }

  /** Velocidade do arco sem as correções. */
  baseVelocity(t: number, out: Vec3): Vec3 {
    const [x, s] = this.param(t)
    this.arc.derivative(s, out)
    const k = this.burn.rate(x) / (this.clock.rate(s) * this.duration)
    out[0] *= k
    out[1] *= k
    out[2] *= k
    return out
  }

  point(t: number, out: Vec3): Vec3 {
    const [, s] = this.param(t)
    this.arc.point(s, out)
    if (this.dStart) addScaled(out, this.dStart, blend(t, this.tb))
    if (this.dEnd) addScaled(out, this.dEnd, -blend(this.duration - t, this.tb))
    return out
  }

  velocity(t: number, out: Vec3): Vec3 {
    this.baseVelocity(t, out)
    if (this.dStart) addScaled(out, this.dStart, blendRate(t, this.tb))
    if (this.dEnd) addScaled(out, this.dEnd, blendRate(this.duration - t, this.tb))
    return out
  }
}

function addScaled(out: Vec3, v: Vec3, k: number) {
  if (k === 0) return
  out[0] += v[0] * k
  out[1] += v[1] * k
  out[2] += v[2] * k
}

/** Trechos em sequência. `duration` fixa o total (sem o erro de arredondamento da soma). */
function compose(segments: Segment[], duration?: number): TravelPath {
  const starts: number[] = []
  let sum = 0
  for (const s of segments) {
    starts.push(sum)
    sum += s.duration
  }
  const total = duration ?? sum
  const find = (t: number) => {
    let i = segments.length - 1
    while (i > 0 && t < starts[i]) i--
    return i
  }
  return {
    duration: total,
    point(t, out = [0, 0, 0]) {
      const c = clamp(t, 0, total)
      const i = find(c)
      return segments[i].point(c - starts[i], out)
    },
    velocity(t, out = [0, 0, 0]) {
      if (!(t >= 0 && t <= total)) {
        out[0] = 0
        out[1] = 0
        out[2] = 0
        return out
      }
      const i = find(t)
      return segments[i].velocity(t - starts[i], out)
    },
  }
}

// ————— planejamento —————

export interface TransferOptions {
  /** Centro do sol (bamboleia em torno do baricentro, a origem). */
  sun?: Vec3
  /** Velocidade atual (troca de destino no meio do voo): a nova viagem parte com ela. */
  velocity?: Vec3 | null
  /** Planetas (ver `travelBodies`): obstáculos que o caminho não atravessa. */
  bodies?: readonly TravelBody[]
}

/** Ponto de dentro do raio seguro do sol empurrado radialmente para fora (no centro exato, para cima). */
function outsideSun(p: Vec3, sun: Vec3): Vec3 {
  const d = sub(p, sun)
  return length(d) < SUN_SAFE_DISTANCE ? add(sun, scale(normalize(d, [0, 1, 0]), SUN_SAFE_DISTANCE + LAUNCH_MARGIN)) : p
}

function chooseSweep(dphi: number): number {
  const d = ((dphi % TAU) + TAU) % TAU
  return d <= MAX_PROGRADE_SWEEP ? d : d - TAU
}

function transferArc(from: Vec3, to: Vec3, sun: Vec3, sweep?: number, liftScale = 1): PolarArc {
  const a = polar(from, sun)
  const b = polar(to, sun)
  const phiA = a.rho > 1e-9 ? a.phi : b.phi
  const phiB = b.rho > 1e-9 ? b.phi : phiA
  const d = sweep ?? chooseSweep(phiB - phiA)
  return new PolarArc(sun, from, to, phiA, d, a.beta, b.beta, liftScale * liftHeight(dist(from, to)), hohmannRadial(Math.max(a.r, 1e-6), Math.max(b.r, 1e-6)))
}

interface Plan {
  from: Vec3
  to: Vec3
  sun: Vec3
  base: PolarArc
  v0: Vec3 | null
  /** Distância mínima ao sol que o caminho precisa respeitar. */
  minSun: number
  /** Planetas que o caminho não pode atravessar. */
  obstacles: readonly TravelBody[]
}

/** O caminho atravessa algum planeta? */
function hitsPlanet(path: TravelPath, obstacles: readonly TravelBody[], n = 300): boolean {
  if (!obstacles.length) return false
  const p: Vec3 = [0, 0, 0]
  for (let i = 0; i <= n; i++) {
    path.point((i / n) * path.duration, p)
    for (const o of obstacles) if (dist(p, o.position) < o.radius + OBSTACLE_MARGIN) return true
  }
  return false
}

function direct(plan: Plan): TravelPath {
  const { from, to, sun, base, v0, minSun, obstacles } = plan
  let fallback: TravelPath | null = null
  // Um planeta no caminho: o arco sobe mais até passar por cima dele (como o arco antigo), até um limite.
  for (const lift of LIFT_STEPS) {
    const arc = lift === 1 ? base : transferArc(from, to, sun, base.sweep, lift)
    const T = travelDuration(arcLength(arc))
    // Partindo em movimento, a mistura que leva a velocidade atual à do arco é encurtada se chegar perto do sol.
    let path: TravelPath | null = null
    for (const k of [1, 0.5, 0.25, 0.1]) {
      const attempt = compose([new ArcSegment(arc, T, { start: !v0, end: true }, { start: v0, blend: BLEND_SECONDS * k })])
      if (!v0 || minSunDistance(attempt, sun, 400) >= minSun) {
        path = attempt
        break
      }
    }
    path ??= compose([new ArcSegment(arc, T, { start: true, end: true })])
    fallback ??= path
    if (!hitsPlanet(path, obstacles)) return path
  }
  return fallback!
}

/**
 * Viagem de `rawFrom` até `to`: transferência de Hohmann (com o sol em `options.sun`), passando por cima dos planetas
 * de `options.bodies`. Uma saída de dentro do raio seguro é empurrada para fora antes.
 * Garantias: começa em `from` e termina em `to`; posição e velocidade contínuas; nunca mais perto do sol que
 * min(SUN_SAFE_DISTANCE, distância do destino ao sol) — destinos vêm de `visitPosition`, que já ficam fora.
 */
export function planTransfer(rawFrom: Vec3, to: Vec3, options: TransferOptions = {}): TravelPath {
  const sun = options.sun ?? ORIGIN
  const from = outsideSun(rawFrom, sun)
  const v0 = options.velocity && length(options.velocity) > 1e-6 ? ([...options.velocity] as Vec3) : null
  const base = transferArc(from, to, sun)
  const plan: Plan = {
    from,
    to,
    sun,
    base,
    v0,
    minSun: Math.min(SUN_SAFE_DISTANCE, dist(to, sun)),
    obstacles: options.bodies ?? [],
  }
  return direct(plan)
}

/**
 * Como `planTransfer`, mas o destino depende do instante de chegada (o alvo anda enquanto o relógio desacelera):
 * a duração depende do caminho e o caminho do destino, então itera algumas vezes até a duração assentar.
 */
export function planTransferTo(rawFrom: Vec3, destinationAt: (seconds: number) => Vec3, options: TransferOptions = {}): TravelPath {
  let path = planTransfer(rawFrom, destinationAt(travelDuration(dist(rawFrom, destinationAt(0)))), options)
  for (let i = 0; i < 3; i++) {
    const next = planTransfer(rawFrom, destinationAt(path.duration), options)
    const settled = Math.abs(next.duration - path.duration) < 1e-3
    path = next
    if (settled) break
  }
  return path
}
