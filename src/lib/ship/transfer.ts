/**
 * Viagem da nave por transferência de Hohmann, com estilingue gravitacional opcional.
 *
 * Formulação (funções puras, sem Three.js):
 *
 * 1. **Transferência.** Em coordenadas esféricas em torno do sol `S` (que bamboleia no baricentro): distância r,
 *    azimute φ (no plano horizontal, crescendo no sentido das órbitas, o de momento angular +y) e latitude β.
 *    O arco varre Δ em azimute, de φ₁ a φ₂, e a distância segue sempre **cônicas de verdade com o sol no foco**
 *    (ver `transferRadial`), com r monótono de r₁ a r₂:
 *    - |Δ| ≤ 180°: a cônica tangente à órbita de fora (afélio lá) que passa pela de dentro. Com Δ = 180° é a meia
 *      elipse de Hohmann, tangente às duas órbitas.
 *    - |Δ| > 180°: nenhuma cônica monótona varre isso; a nave espera na órbita de saída (círculo) por Δ − 180°, como
 *      uma sonda esperando a janela, e então faz a meia elipse de Hohmann.
 *    Assim o caminho sempre se curva para o lado do sol (u″ + u > 0, u = 1/r), nunca em S, e nunca chega mais perto
 *    do sol que min(r₁, r₂). A latitude interpola a da saída e a da chegada (o plano orbital inclina aos poucos de um
 *    anel para o outro), mais uma subida de altura limitada (o arco "lê" acima do plano dos anéis); a subida muda a
 *    latitude, não o raio.
 *    Um planeta no caminho (qualquer um, com OBSTACLE_MARGIN) faz a subida crescer até o arco passar por cima dele,
 *    como fazia o arco antigo.
 * 2. **Sentido.** Δ é o ângulo no sentido das órbitas (progrado). Se ele passa de MAX_PROGRADE_SWEEP (o alvo está
 *    logo atrás), a nave vai pelo caminho curto, retrógrado: uma sonda esperaria a janela de lançamento; a nave não
 *    espera.
 * 3. **Tempo.** 2ª lei de Kepler: dt ∝ r²·dθ (área varrida constante), então a nave é mais rápida perto do sol.
 *    A integral é feita por Gauss–Legendre e invertida por Newton, de modo que posição e velocidade analítica
 *    concordam. O tempo físico é mapeado na duração limitada de sempre (`travelDuration`, 2–8 s pelo comprimento em CRUISE_SPEED): o perfil de
 *    velocidade é o de Kepler, com queimas suaves só nas pontas (BURN_FRACTION da viagem em cada uma).
 * 4. **Estilingue** (no máximo um por viagem, só por planeta grande, raio ≥ ASSIST_MIN_RADIUS): quando o arco
 *    planejado passa a menos de FLYBY_REACH × o alcance do planeta (planeta + luas), aquele trecho vira uma hipérbole
 *    com foco no planeta, com periápside onde a nave já passaria (no mínimo alcance + FLYBY_MARGIN, se ela ia raspar) e
 *    deflexão da física, δ = 2·asin(1/(1 + r_p·v∞²/μ)), μ = MU_PER_MASS·r³, v∞ = velocidade de cruzeiro. A hipérbole é
 *    costurada (C¹) entre duas transferências: até a entrada e da saída até o destino. Se o caminho com estilingue
 *    falhar em alguma garantia (sol, colisão, volta brusca, desvio > FLYBY_MAX_DETOUR), fica o direto. O sol não dá
 *    estilingue: no referencial dele, passar perto não ganha velocidade nenhuma.
 * 5. **Costura.** Um trecho pode receber uma correção de Hermite curta (BLEND_SECONDS) que leva a velocidade da ponta
 *    à pedida sem mexer na posição das pontas: a troca de destino no meio do voo parte com a velocidade atual (sem
 *    quina) e os trechos do estilingue se emendam com C¹.
 */
import { planetMass } from '../universe/barycenter'
import { SCALE_RATE, type ClockState } from '../universe/clock'
import { planetPosition, type OrbitSystem, type Vec3 } from '../universe/orbits'
import { LAUNCH_MARGIN, minSunDistance, SUN_SAFE_DISTANCE, travelDuration, type GravityAssist, type TravelPath } from './travel'
import { brakeFactor, brakeIntegral, burnPhaseAt, puffSchedule, type BurnPhase, type Puff } from './burn'
import type { CameraFrame } from './cameraFrame'
import { add, cross, dot, length, normalize, scale, sub } from './vec'

/**
 * Quanto da 2ª lei de Kepler fica no relógio (1 = Kepler puro, 0 = velocidade constante): a nave ainda acelera perto
 * do sol, mas o pico fica abaixo de PEAK_SPEED_RATIO × a média da viagem.
 */
