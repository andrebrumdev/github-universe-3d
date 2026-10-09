/**
 * Trombada na tela (easter egg): a volta que vem rápido demais. Caminho próprio, separado da volta normal
 * (lib/ship/returnFlight); o ShipRig usa este no lugar dela quando a trombada é sorteada (lib/crash/rarity).
 *
 * Em coordenadas da câmera (ver `cameraFrame`), como a volta normal:
 * 1. **saída**: a mesma da volta normal — parte com a velocidade que tinha e se afasta pela tangente da órbita;
 * 2. **mira**: em vez de passar por trás da câmera, vai a um ponto lá na frente, na mira (perto do centro da tela, um
 *    pouco puxada para o canto da escolta), já virada para a lente;
 * 3. **mergulho**: reta contra a lente, acelerando (motor no máximo, sem frenagem), até a distância mínima da lente
 *    (MIN_SHIP_DISTANCE, a mesma do keepAway: nada atravessa o plano próximo) — o **impacto**, em `duration`;
 * 4. **recuperação**: congela um instante colada no vidro, quica para trás (mola) e volta ao canto da escolta
 *    bambeando, chegando nele parada em `duration + CRASH_RECOVER`.
 * No mundo, o começo fica preso à câmera da hora da volta e o resto à câmera de agora (`blendFramesPoint`).
 */
import type { BurnPhase, BurnWindows } from '../ship/burn'
import { blendFramesPoint, type CameraFrame } from '../ship/cameraFrame'
import { MIN_SHIP_DISTANCE, THREE_QUARTER_YAW } from '../ship/escort'
import { returnDuration } from '../ship/returnFlight'
import { add, cross, dot, length, normalize, scale, sub } from '../ship/vec'
import type { Vec3 } from '../universe/orbits'

/** Quanto a mira sai do centro da tela em direção ao canto da escolta (0 = centro, 1 = o canto). */
export const CRASH_AIM_SHIFT = 0.2
/** Onde começa a reta final: na mira, a este tanto de vezes a distância da escolta. */
export const CRASH_FAR = 7
/** Duração da reta final (s), acelerando até o impacto. */
export const CRASH_STRAIGHT_SECONDS = 1
/** Tempo a mais que a volta normal (s): a ida até a mira lá na frente, antes do mergulho. */
export const CRASH_DETOUR_SECONDS = 0.6
/** Recuperação depois do impacto (s): congela, quica para trás e volta ao canto bambeando. */
export const CRASH_FREEZE = 0.3
export const CRASH_DRIFT_START = 0.9
export const CRASH_RECOVER = 2.6
/** Quanto quica para trás (unidades), e a mola do quique (rad/s, amortecimento). */
export const CRASH_BOUNCE = 0.55
const BOUNCE_OMEGA = 9
const BOUNCE_ZETA = 0.35
/** Fim do puxão pela tangente (fração do voo até o impacto), como na volta normal. */
const T_PULL = 0.18
/** Mistura dos referenciais (preso ao mundo → preso à câmera de agora), em fração do voo até o impacto. */
const BLEND_FROM = 0.15
const BLEND_TO = 0.5

export interface CrashInput {
  /** Onde a nave está, no referencial da câmera da hora da volta. */
  start: Vec3
  /** Velocidade atual (unidades/s, mesmo referencial); zero se parada. */
  velocity: Vec3
  /** Direção unitária em que ela se afasta (tangente da órbita), no mesmo referencial. */
  departure: Vec3
  /** Canto da escolta, no referencial da câmera. */
  escort: Vec3
  /** 1 = canto direito, −1 = esquerdo. */
  side: 1 | -1
}

interface Knot {
  t: number
  p: Vec3
  v: Vec3
}

