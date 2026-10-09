/**
 * Volta da nave (de um planeta, do sol ou do meio de uma viagem) até o canto da escolta, perto da lente.
 *
 * O caminho é uma cadeia de Hermite cúbicas (C¹ por construção) em coordenadas da câmera (ver `cameraFrame`):
 * 1. **saída**: parte com a velocidade que tinha (parada, ou em voo) e se afasta pela tangente da órbita, na queima
 *    de partida (ver `returnBurnPhase`: a volta tem as mesmas fases de motor de toda viagem);
 * 2. **passagem**: curva até um ponto atrás e ao lado da câmera, fora do quadro;
 * 3. **entrada**: dá a volta e reaparece do lado, já na profundidade do canto (entra no quadro pela lateral, nunca
 *    mais perto da lente que a escolta, nunca enchendo a tela);
 * 4. **chegada**: freia numa curva só, alinhada com o puff de ré, e para exatamente no canto (sem passar dele).
 *
 * A cadeia de Hermite dá só a forma do caminho; o tempo anda pelo comprimento de arco, numa lei de velocidade como a
 * de toda viagem (ver `returnBurns`): na queima de partida a velocidade vai da que a nave tinha até a de cruzeiro,
 * na planagem fica constante, e no puff cai numa curva só (`brakeFactor`) até zero no canto. A "mola" da chegada
 * ficou só na orientação (`returnFaceWeight` passa um pouco do três-quartos e volta).
 * No mundo, o começo fica preso à câmera da hora da volta e o fim à câmera de agora (`blendFramesPoint`): a saída
 * não é arrastada pela câmera que se afasta, e a chegada termina exatamente no canto mesmo se o usuário girar a câmera.
 * A frente da nave segue a velocidade e, na chegada, gira para quem vê, em três-quartos, como na escolta.
 */
import type { Vec3 } from '../universe/orbits'
import { brakeFactor, brakeIntegral, burnPhaseAt, PUFF_MAX_SECONDS, PUFF_MIN_SECONDS, puffSchedule, type BurnPhase, type BurnWindows } from './burn'
import { blendFramesPoint, type CameraFrame } from './cameraFrame'
import { MIN_SHIP_DISTANCE, THREE_QUARTER_YAW } from './escort'
import { add, cross, dot, length, normalize, scale, sub } from './vec'

export const RETURN_MIN_SECONDS = 2.4
export const RETURN_MAX_SECONDS = 4.5
/** Nível do propulsor na escolta (o mesmo do ShipRig parado): o fim da queima de chegada assenta nele. */
export const ESCORT_THRUST = 0.25

/** Instantes das juntas, em fração da duração. */
const T_PULL = 0.18
const T_BEHIND = 0.5
const T_SIDE = 0.72
/** Amostras do comprimento de arco por trecho da forma (tabela por plano; as juntas caem sempre numa amostra). */
const ARC_SAMPLES = 160
/** Quanto a frente passa do três-quartos antes de assentar (a "mola" da chegada, só na orientação). */
const FACE_OVERSHOOT = 1.6
/** Mistura dos referenciais (preso ao mundo → preso à câmera de agora). */
const BLEND_FROM = 0.15
const BLEND_TO = 0.6
/** Menor distância à lente em qualquer ponto (com folga sobre o plano próximo). */
const NEAR_LIMIT = 2 * MIN_SHIP_DISTANCE

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const smoothstep = (a: number, b: number, x: number) => {
  const u = clamp((x - a) / (b - a), 0, 1)
  return u * u * (3 - 2 * u)
}

/** Duração da volta (s): cresce com a distância até a lente, entre RETURN_MIN e RETURN_MAX. */
export function returnDuration(distance: number): number {
  return clamp(RETURN_MIN_SECONDS + distance / 30, RETURN_MIN_SECONDS, RETURN_MAX_SECONDS)
}