export const KEPLER_WEIGHT = 0.6
/** Teto do pico de velocidade de uma viagem sem estilingue, em múltiplos da velocidade média. */
export const PEAK_SPEED_RATIO = 2.3
/** Janela da frenagem (s): a duração do puff de ré, no máximo MAX_BRAKE_FRACTION da viagem. */
export const BRAKE_SECONDS = 0.7
const MAX_BRAKE_FRACTION = 0.3
/** Janela da frenagem (s) de uma viagem de `duration` s. */
const brakeWindowFor = (duration: number) => Math.min(BRAKE_SECONDS, MAX_BRAKE_FRACTION * duration)
/** Fração da viagem gasta em cada queima (partida e chegada): a aceleração fica só nas pontas. */
export const BURN_FRACTION = 0.18
/** Duração (s) da correção que costura a velocidade de um trecho à do vizinho (troca de destino, estilingue). */
export const BLEND_SECONDS = 0.5
/**
 * Janela do empurrão de partida perto da lente (`lens`), em fração da viagem: longa, para a nave continuar se
 * afastando enquanto a transferência assume (uma janela curta "devolveria" o empurrão e a faria voltar para a lente).
 */
export const DEPARTURE_WINDOW = 0.6
/** Velocidade (unidades/s) do empurrão de partida para longe da lente. */
export const DEPARTURE_KICK = 15
/** A transferência sai voltando para a lente (cosseno com a frente da câmera abaixo disto): a saída abre para o lado. */
const DEPARTURE_REVERSAL = -0.5
/** Quanto a saída abre para o lado (ou para cima) nessa volta. */
const DEPARTURE_SWING = 2
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

/** Só planetas a partir deste raio desviam a nave. */
export const ASSIST_MIN_RADIUS = 2
/** Folga do periápside além do alcance do planeta (planeta + luas). */
export const FLYBY_MARGIN = 1.2
/**
 * O arco planejado passa a menos de FLYBY_REACH × o alcance (planeta + luas) de um planeta grande: estilingue.
 * Afinado no perfil de exemplo (4 planetas com raio ≥ 2) para ~10% das viagens; com 2,5× seria ~3,6%.
 */
export const FLYBY_REACH = 4.5
/** Menor fração da viagem de cada trecho do estilingue (ida, sobrevoo, chegada). */
const MIN_SHARE = 0.12
/** Raio da janela do sobrevoo, em periápsides: onde a hipérbole começa e termina. */
export const FLYBY_WINDOW = 1.6
/** O sobrevoo não pode virar desvio: o caminho com estilingue fica até este múltiplo do direto. */
export const FLYBY_MAX_DETOUR = 1.3
/** μ = MU_PER_MASS × massa (massa ∝ raio³, como no baricentro); afinado para δ de ~20° a ~60° nos planetas grandes. */
export const MU_PER_MASS = 200
/** Teto de segurança da deflexão (e ≥ 1,15): a física quase nunca chega aqui. */
export const MAX_DEFLECTION = (120 * Math.PI) / 180

const TAU = Math.PI * 2
const ORIGIN: Vec3 = [0, 0, 0]
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const wrapPi = (x: number) => x - TAU * Math.round(x / TAU)
const dist = (a: Vec3, b: Vec3) => length(sub(a, b))

/** Deflexão (rad) de um sobrevoo hiperbólico: cresce com μ (massa) e cai com o periápside e a velocidade. */
export function flybyDeflection(periapsis: number, speed: number, mu: number): number {
  return 2 * Math.asin(1 / (1 + (periapsis * speed * speed) / mu))
}

/** Tempo da simulação daqui a `seconds` reais, com o relógio desacelerando até parar (alvo 0, como ao focar). */
export function clockTimeAfter(clock: ClockState, seconds: number): number {
  return clock.time + (clock.scale * (1 - Math.exp(-SCALE_RATE * Math.max(0, seconds)))) / SCALE_RATE
}

/** Planeta no caminho: obstáculo; os grandes também dão o estilingue. */
export interface TravelBody {
  name: string
  position: Vec3
  /** Raio do planeta (o caminho não o atravessa; decide o estilingue e a massa). */
  radius: number
  /** Alcance com as luas (o sobrevoo não entra). */
  extent: number
}

/** Planetas nas posições do instante t: obstáculos da viagem; os grandes também podem dar o estilingue. */
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

/**
 * Apsides nas pontas: r₁ em s = 0, r₂ em s = 1, dr/ds = 0 nas duas (ν = π·s). É a meia elipse de Hohmann quando o
 * arco varre 180°; fora disso só é usada para a espera + Hohmann e para varreduras quase nulas.
 */
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

/** Cônica com foco no sol e periélio rp, da anomalia verdadeira ψ₁ (s = 0) a ψ₂ (s = 1). */
function conicRadial(rp: number, e: number, psi1: number, psi2: number): Radial {
  const q = rp * (1 + e)
  const k = psi2 - psi1
  return {
    r: (s) => q / (1 + e * Math.cos(psi1 + k * s)),
    dr: (s) => {
      const psi = psi1 + k * s
      const d = 1 + e * Math.cos(psi)
      return (q * e * Math.sin(psi) * k) / (d * d)
    },
  }
}