export interface CrashPlan {
  /** Instante do impacto (s): fim do mergulho. A recuperação vai até `duration + CRASH_RECOVER`. */
  duration: number
  knots: Knot[]
  escort: Vec3
  /** Direção unitária da reta do mergulho, da lente para fora (referencial da câmera). */
  aim: Vec3
  /** Onde bate: na reta, a MIN_SHIP_DISTANCE da lente. */
  impact: Vec3
  /** Quando começa a reta final (s). */
  straightAt: number
  /** Frente de três-quartos no canto (como a escolta) e a direção da primeira saída. */
  face: Vec3
  departure: Vec3
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const smoothstep = (a: number, b: number, x: number) => {
  const u = clamp((x - a) / (b - a), 0, 1)
  return u * u * (3 - 2 * u)
}
const smootherstep = (a: number, b: number, x: number) => {
  const u = clamp((x - a) / (b - a), 0, 1)
  return u * u * u * (u * (u * 6 - 15) + 10)
}

/** Frente de três-quartos, como a escolta no ShipRig (`lookAt` da lente e depois `rotateY(−side·yaw)`). */
function threeQuarter(escort: Vec3, side: 1 | -1): Vec3 {
  const f = normalize(scale(escort, -1))
  const up = normalize(sub([0, 1, 0], scale(f, f[1])), [0, 0, 1])
  const x = cross(up, f)
  const a = -side * THREE_QUARTER_YAW
  return normalize(add(scale(f, Math.cos(a)), scale(x, Math.sin(a))))
}

function hermite(k0: Knot, k1: Knot, t: number, out: Vec3, velocity: boolean): Vec3 {
  const d = k1.t - k0.t
  const u = clamp((t - k0.t) / d, 0, 1)
  const u2 = u * u
  const u3 = u2 * u
  if (!velocity) {
    const h00 = 2 * u3 - 3 * u2 + 1
    const h10 = u3 - 2 * u2 + u
    const h01 = -2 * u3 + 3 * u2
    const h11 = u3 - u2
    for (let k = 0; k < 3; k++) out[k] = h00 * k0.p[k] + h10 * d * k0.v[k] + h01 * k1.p[k] + h11 * d * k1.v[k]
    return out
  }
  const d00 = (6 * u2 - 6 * u) / d
  const d10 = 3 * u2 - 4 * u + 1
  const d01 = (-6 * u2 + 6 * u) / d
  const d11 = 3 * u2 - 2 * u
  for (let k = 0; k < 3; k++) out[k] = d00 * k0.p[k] + d10 * k0.v[k] + d01 * k1.p[k] + d11 * k1.v[k]
  return out
}

function segment(knots: Knot[], t: number): [Knot, Knot] {
  let i = 0
  while (i < knots.length - 2 && t > knots[i + 1].t) i++
  return [knots[i], knots[i + 1]]
}

/** Interpola direções unitárias pelo arco (em torno de y quando são opostas). */
function slerpDir(a: Vec3, b: Vec3, w: number): Vec3 {
  const angle = Math.acos(clamp(dot(a, b), -1, 1))
  if (angle < 1e-6) return b
  let axis = cross(a, b)
  if (length(axis) < 1e-6) axis = [0, 1, 0]
  axis = normalize(axis)
  const th = angle * w
  return normalize(add(add(scale(a, Math.cos(th)), scale(cross(axis, a), Math.sin(th))), scale(axis, dot(axis, a) * (1 - Math.cos(th)))))
}

/** Maior velocidade (amostrada) de 0 a `until`. */
function maxSpeed(knots: Knot[], until: number): number {
  const v: Vec3 = [0, 0, 0]
  let max = 0
  for (let i = 0; i <= 200; i++) {
    const t = (i / 200) * until
    const [a, b] = segment(knots, t)
    max = Math.max(max, length(hermite(a, b, t, v, true)))
  }
  return max
}

/**
 * Planeja a volta com trombada. A duração até o impacto é a da volta normal (`returnDuration`) mais o desvio até a mira. A reta final tem
 * aceleração constante: Hermite com 0,5× e 1,5× a velocidade média nas pontas, ambas na direção da reta, fica nela.
 */
export function planCrash(input: CrashInput): CrashPlan {
  const { start, velocity, escort, side } = input
  // a ida até a mira, lá na frente, é mais longa que a volta normal por trás da câmera
  const T = returnDuration(length(start)) + CRASH_DETOUR_SECONDS
  const D = length(escort)
  const moving = length(velocity) > 1e-6
  // 1. saída pela tangente, sem a parte que aponta para a lente (como a volta normal)
  const toLens = normalize(scale(start, -1))
  const raw = normalize(input.departure, [side, 0, 0])
  const away = sub(raw, scale(toLens, Math.max(0, dot(raw, toLens))))
  const dep = moving ? normalize(velocity) : normalize(away, [side, 0, 0])
  const pullLength = clamp(0.15 * length(start), 0.8, 6)
  const pullTime = T_PULL * T
  const pullSpeed = Math.max((1.6 * pullLength) / pullTime, moving ? length(velocity) * 0.8 : 0)
  // 2–3. a mira e a reta contra a lente
  const aim = normalize(add(scale([0, 0, -1], 1 - CRASH_AIM_SHIFT), scale(normalize(escort), CRASH_AIM_SHIFT)))
  const impact = scale(aim, MIN_SHIP_DISTANCE)
  const straightAt = T - CRASH_STRAIGHT_SECONDS
  const first: Knot = { t: 0, p: [...start], v: moving ? [...velocity] : [0, 0, 0] }
  const second: Knot = { t: pullTime, p: add(start, scale(dep, pullLength)), v: scale(dep, pullSpeed) }
  const build = (reach: number): Knot[] => {
    const average = (reach - MIN_SHIP_DISTANCE) / CRASH_STRAIGHT_SECONDS
    return [first, second, { t: straightAt, p: scale(aim, reach), v: scale(aim, -0.5 * average) }, { t: T, p: impact, v: scale(aim, -1.5 * average) }]
  }
  // "rápido demais": o impacto é o ponto mais rápido do voo. Vindo de uma viagem rápida (ou de uma curva apertada até
  // a mira), a reta fica mais longa até a velocidade final passar a maior de antes dela.
  let reach = CRASH_FAR * D
  let knots = build(reach)
  for (let i = 0; i < 6; i++) {
    const before = maxSpeed(knots, straightAt)
    const final = (1.5 * (reach - MIN_SHIP_DISTANCE)) / CRASH_STRAIGHT_SECONDS
    if (final >= before) break
    reach = MIN_SHIP_DISTANCE + ((1.1 * before) / 1.5) * CRASH_STRAIGHT_SECONDS
    knots = build(reach)
  }
  return { duration: T, knots, escort: [...escort], aim, impact, straightAt, face: threeQuarter(escort, side), departure: dep }
}

/** Duração total (s): o voo até o impacto mais a recuperação (o modo `returning` dura isto). */
export function crashTotal(plan: CrashPlan): number {
  return plan.duration + CRASH_RECOVER
}

/** Mola subamortecida partindo do repouso em 0 rumo a 1 (resposta ao degrau): nunca fica abaixo de 0. */
function springStepResponse(t: number): number {
  if (t <= 0) return 0
  const wd = BOUNCE_OMEGA * Math.sqrt(1 - BOUNCE_ZETA * BOUNCE_ZETA)
  const decay = Math.exp(-BOUNCE_ZETA * BOUNCE_OMEGA * t)
  return 1 - decay * (Math.cos(wd * t) + ((BOUNCE_ZETA * BOUNCE_OMEGA) / wd) * Math.sin(wd * t))
}

/** Peso (0..1) da ida ao canto na recuperação (`r`: s desde o impacto). */
export function crashDriftWeight(r: number): number {
  return smootherstep(CRASH_DRIFT_START, CRASH_RECOVER, r)
}

/** Posição no referencial da câmera em `t` (s desde o começo da volta): voo, impacto e recuperação. */
export function crashLocal(plan: CrashPlan, t: number, out: Vec3 = [0, 0, 0]): Vec3 {
  if (t > plan.duration) {
    const r = t - plan.duration
    const reach = MIN_SHIP_DISTANCE + CRASH_BOUNCE * springStepResponse(r - CRASH_FREEZE)
    const w = crashDriftWeight(r)
    for (let k = 0; k < 3; k++) out[k] = plan.aim[k] * reach * (1 - w) + plan.escort[k] * w
    return out
  }
  const c = Math.max(0, t)
  const [a, b] = segment(plan.knots, c)
  return hermite(a, b, c, out, false)
}

/** Velocidade (unidades/s, referencial da câmera) no voo até o impacto; zero fora dele. */
export function crashLocalVelocity(plan: CrashPlan, t: number, out: Vec3 = [0, 0, 0]): Vec3 {
  if (!(t >= 0 && t <= plan.duration)) {
    out.fill(0)
    return out
  }
  const [a, b] = segment(plan.knots, t)
  return hermite(a, b, t, out, true)
}

/** Peso do referencial da câmera de agora (0 = preso ao mundo da hora da volta, 1 = preso à câmera). */
export function crashBlend(plan: CrashPlan, t: number): number {
  return smoothstep(BLEND_FROM * plan.duration, BLEND_TO * plan.duration, t)
}

/** Posição no mundo: `start` é o referencial da hora da volta, `now` o da câmera (atrasada) deste frame. */
export function crashPoint(plan: CrashPlan, t: number, start: CameraFrame, now: CameraFrame, out: Vec3 = [0, 0, 0]): Vec3 {
  return blendFramesPoint(start, now, crashBlend(plan, t), crashLocal(plan, t), out)
}

/** Peso do "para cima" da câmera na orientação: a reta final já vem de pé na tela. */
export function crashFaceWeight(plan: CrashPlan, t: number): number {
  return smoothstep(plan.straightAt - 0.3, plan.straightAt, t)
}

/**
 * Para onde aponta a frente da nave (referencial da câmera): segue a velocidade até o impacto (na reta, de cara para
 * a lente); depois, de cara para a lente, girando para os três-quartos do canto enquanto volta a ele.
 */
export function crashHeading(plan: CrashPlan, t: number): Vec3 {
  if (t >= plan.duration) return slerpDir(scale(plan.aim, -1), plan.face, crashDriftWeight(t - plan.duration))
  const v = crashLocalVelocity(plan, t)
  return length(v) > 1e-3 ? normalize(v) : plan.departure
}

/** Janelas do motor: queima de partida no puxão, planagem até o mergulho, e nenhuma frenagem (é a graça). */
export function crashBurns(plan: CrashPlan): BurnWindows {
  return { departure: T_PULL * plan.duration, arrival: plan.duration, puffs: [] }
}

/**
 * Fase do motor: partida no puxão, planagem, motor no máximo na reta final; depois do impacto, a chama-piloto (fase
 * de chegada: sem o vapor das asas da planagem).
 */
export function crashBurnPhase(plan: CrashPlan, t: number): BurnPhase {
  if (t >= plan.duration) return { phase: 'arrival', intensity: 0 }
  if (t >= plan.straightAt) return { phase: 'departure', intensity: 1 }
  const departure = T_PULL * plan.duration
  if (t < departure) return { phase: 'departure', intensity: 1 - smoothstep(0.55, 1, Math.max(0, t) / departure) }
  return { phase: 'coast', intensity: 0 }
}

/** Bambeio da nave tonta na recuperação (rad, `r`: s desde o impacto): amortecido, zero ao chegar ao canto. */
export function crashWobble(r: number, out: { roll: number; pitch: number } = { roll: 0, pitch: 0 }): { roll: number; pitch: number } {
  if (!(r > CRASH_FREEZE && r < CRASH_RECOVER)) {
    out.roll = 0
    out.pitch = 0
    return out
  }
  const u = r - CRASH_FREEZE
  const fade = Math.exp(-0.9 * u) * (1 - smootherstep(CRASH_RECOVER - 0.6, CRASH_RECOVER, r))
  out.roll = 0.35 * Math.sin(2 * Math.PI * 1.3 * u) * fade
  out.pitch = 0.15 * Math.sin(2 * Math.PI * 0.9 * u + 1) * fade
  return out
}