export interface ReturnInput {
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

export interface ReturnPlan {
  duration: number
  /** Forma do caminho (Hermite no tempo da forma, 0..duration); o tempo de verdade anda pelo arco (ver `arc`). */
  knots: Knot[]
  /** Comprimento de arco acumulado da forma nos instantes `arcT` da forma (ARC_SAMPLES por trecho). */
  arc: Float64Array
  arcT: Float64Array
  /** Lei de velocidade: inicial e de cruzeiro (u/s), e a rampa entre elas (s, no máximo a queima de partida). */
  v0: number
  cruise: number
  ramp: number
  /** Janelas das queimas (uma por plano: a volta não muda). */
  burns: BurnWindows
  escort: Vec3
  side: 1 | -1
  /** Direção da frente no fim (de frente para a lente, em três-quartos), no referencial da câmera. */
  face: Vec3
  /** Direção da primeira saída (velocidade atual, ou a tangente). */
  departure: Vec3
}

/**
 * Frente de três-quartos, como a escolta no ShipRig (`lookAt` da lente com o "para cima" da câmera e depois
 * `rotateY(−side·yaw)`): gira em torno do "para cima" do próprio modelo, perpendicular à direção da lente.
 */
function threeQuarter(escort: Vec3, side: 1 | -1): Vec3 {
  const f = normalize(scale(escort, -1))
  const up = normalize(sub([0, 1, 0], scale(f, f[1])), [0, 0, 1])
  const x = cross(up, f)
  const a = -side * THREE_QUARTER_YAW
  return normalize(add(scale(f, Math.cos(a)), scale(x, Math.sin(a))))
}

/**
 * Trecho da forma entre duas juntas: Hermite com as direções das juntas (unitárias, ou nulas nas pontas paradas)
 * escaladas pela corda do próprio trecho — sem laço nem bico, e com a direção contínua nas juntas (G¹: o tempo anda
 * pelo arco, então basta a direção).
 */
function hermite(k0: Knot, k1: Knot, t: number, out: Vec3, velocity: boolean): Vec3 {
  const d = k1.t - k0.t
  const u = clamp((t - k0.t) / d, 0, 1)
  const u2 = u * u
  const u3 = u2 * u
  const chord = Math.hypot(k1.p[0] - k0.p[0], k1.p[1] - k0.p[1], k1.p[2] - k0.p[2])
  if (!velocity) {
    const h00 = 2 * u3 - 3 * u2 + 1
    const h10 = (u3 - 2 * u2 + u) * chord
    const h01 = -2 * u3 + 3 * u2
    const h11 = (u3 - u2) * chord
    for (let k = 0; k < 3; k++) out[k] = h00 * k0.p[k] + h10 * k0.v[k] + h01 * k1.p[k] + h11 * k1.v[k]
    return out
  }
  const d00 = (6 * u2 - 6 * u) / d
  const d10 = ((3 * u2 - 4 * u + 1) * chord) / d
  const d01 = (-6 * u2 + 6 * u) / d
  const d11 = ((3 * u2 - 2 * u) * chord) / d
  for (let k = 0; k < 3; k++) out[k] = d00 * k0.p[k] + d10 * k0.v[k] + d01 * k1.p[k] + d11 * k1.v[k]
  return out
}

function segment(plan: Pick<ReturnPlan, 'knots'>, t: number): [Knot, Knot] {
  const { knots } = plan
  let i = 0
  while (i < knots.length - 2 && t > knots[i + 1].t) i++
  return [knots[i], knots[i + 1]]
}

function knotsFor(input: ReturnInput, T: number, lateral: number): Knot[] {
  const { start, velocity, escort, side } = input
  const D = length(escort)
  const moving = length(velocity) > 1e-6
  // Pela tangente, mas sem a parte que aponta para a lente (perto dela, isso encheria a tela).
  const toLens = normalize(scale(start, -1))
  const raw = normalize(input.departure, [side, 0, 0])
  const away = sub(raw, scale(toLens, Math.max(0, dot(raw, toLens))))
  const dep = moving ? normalize(velocity) : normalize(away, [side, 0, 0])
  // 1. afasta-se pela tangente: um pedaço proporcional à distância, acelerando
  const pullTime = T_PULL * T
  // em voo, segue reto pela velocidade que tinha enquanto a rampa a leva ao cruzeiro (sem virar de uma vez)
  const pullLength = Math.max(clamp(0.15 * length(start), 0.8, 6), moving ? 0.5 * length(velocity) * pullTime : 0)
  const pull = add(start, scale(dep, pullLength))
  const pullSpeed = Math.max((1.6 * pullLength) / pullTime, moving ? length(velocity) * 0.8 : 0)
  // 2. atrás e ao lado da câmera, fora do quadro, do lado em que a nave já está (para não cruzar a tela na frente
  //    da lente). Se for o lado oposto ao canto, cruza por trás da câmera (um segundo ponto atrás, no lado do canto).
  const crossing = pull[0] * side < 0
  const back = (crossing ? 1.1 : 0.7) * D
  const behindAt = (s: number): Vec3 => [s * (Math.abs(escort[0]) + lateral * D), escort[1] * 0.5 - 0.1 * D, back]
  // 3. do lado do canto, na profundidade dele (fora do quadro), vindo para dentro
  const beside: Vec3 = [side * (Math.abs(escort[0]) + 0.9 * D), escort[1], escort[2] * 1.15]
  const besideSpeed = (1.2 * length(sub(escort, beside))) / ((1 - T_SIDE) * T)
  const knots: Knot[] = [
    { t: 0, p: [...start], v: moving ? [...velocity] : [0, 0, 0] },
    { t: pullTime, p: pull, v: scale(dep, pullSpeed) },
  ]
  if (crossing) {
    const b1 = behindAt(-side)
    const b2 = behindAt(side)
    const t1 = 0.4 * T
    const t2 = 0.58 * T
    knots.push(
      { t: t1, p: b1, v: scale([side, 0, 0], (0.8 * length(sub(b2, b1))) / (t2 - t1)) },
      { t: t2, p: b2, v: scale(normalize([side * 0.3, 0, -1]), (0.8 * length(sub(beside, b2))) / (T_SIDE * T - t2)) },
    )
  } else {
    const b = behindAt(side)
    knots.push({ t: T_BEHIND * T, p: b, v: scale(normalize([side * 0.6, 0, 0.8]), (0.7 * length(sub(b, pull))) / ((T_BEHIND - T_PULL) * T)) })
  }
  knots.push(
    { t: T_SIDE * T, p: beside, v: scale(normalize(sub(escort, beside)), besideSpeed) },
    // 4. chega ao canto parada (a forma termina nele; quem freia é a lei de velocidade)
    { t: T, p: [...escort], v: [0, 0, 0] },
  )
  return knots
}

/**
 * A cadeia vira só forma (o tempo anda pelo arco, em velocidade de cruzeiro): uma tangente desenhada para o tempo
 * pode fazer laço ou bico (a curva volta sobre si e a nave viraria de uma vez). Nas juntas do meio a direção vira a
 * bissetriz das cordas vizinhas (o tamanho sai da corda de cada trecho, em `hermite`): a curva nunca volta para trás
 * dentro de um trecho. A primeira mantém a direção (a velocidade que a nave tinha ou, parada, a do puxão pela
 * tangente da órbita) e a última fica nula (chega parada).
 */
function tameTangents(knots: Knot[]): Knot[] {
  const n = knots.length
  return knots.map((k, i) => {
    if (i === n - 1) return { ...k, v: [0, 0, 0] as Vec3 }
    const out = sub(knots[i + 1].p, k.p)
    // parada, sai pela corda do puxão (a tangente da órbita); em voo, pela velocidade que tinha
    if (i === 0) return { ...k, v: length(k.v) > 1e-9 ? normalize(k.v) : normalize(out) }
    const inc = sub(k.p, knots[i - 1].p)
    return { ...k, v: normalize(add(normalize(inc), normalize(out)), normalize(out)) }
  })
}

function closestToLens(knots: Knot[], T: number): number {
  const out: Vec3 = [0, 0, 0]
  let min = Infinity
  for (let i = 0; i <= 400; i++) {
    const t = (i / 400) * T
    const [a, b] = segment({ knots }, t)
    min = Math.min(min, length(hermite(a, b, t, out, false)))
  }
  return min
}

/**
 * Planeja a volta. O ponto atrás da câmera se afasta para o lado até o caminho inteiro ficar longe da lente
 * (NEAR_LIMIT); a nave que já está quase lá parte direto (mesmo assim pela tangente e pela volta por trás).
 */
export function planReturn(input: ReturnInput): ReturnPlan {
  const T = returnDuration(length(input.start))
  let lateral = 1.6
  let knots = tameTangents(knotsFor(input, T, lateral))
  for (let i = 0; i < 3 && closestToLens(knots, T) < NEAR_LIMIT; i++) knots = tameTangents(knotsFor(input, T, (lateral *= 1.4)))
  // comprimento de arco da forma, trecho a trecho (a direção da forma é contínua nas juntas, a rapidez não: uma
  // célula da tabela nunca atravessa uma junta, senão a nave daria um tranco ali)
  const count = (knots.length - 1) * ARC_SAMPLES
  const arc = new Float64Array(count + 1)
  const arcT = new Float64Array(count + 1)
  const p: Vec3 = [0, 0, 0]
  let prev: Vec3 = [...knots[0].p]
  for (let s = 0; s < knots.length - 1; s++) {
    const k0 = knots[s]
    const k1 = knots[s + 1]
    for (let i = 1; i <= ARC_SAMPLES; i++) {
      const j = s * ARC_SAMPLES + i
      const tau = k0.t + ((k1.t - k0.t) * i) / ARC_SAMPLES
      hermite(k0, k1, tau, p, false)
      arc[j] = arc[j - 1] + length(sub(p, prev))
      arcT[j] = tau
      prev = [p[0], p[1], p[2]]
    }
  }
  // janelas: partida no puxão, puff no fim (entre PUFF_MIN e PUFF_MAX), planagem entre eles
  const departure = T_PULL * T
  const puff = clamp((1 - T_SIDE) * T, PUFF_MIN_SECONDS, PUFF_MAX_SECONDS)
  const puffs = puffSchedule(T - puff, T)
  // lei de velocidade: S = v0·tp/2 + vc·(tp/2 + planagem + ∫ freio) → a de cruzeiro que cobre o caminho em T
  const v0 = length(input.velocity)
  const S = arc[count]
  // vindo rápido de uma viagem num caminho curto: a rampa encurta para a velocidade inicial não passar do caminho
  const ramp = Math.min(departure, S / Math.max(v0, 1e-9))
  const cruise = (S - (v0 * ramp) / 2) / (ramp / 2 + (T - puff - ramp) + brakeIntegral(puffs, T - puff, T))
  const first = length(knots[0].v) > 1e-6 ? knots[0].v : knots[1].v
  return {
    duration: T,
    knots,
    arc,
    arcT,
    v0,
    cruise,
    ramp,
    burns: { departure, arrival: T - puff, puffs },
    escort: [...input.escort],
    side: input.side,
    face: threeQuarter(input.escort, input.side),
    departure: normalize(first),
  }
}

/** ∫₀ʸ smoothstep. */
const smoothRamp = (y: number) => y * y * y - (y * y * y * y) / 2

/** Velocidade (u/s) e distância percorrida pelo arco no instante `t`, pela lei de velocidade do plano. */
function speedLaw(plan: ReturnPlan, t: number): { speed: number; distance: number } {
  const T = plan.duration
  const { arrival: ps, puffs } = plan.burns
  const { v0, cruise: vc, ramp: tp } = plan
  const S = plan.arc[plan.arc.length - 1]
  const c = clamp(t, 0, T)
  let speed: number
  let distance: number
  if (c <= tp) {
    const y = c / tp
    speed = v0 + (vc - v0) * smoothstep(0, 1, y)
    distance = v0 * c + (vc - v0) * tp * smoothRamp(y)
  } else if (c <= ps) {
    speed = vc
    distance = v0 * tp + ((vc - v0) * tp) / 2 + vc * (c - tp)
  } else {
    speed = vc * brakeFactor(puffs, c)
    distance = v0 * tp + ((vc - v0) * tp) / 2 + vc * (ps - tp) + vc * (brakeIntegral(puffs, ps, T) - brakeIntegral(puffs, c, T))
  }
  if (t >= T) speed = 0
  return { speed, distance: Math.min(distance, S) }
}

/** Tempo da forma (0..duração) na distância `d` do arco. */
function shapeTime(plan: ReturnPlan, d: number): number {
  const { arc, arcT } = plan
  const last = arc.length - 1
  if (d <= 0) return 0
  if (d >= arc[last]) return plan.duration
  let lo = 0
  let hi = last
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (arc[mid] <= d) lo = mid
    else hi = mid
  }
  const k = (d - arc[lo]) / (arc[hi] - arc[lo] || 1)
  return arcT[lo] + (arcT[hi] - arcT[lo]) * k
}