/**
 * Lei radial da transferência, sempre de cônicas de verdade com o sol no foco e r monótono:
 * - |Δ| ≤ π: a cônica com o afélio na ponta de fora (tangente à órbita de lá) que passa pela de dentro;
 *   e = (r_o − r_i)/(r_o − r_i·cos Δ), p = r_o·r_i·(1 − cos Δ)/(r_o − r_i·cos Δ). Com Δ = π é a meia elipse de Hohmann
 *   (tangente nas duas). Na ponta de dentro a nave sai (ou chega) com componente radial, como numa partida de Lambert;
 *   é ali que fica a queima.
 * - |Δ| > π: nenhuma cônica monótona varre mais de 180°. A nave espera na órbita de saída (círculo, r = r₁) por
 *   |Δ| − π, como uma sonda esperando a janela, e faz a meia elipse de Hohmann (tangente nas duas pontas).
 * - |Δ| quase zero (só radial): a lei antiga de apsides nas pontas, que também é monótona.
 * `breaks`: onde a lei muda de trecho (o relógio de Kepler integra cada trecho separado).
 */
function transferRadial(r1: number, r2: number, sweep: number): { radial: Radial; breaks: number[] } {
  const span = Math.abs(sweep)
  if (span < 1e-3) return { radial: hohmannRadial(r1, r2), breaks: [] }
  if (span <= Math.PI) {
    const ro = Math.max(r1, r2)
    const ri = Math.min(r1, r2)
    const c = Math.cos(span)
    const e = (ro - ri) / (ro - ri * c)
    const p = (ro * ri * (1 - c)) / (ro - ri * c)
    // para fora: de π − Δ (ponta de dentro) até π (afélio); para dentro: de π até π + Δ
    const psi1 = r2 >= r1 ? Math.PI - span : Math.PI
    return { radial: conicRadial(p / (1 + e), e, psi1, psi1 + span), breaks: [] }
  }
  const sc = (span - Math.PI) / span
  const h = hohmannRadial(r1, r2)
  return {
    radial: {
      r: (s) => (s <= sc ? r1 : h.r((s - sc) / (1 - sc))),
      dr: (s) => (s <= sc ? 0 : h.dr((s - sc) / (1 - sc)) / (1 - sc)),
    },
    breaks: [sc],
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
  /** Onde a lei radial muda de trecho (s). */
  readonly breaks: readonly number[]

  constructor(sun: Vec3, start: Vec3, end: Vec3, phi0: number, sweep: number, beta0: number, beta1: number, lift: number, radial: Radial, breaks: readonly number[] = []) {
    this.sun = sun
    this.start = start
    this.end = end
    this.phi0 = phi0
    this.sweep = sweep
    this.beta0 = beta0
    this.beta1 = beta1
    this.lift = lift
    this.radial = radial
    this.breaks = breaks
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

  private readonly scratch: Vec3 = [0, 0, 0]
  /** Ritmo tabelado em PACE_SAMPLES + 1 pontos (feito na primeira consulta): o relógio consulta muito por quadro. */
  private paceTable: Float64Array | null = null

  /** Ritmo exato (ver `pace`). */
  private paceExact(s: number): number {
    const r = this.radial.r(s)
    const d = this.derivative(s, this.scratch)
    const speed = Math.hypot(d[0], d[1], d[2]) + 1e-9
    return speed ** (1 - KEPLER_WEIGHT) * (r * r) ** KEPLER_WEIGHT
  }

  /**
   * Ritmo do relógio (dt/ds, a menos de constante): a 2ª lei de Kepler (dt ∝ r²·ds, área varrida constante)
   * amaciada por KEPLER_WEIGHT em direção à velocidade constante (dt ∝ |P′|·ds). A velocidade fica ∝ (|P′|/r²)^κ:
   * ainda acelera perto do sol, com teto. Tabelado e interpolado por Catmull-Rom (C¹): barato por quadro, e o
   * relógio integra e deriva a mesma função, então posição e velocidade continuam coerentes.
   */
  pace(s: number): number {
    let table = this.paceTable
    if (!table) {
      table = new Float64Array(PACE_SAMPLES + 1)
      for (let i = 0; i <= PACE_SAMPLES; i++) table[i] = this.paceExact(i / PACE_SAMPLES)
      this.paceTable = table
    }
    const x = clamp(s, 0, 1) * PACE_SAMPLES
    const i = Math.min(PACE_SAMPLES - 1, Math.floor(x))
    const u = x - i
    const p0 = table[Math.max(0, i - 1)]
    const p1 = table[i]
    const p2 = table[i + 1]
    const p3 = table[Math.min(PACE_SAMPLES, i + 2)]
    return p1 + 0.5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0)))
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

/** Pontos da tabela do ritmo do relógio por arco. */
const PACE_SAMPLES = 128

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

/**
 * τ(s) = ∫₀ˢ f / ∫₀¹ f (tempo de Kepler normalizado) e a inversa, consistentes com a derivada exata f/A.
 * Os painéis também quebram em `breaks` (onde f não é suave), para a quadratura continuar exata.
 */
class ArealClock {
  private readonly edges: number[]
  private readonly cum: Float64Array
  private readonly total: number
  private readonly f: (s: number) => number

  constructor(f: (s: number) => number, breaks: readonly number[] = []) {
    this.f = f
    const edges = Array.from({ length: PANELS + 1 }, (_, k) => k / PANELS)
    for (const b of breaks) if (b > 0 && b < 1) edges.push(b)
    this.edges = [...new Set(edges)].sort((x, y) => x - y)
    this.cum = new Float64Array(this.edges.length)
    for (let k = 0; k < this.edges.length - 1; k++) this.cum[k + 1] = this.cum[k] + gauss(f, this.edges[k], this.edges[k + 1])
    this.total = this.cum[this.edges.length - 1]
  }

  private panel(s: number): number {
    let k = 0
    while (k < this.edges.length - 2 && this.edges[k + 1] <= s) k++
    return k
  }

  tau(s: number): number {
    const x = clamp(s, 0, 1)
    const k = this.panel(x)
    return (this.cum[k] + gauss(this.f, this.edges[k], x)) / this.total
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
    const last = this.edges.length - 2
    let k = 0
    while (k < last && this.cum[k + 1] <= target) k++
    const a = this.edges[k]
    let lo = a
    let hi = this.edges[k + 1]
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
 * Tempo normalizado x ∈ [0, 1] → tempo de Kepler τ ∈ [0, 1]: ritmo constante, com a queima de partida (rampa suave)
 * no começo e a frenagem dos puffs no fim (o puff de ré: a velocidade cai numa curva só, ver `brakeFactor`), só nas pontas
 * pedidas. Sem rampa numa ponta, a nave passa por ela em cruzeiro (costura com o vizinho).
 */
class Burn {
  private readonly c: number
  private readonly easeStart: boolean
  /** Puffs da frenagem, em tempo normalizado (vazio: sem frenagem). */
  private readonly brake: readonly Puff[]
  /** Começo da frenagem (x). */
  private readonly xb: number

  constructor(easeStart: boolean, brake: readonly Puff[] = []) {
    this.easeStart = easeStart
    this.brake = brake
    this.xb = brake.length ? brake[0].time : 1
    const b = easeStart ? BURN_FRACTION : 0
    // τ(xb) pelos dois lados: c·(b/2 + xb − b) = 1 − c·∫ freio
    this.c = 1 / (b / 2 + this.xb - b + (brake.length ? brakeIntegral(brake, this.xb, 1) : 0))
  }

  tau(x: number): number {
    const b = BURN_FRACTION
    const c = this.c
    if (x <= 0) return 0
    if (x >= 1) return 1
    if (x > this.xb) return 1 - c * brakeIntegral(this.brake, x, 1)
    if (this.easeStart && x < b) return c * b * smoothRamp(x / b)
    return this.easeStart ? (c * b) / 2 + c * (x - b) : c * x
  }

  /** dτ/dx. */
  rate(x: number): number {
    const b = BURN_FRACTION
    if (x < 0 || x > 1) return 0
    let k = this.c
    if (this.easeStart && x < b) k *= smoothstep(x / b)
    if (x > this.xb) k *= brakeFactor(this.brake, x)
    return k
  }
}

// ————— trechos —————

interface Segment {
  readonly duration: number
  /** Queima no começo / no fim do trecho (s); 0 = passa planando (costura com o vizinho, sobrevoo). */
  readonly startBurn: number
  readonly endBurn: number
  /** Puffs da frenagem no fim do trecho (s desde o começo dele). */
  readonly puffs: readonly Puff[]
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
  /** Janela própria da correção do começo (s); sem ela, `blend`. */
  blendStart?: number
}

/** Arco no tempo: Kepler + queimas, mais as correções que casam a velocidade das pontas com a pedida. */
class ArcSegment implements Segment {
  private readonly clock: ArealClock
  private readonly burn: Burn
  private readonly tb: number
  private readonly tbStart: number
  private readonly dStart: Vec3 | null
  private readonly dEnd: Vec3 | null
  readonly arc: PolarArc
  readonly duration: number
  readonly startBurn: number
  readonly endBurn: number
  /** Puffs da frenagem (s desde o começo do trecho). */
  readonly puffs: readonly Puff[]

  /** `ease.brake`: janela da frenagem (s) quando o trecho é só o fim da viagem (o último depois do estilingue). */
  constructor(arc: PolarArc, duration: number, ease: { start: boolean; end: boolean; brake?: number }, match: Match = {}) {
    this.arc = arc
    this.duration = duration
    this.clock = new ArealClock((s) => arc.pace(s), arc.breaks)
    // frenagem: o puff de ré, numa janela de BRAKE_SECONDS (no máximo MAX_BRAKE_FRACTION do trecho)
    const brakeWindow = ease.end ? Math.min(ease.brake ?? brakeWindowFor(duration), 0.85 * duration) : 0
    this.puffs = ease.end ? puffSchedule(duration - brakeWindow, duration) : []
    this.burn = new Burn(
      ease.start,
      this.puffs.map((p) => ({ time: p.time / duration, duration: p.duration / duration, strength: p.strength })),
    )
    this.tb = Math.min(match.blend ?? BLEND_SECONDS, 0.45 * duration)
    this.tbStart = Math.min(match.blendStart ?? this.tb, (match.end ? 0.45 : 0.75) * duration)
    this.dStart = match.start ? sub(match.start, this.baseVelocity(0, [0, 0, 0])) : null
    this.dEnd = match.end ? sub(match.end, this.baseVelocity(duration, [0, 0, 0])) : null
    // Partida parada: a rampa da queima. Partida em voo (troca de destino): a correção que leva a velocidade atual à
    // do arco novo é a queima. A correção do fim só costura com o sobrevoo (de graça, sem queima).
    this.startBurn = ease.start ? BURN_FRACTION * duration : match.start ? this.tbStart : 0
    this.endBurn = brakeWindow
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
    if (this.dStart) addScaled(out, this.dStart, blend(t, this.tbStart))
    if (this.dEnd) addScaled(out, this.dEnd, -blend(this.duration - t, this.tb))
    return out
  }

  velocity(t: number, out: Vec3): Vec3 {
    this.baseVelocity(t, out)
    if (this.dStart) addScaled(out, this.dStart, blendRate(t, this.tbStart))
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

/** Equação de Kepler hiperbólica M = e·sinh F − F (e > 1), por Newton com salvaguarda. */
function solveHyperbolic(M: number, e: number): number {
  const sign = Math.sign(M)
  const m = Math.abs(M)
  let lo = 0
  let hi = Math.asinh(m / (e - 1)) + 1e-9
  let F = Math.min(hi, Math.asinh(m / e))
  for (let i = 0; i < 60; i++) {
    const f = e * Math.sinh(F) - F - m
    if (Math.abs(f) < 1e-14 * Math.max(1, m)) break
    if (f > 0) hi = F
    else lo = F
    let next = F - f / (e * Math.cosh(F) - 1)
    if (!(next > lo && next < hi)) next = (lo + hi) / 2
    F = next
  }
  return sign * F
}

/**
 * Trecho de hipérbole com foco em `center`: B + a(e − cosh F)·P + a·√(e²−1)·sinh F·Q, de F = −Fw a +Fw, com o tempo
 * linear na anomalia média (2ª lei de Kepler: acelera no periápside).
 */
class HyperbolaSegment implements Segment {
  private readonly k: number
  private readonly mw: number
  readonly center: Vec3
  readonly P: Vec3
  readonly Q: Vec3
  readonly a: number
  readonly e: number
  readonly duration: number
  /** Sobrevoo: só gravidade (motor na chama-piloto). */
  readonly startBurn = 0
  readonly endBurn = 0
  readonly puffs: readonly Puff[] = []

  constructor(center: Vec3, P: Vec3, Q: Vec3, a: number, e: number, fw: number, duration: number) {
    this.center = center
    this.P = P
    this.Q = Q
    this.a = a
    this.e = e
    this.duration = duration
    this.k = Math.sqrt(e * e - 1)
    this.mw = e * Math.sinh(fw) - fw
  }

  private anomaly(t: number): number {
    const u = clamp(t / this.duration, 0, 1)
    return solveHyperbolic(this.mw * (2 * u - 1), this.e)
  }

  point(t: number, out: Vec3): Vec3 {
    const F = this.anomaly(t)
    const x = this.a * (this.e - Math.cosh(F))
    const y = this.a * this.k * Math.sinh(F)
    for (let i = 0; i < 3; i++) out[i] = this.center[i] + x * this.P[i] + y * this.Q[i]
    return out
  }

  velocity(t: number, out: Vec3): Vec3 {
    const F = this.anomaly(t)
    const dF = (2 * this.mw) / this.duration / (this.e * Math.cosh(F) - 1)
    const x = -this.a * Math.sinh(F) * dF
    const y = this.a * this.k * Math.cosh(F) * dF
    for (let i = 0; i < 3; i++) out[i] = x * this.P[i] + y * this.Q[i]
    return out
  }
}

/** Trechos em sequência. `duration` fixa o total (sem o erro de arredondamento da soma). */
function compose(segments: Segment[], assist: GravityAssist | null, duration?: number): TravelPath {
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
  // as queimas são só as das pontas da viagem; as janelas nunca se cruzam
  const departure = Math.min(segments[0].startBurn, total)
  const last = segments[segments.length - 1]
  const arrival = Math.max(total - last.endBurn, departure)
  return {
    duration: total,
    assist,
    burns: { departure, arrival, puffs: last.puffs.map((p) => ({ ...p, time: p.time + total - last.duration })) },
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

// ————— queimas visíveis —————

/** Fase do motor da viagem no instante `t` (s desde a partida): ver `burnPhaseAt` em burn.ts. */
export function burnPhase(path: TravelPath, t: number): BurnPhase {
  return burnPhaseAt(path.burns, path.duration, t)
}

// ————— planejamento —————

export interface TransferOptions {
  /** Centro do sol (bamboleia em torno do baricentro, a origem). */
  sun?: Vec3
  /** Velocidade atual (troca de destino no meio do voo): a nova viagem parte com ela. */
  velocity?: Vec3 | null
  /**
   * Referencial da câmera, quando a nave parte (parada) perto da lente (ex.: da visita em primeiro plano): ela sai
   * primeiro para longe da lente (`departureFromLens`) e só depois segue a transferência. Ignorado com `velocity`.
   */
  lens?: CameraFrame | null
  /** Planetas (ver `travelBodies`): obstáculos; os de raio ≥ ASSIST_MIN_RADIUS também dão o estilingue. */
  bodies?: readonly TravelBody[]
  /** Nome do planeta de destino (não serve de estilingue). */
  exclude?: string | null
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
  const { radial, breaks } = transferRadial(Math.max(a.r, 1e-6), Math.max(b.r, 1e-6), d)
  return new PolarArc(sun, from, to, phiA, d, a.beta, b.beta, liftScale * liftHeight(dist(from, to)), radial, breaks)
}

/** Nenhuma virada brusca: direções de velocidade vizinhas nunca se afastam mais de 60°. */
function smooth(path: TravelPath, n = 300): boolean {
  let prev: Vec3 | null = null
  for (let i = 0; i <= n; i++) {
    const v = path.velocity((i / n) * path.duration)
    const l = length(v)
    if (l < 1e-6) continue
    if (prev && dot(prev, v) < 0.5 * length(prev) * l) return false
    prev = v
  }
  return true
}

interface Plan {
  from: Vec3
  to: Vec3
  sun: Vec3
  base: PolarArc
  /** Velocidade de cruzeiro do caminho direto (v∞ dos sobrevoos). */
  cruise: number
  baseLength: number
  /** Velocidade de um voo em curso (troca de destino); a base então parte em cruzeiro. */
  v0: Vec3 | null
  /** Partida parada perto da lente: o empurrão de partida sai deste referencial. */
  lens: CameraFrame | null
  /** Distância mínima ao sol que o caminho precisa respeitar. */
  minSun: number
  /** Planetas que o caminho não pode atravessar. */
  obstacles: readonly TravelBody[]
}

/** O caminho atravessa algum planeta (fora `skip`)? */
function hitsPlanet(path: TravelPath, obstacles: readonly TravelBody[], skip?: string, n = 300): boolean {
  if (!obstacles.length) return false
  const p: Vec3 = [0, 0, 0]
  for (let i = 0; i <= n; i++) {
    path.point((i / n) * path.duration, p)
    for (const o of obstacles) if (o.name !== skip && dist(p, o.position) < o.radius + OBSTACLE_MARGIN) return true
  }
  return false
}

/**
 * Empurrão de partida perto da lente: para a frente da câmera (longe dela) e para o lado em que a transferência vai.
 * Se a transferência sai voltando para a lente, a saída abre bem para o lado (ou para cima): a volta vira um arco largo
 * em volta da câmera, e a câmera de perseguição não precisa cruzar a nave.
 */
export function departureFromLens(lens: CameraFrame, tangent: Vec3, speed = DEPARTURE_KICK): Vec3 {
  const forward = scale(lens.back, -1)
  const t = normalize(tangent, forward)
  const along = dot(t, forward)
  let lateral = along < 0 ? sub(t, scale(forward, along)) : t
  if (along < DEPARTURE_REVERSAL) {
    const l = length(lateral)
    const side = l > 0.3 ? normalize(lateral) : lens.up
    lateral = add(l > 0.3 ? normalize(lateral) : [0, 0, 0], scale(side, DEPARTURE_SWING))
  }
  return scale(normalize(add(lateral, forward), forward), speed)
}

/** Como o trecho começa: com a velocidade do voo em curso, com o empurrão para longe da lente, ou da queima parada. */
function startOf(plan: Plan, arc: PolarArc, duration: number): { v0: Vec3 | null; blendStart?: number } {
  if (plan.v0) return { v0: plan.v0 }
  if (!plan.lens) return { v0: null }
  return { v0: departureFromLens(plan.lens, arc.derivative(0)), blendStart: DEPARTURE_WINDOW * duration }
}

function direct(plan: Plan): TravelPath {
  const { from, to, sun, base, minSun, obstacles } = plan
  let fallback: TravelPath | null = null
  // Um planeta no caminho: o arco sobe mais até passar por cima dele (como o arco antigo), até um limite.
  for (const lift of LIFT_STEPS) {
    const arc = lift === 1 ? base : transferArc(from, to, sun, base.sweep, lift)
    const T = travelDuration(arcLength(arc))
    // Partindo em movimento, a mistura que leva a velocidade atual à do arco é encurtada se chegar perto do sol.
    let path: TravelPath | null = null
    for (const k of [1, 0.5, 0.25, 0.1]) {
      const { v0, ...start } = startOf(plan, arc, T)
      const attempt = compose([new ArcSegment(arc, T, { start: !plan.v0, end: true }, { start: v0, blend: BLEND_SECONDS * k, blendStart: start.blendStart && start.blendStart * k })], null)
      if (!v0 || minSunDistance(attempt, sun, 400) >= minSun) {
        path = attempt
        break
      }
    }
    path ??= compose([new ArcSegment(arc, T, { start: true, end: true })], null)
    fallback ??= path
    if (!hitsPlanet(path, obstacles)) return path
  }
  return fallback!
}

/** Componente de v perpendicular a d, unitária (ou o "para cima" perpendicular, se v ∥ d). */
function perpendicular(v: Vec3, d: Vec3): Vec3 {
  const p = sub(v, scale(d, dot(v, d)))
  if (length(p) > 1e-6) return normalize(p)
  const up = sub([0, 1, 0], scale(d, d[1]))
  return normalize(length(up) > 1e-6 ? up : cross(d, [1, 0, 0]))
}

/** Gira v em torno do eixo unitário n (perpendicular a v) pelo ângulo a. */
function rotate(v: Vec3, n: Vec3, a: number): Vec3 {
  return add(scale(v, Math.cos(a)), scale(cross(n, v), Math.sin(a)))
}

function planetFlyby(plan: Plan, bodies: readonly TravelBody[], exclude: string | null): TravelPath | null {
  const { from, to, sun, base, cruise, baseLength, minSun } = plan
  const n = 160
  const pts = Array.from({ length: n + 1 }, (_, i) => base.point(i / n))
  let pick: { body: TravelBody; s: number; pass: number } | null = null
  for (const body of bodies) {
    if (body.radius < ASSIST_MIN_RADIUS || body.name === exclude) continue
    let best = Infinity
    let at = 0
    pts.forEach((p, i) => {
      const d = dist(p, body.position)
      if (d < best) {
        best = d
        at = i / n
      }
    })
    if (best > FLYBY_REACH * body.extent || at < 0.1 || at > 0.9) continue
    // perto de uma das pontas não há espaço para a hipérbole (é o planeta de onde a nave sai, por exemplo)
    const window = FLYBY_WINDOW * Math.max(body.extent + FLYBY_MARGIN, best)
    if (dist(from, body.position) < window + 2 || dist(to, body.position) < window + 2) continue
    if (!pick || best / body.extent < pick.pass / pick.body.extent) pick = { body, s: at, pass: best }
  }
  if (!pick) return null

  const { body, s, pass } = pick
  const B = body.position
  // Periápside onde a nave já ia passar (a gravidade só curva o caminho); se ela ia raspar, o mínimo seguro.
  const rp = Math.max(body.extent + FLYBY_MARGIN, pass)
  const window = FLYBY_WINDOW * rp
  const dIn = normalize(base.derivative(s))
  const offset = sub(base.point(s), B)
  const clears = pass >= body.extent + FLYBY_MARGIN
  // Passa do lado em que já passava; se ia raspar, do lado oposto ao destino (a gravidade curva para ele).
  const toTarget = sub(to, B)
  const across = sub(toTarget, scale(dIn, dot(toTarget, dIn)))
  const side = clears || length(across) < 0.2 * length(toTarget) ? perpendicular(offset, dIn) : scale(normalize(across), -1)
  const axis = normalize(cross(side, dIn))
  // δ = 2·asin(1/(1 + r_p·v∞²/μ)): cresce com a massa, cai com a distância e a velocidade (só um teto de segurança).
  const mu = MU_PER_MASS * planetMass(body.radius)
  const delta = Math.min(flybyDeflection(rp, cruise, mu), MAX_DEFLECTION)
  const e = 1 / Math.sin(delta / 2)
  const a = rp / (e - 1)
  const dOut = rotate(dIn, axis, delta)
  const P = normalize(sub(dIn, dOut))
  const Q = normalize(add(dIn, dOut))
  const fw = Math.acosh(Math.max(1, (window / a + 1) / e))
  const probe = new HyperbolaSegment(B, P, Q, a, e, fw, 1)
  const wIn = probe.point(0, [0, 0, 0])
  const wOut = probe.point(1, [0, 0, 0])

  // Transferências até a entrada e da saída até o destino, no mesmo sentido do arco direto.
  const phiIn = polar(wIn, sun).phi
  const phiOut = polar(wOut, sun).phi
  const phiEnd = base.phi0 + base.sweep
  const sweepA = s * base.sweep + wrapPi(phiIn - (base.phi0 + s * base.sweep))
  const sweepB = (1 - s) * base.sweep + wrapPi(phiEnd - (phiOut + (1 - s) * base.sweep))
  const arcA = transferArc(from, wIn, sun, sweepA)
  const arcB = transferArc(wOut, to, sun, sweepB)
  // Partindo perto da lente com a primeira perna voltando para ela: o trecho até a hipérbole é curto demais para a
  // saída abrir em volta da câmera; fica o caminho direto (que abre).
  if (plan.lens && dot(normalize(arcA.derivative(0)), scale(plan.lens.back, -1)) < DEPARTURE_REVERSAL) return null

  // Durações que casam as velocidades nas costuras: cada trecho anda a k/T, então T ∝ k.
  const kA = length(new ArcSegment(arcA, 1, { start: !plan.v0, end: false }).baseVelocity(1, [0, 0, 0]))
  const kB = length(new ArcSegment(arcB, 1, { start: false, end: true }).baseVelocity(0, [0, 0, 0]))
  const kH = length(probe.velocity(0, [0, 0, 0]))
  const total = travelDuration(arcLength(arcA) + arcLength({ point: (u: number, out?: Vec3) => probe.point(u, out ?? [0, 0, 0]) }) + arcLength(arcB))
  const shares = [kA, kH, kB].map((k) => Math.max(k / (kA + kH + kB), MIN_SHARE))
  const sum = shares[0] + shares[1] + shares[2]
  let tA = (total * shares[0]) / sum
  let tB = (total * shares[2]) / sum
  // O último trecho leva a costura da hipérbole e o puff inteiro (nunca menos que PUFF_MIN_SECONDS): se ele ficou
  // curto, tira o tempo que falta dos outros dois, na proporção; se não couber, fica o caminho direto.
  const minB = BLEND_SECONDS + brakeWindowFor(total)
  if (tB < minB) {
    const rest = total - tB
    const take = minB - tB
    if (rest - take < 2 * MIN_SHARE * total) return null
    tA -= (take * tA) / rest
    tB = minB
  }
  const tH = total - tA - tB
  if (tA < MIN_SHARE * total || tH < MIN_SHARE * total) return null

  const hyper = new HyperbolaSegment(B, P, Q, a, e, fw, tH)
  const startA = startOf(plan, arcA, tA)
  const legA = new ArcSegment(arcA, tA, { start: !plan.v0, end: false }, { start: startA.v0, blendStart: startA.blendStart, end: hyper.velocity(0, [0, 0, 0]) })
  // a frenagem é a da viagem toda, no último trecho
  const legB = new ArcSegment(arcB, tB, { start: false, end: true, brake: brakeWindowFor(total) }, { start: hyper.velocity(tH, [0, 0, 0]) })
  const assist: GravityAssist = { body: body.name, center: B, periapsis: rp, deflection: delta, start: tA, peak: tA + tH / 2, end: tA + tH }
  const path = compose([legA, hyper, legB], assist, total)

  const clear =
    minSunDistance(path, sun, 400) >= minSun && minSunDistance(path, B, 400) >= body.extent + FLYBY_MARGIN / 2 && !hitsPlanet(path, plan.obstacles, body.name)
  const length2 = arcLength({ point: (u: number, out?: Vec3) => path.point(u * path.duration, out) }, 200)
  return clear && smooth(path) && length2 <= FLYBY_MAX_DETOUR * baseLength ? path : null
}

/**
 * Viagem de `rawFrom` até `to`: transferência de Hohmann (com o sol em `options.sun`), com no máximo um estilingue
 * (planeta grande de `options.bodies`). Uma saída de dentro do raio seguro é empurrada para fora antes.
 * Garantias: começa em `from` e termina em `to`; posição e velocidade contínuas; nunca mais perto do sol que
 * SUN_SAFE_DISTANCE (um destino de dentro do raio seguro também é empurrado para fora).
 */
export function planTransfer(rawFrom: Vec3, rawTo: Vec3, options: TransferOptions = {}): TravelPath {
  const sun = options.sun ?? ORIGIN
  const from = outsideSun(rawFrom, sun)
  const to = outsideSun(rawTo, sun)
  const moving = options.velocity && length(options.velocity) > 1e-6 ? ([...options.velocity] as Vec3) : null
  const v0 = moving
  const base = transferArc(from, to, sun)
  const baseLength = arcLength(base)
  const plan: Plan = {
    from,
    to,
    sun,
    base,
    baseLength,
    cruise: baseLength / travelDuration(baseLength),
    v0,
    lens: moving ? null : (options.lens ?? null),
    minSun: SUN_SAFE_DISTANCE,
    obstacles: options.bodies ?? [],
  }
  return (options.bodies?.length ? planetFlyby(plan, options.bodies, options.exclude ?? null) : null) ?? direct(plan)
}

/**
 * Como `planTransfer`, mas o destino depende do instante de chegada (o alvo anda enquanto o relógio desacelera):
 * a duração depende do caminho e o caminho do destino, então itera algumas vezes até a duração assentar.
 */
export function planTransferTo(rawFrom: Vec3, destinationAt: (seconds: number) => Vec3, options: TransferOptions = {}): TravelPath {
  let path = planTransfer(rawFrom, destinationAt(travelDuration(dist(rawFrom, destinationAt(0)))), options)
  for (let i = 0; i < 6; i++) {
    const next = planTransfer(rawFrom, destinationAt(path.duration), options)
    const settled = Math.abs(next.duration - path.duration) < 1e-3
    path = next
    if (settled) break
  }
  return path
}