/** Posição no referencial da câmera (travada em [0, duração]). */
export function returnLocal(plan: ReturnPlan, t: number, out: Vec3 = [0, 0, 0]): Vec3 {
  const tau = shapeTime(plan, speedLaw(plan, t).distance)
  const [a, b] = segment(plan, tau)
  return hermite(a, b, tau, out, false)
}

/** Velocidade no referencial da câmera (unidades/s): a da lei de velocidade, na direção do caminho; zero fora da volta. */
export function returnLocalVelocity(plan: ReturnPlan, t: number, out: Vec3 = [0, 0, 0]): Vec3 {
  if (!(t >= 0 && t <= plan.duration)) {
    out.fill(0)
    return out
  }
  const { speed, distance } = speedLaw(plan, t)
  // direção: a tangente da forma; no fim (tangente nula), a de um instante antes
  let tau = shapeTime(plan, distance)
  const back = plan.duration / plan.arc.length
  for (let i = 0; i < 4; i++) {
    const [a, b] = segment(plan, tau)
    hermite(a, b, tau, out, true)
    const l = length(out)
    if (l > 1e-9) {
      const k = speed / l
      out[0] *= k
      out[1] *= k
      out[2] *= k
      return out
    }
    tau = Math.max(0, tau - back)
  }
  out.fill(0)
  return out
}

/** Peso do referencial da câmera de agora (0 = preso ao mundo da hora da volta, 1 = preso à câmera). */
export function returnBlend(plan: ReturnPlan, t: number): number {
  return smoothstep(BLEND_FROM * plan.duration, BLEND_TO * plan.duration, t)
}

/** Posição no mundo: `start` é o referencial da hora da volta, `now` o da câmera (atrasada) deste frame. */
export function returnPoint(plan: ReturnPlan, t: number, start: CameraFrame, now: CameraFrame, out: Vec3 = [0, 0, 0]): Vec3 {
  return blendFramesPoint(start, now, returnBlend(plan, t), returnLocal(plan, t), out)
}

/** Interpola direções unitárias pelo arco (em torno de y quando são opostas: a nave "vira" de frente). */
function slerpDir(a: Vec3, b: Vec3, w: number): Vec3 {
  const c = clamp(dot(a, b), -1, 1)
  const angle = Math.acos(c)
  if (angle < 1e-6) return b
  let axis = cross(a, b)
  if (length(axis) < 1e-6) axis = [0, 1, 0]
  axis = normalize(axis)
  const th = angle * w
  // Rodrigues
  const kxa = cross(axis, a)
  const kda = dot(axis, a)
  return normalize(add(add(scale(a, Math.cos(th)), scale(kxa, Math.sin(th))), scale(axis, kda * (1 - Math.cos(th)))))
}

/**
 * Peso de "de frente para quem vê": gira durante o puff e chega em 1 com a nave parada, passando um pouco dele e
 * voltando (a "mola" da chegada, só na orientação: a posição para no canto sem passar).
 */
export function returnFaceWeight(plan: ReturnPlan, t: number): number {
  const T = plan.duration
  const from = plan.burns.arrival - 0.08 * T
  const u = clamp((t - from) / (T - from), 0, 1)
  // easeOutBack: 0 → passa de 1 → 1
  const k = FACE_OVERSHOOT
  return 1 + (k + 1) * (u - 1) ** 3 + k * (u - 1) ** 2
}

/** Para onde aponta a frente da nave (+z do modelo), no referencial da câmera. */
export function returnHeading(plan: ReturnPlan, t: number): Vec3 {
  const v = returnLocalVelocity(plan, clamp(t, 0, plan.duration))
  const speed = length(v)
  const along = speed > 1e-3 ? scale(v, 1 / speed) : t < plan.duration / 2 ? plan.departure : plan.face
  return slerpDir(along, plan.face, returnFaceWeight(plan, t))
}

/**
 * Janelas das queimas da volta, como numa transferência: a partida é o puxão para longe do planeta (até T_PULL), a
 * planagem é a passagem por trás da câmera, e a chegada é o puff de ré no fim (entre PUFF_MIN e PUFF_MAX), que para
 * a nave exatamente no canto. Feitas uma vez por plano.
 */
export function returnBurns(plan: ReturnPlan): BurnWindows {
  return plan.burns
}

/** Fase do motor na volta (mesma forma de todo voo: ver `burnPhaseAt`). */
export function returnBurnPhase(plan: ReturnPlan, t: number): BurnPhase {
  return burnPhaseAt(returnBurns(plan), plan.duration, t)
}
