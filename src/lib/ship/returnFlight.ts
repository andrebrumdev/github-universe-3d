/**
 * Volta da nave (de um planeta, do sol ou do meio de uma viagem) até o canto da escolta, perto da lente.
 *
 * O caminho é uma cadeia de Hermite cúbicas (C¹ por construção) em coordenadas da câmera (ver `cameraFrame`):
 * 1. **saída**: parte com a velocidade que tinha (parada, ou em voo) e se afasta pela tangente da órbita, na queima
 *    de partida (ver `returnBurnPhase`: a volta tem as mesmas fases de motor de toda viagem);
 * 2. **passagem**: curva até um ponto atrás e ao lado da câmera, fora do quadro;
 * 3. **entrada**: dá a volta e reaparece do lado, já na profundidade do canto (entra no quadro pela lateral, nunca
 *    mais perto da lente que a escolta, nunca enchendo a tela);
 * 4. **chegada**: desacelera, passa um pouco do canto e assenta nele, como uma mola.
 * No mundo, o começo fica preso à câmera da hora da volta e o fim à câmera de agora (`blendFramesPoint`): a saída
 * não é arrastada pela câmera que se afasta, e a chegada termina exatamente no canto mesmo se o usuário girar a câmera.
 * A frente da nave segue a velocidade e, na chegada, gira para quem vê, em três-quartos, como na escolta.
 */
import type { Vec3 } from '../universe/orbits'
import { burnPhaseAt, type BurnPhase, type BurnWindows } from './burn'
import { blendFramesPoint, type CameraFrame } from './cameraFrame'
import { MIN_SHIP_DISTANCE, THREE_QUARTER_YAW } from './escort'
import { add, cross, dot, length, normalize, scale, sub } from './vec'

export const RETURN_MIN_SECONDS = 1.2
export const RETURN_MAX_SECONDS = 2
/** Nível do propulsor na escolta (o mesmo do ShipRig parado): o fim da queima de chegada assenta nele. */
export const ESCORT_THRUST = 0.25

/** Instantes das juntas, em fração da duração. */
const T_PULL = 0.18
const T_BEHIND = 0.5
const T_SIDE = 0.72
const T_OVER = 0.88
/** Mistura dos referenciais (preso ao mundo → preso à câmera de agora). */
const BLEND_FROM = 0.15
const BLEND_TO = 0.6
/** Quanto passa do canto antes de assentar, em fração da distância do canto à lente. */
const OVERSHOOT = 0.08
/** Menor distância à lente em qualquer ponto (com folga sobre o plano próximo). */
const NEAR_LIMIT = 2 * MIN_SHIP_DISTANCE

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const smoothstep = (a: number, b: number, x: number) => {
  const u = clamp((x - a) / (b - a), 0, 1)
  return u * u * (3 - 2 * u)
}

/** Duração da volta (s): cresce com a distância até a lente, entre RETURN_MIN e RETURN_MAX. */
export function returnDuration(distance: number): number {
  return clamp(RETURN_MIN_SECONDS + distance / 60, RETURN_MIN_SECONDS, RETURN_MAX_SECONDS)
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
  knots: Knot[]
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
  const pullLength = clamp(0.15 * length(start), 0.8, 6)
  const pullTime = T_PULL * T
  const pull = add(start, scale(dep, pullLength))
  const pullSpeed = Math.max((1.6 * pullLength) / pullTime, moving ? length(velocity) * 0.8 : 0)
  // 2. atrás e ao lado da câmera, fora do quadro, do lado em que a nave já está (para não cruzar a tela na frente
  //    da lente). Se for o lado oposto ao canto, cruza por trás da câmera (um segundo ponto atrás, no lado do canto).
  const crossing = pull[0] * side < 0
  const back = (crossing ? 1.1 : 0.7) * D
  const behindAt = (s: number): Vec3 => [s * (Math.abs(escort[0]) + lateral * D), escort[1] * 0.5 - 0.1 * D, back]
  // 3. do lado do canto, na profundidade dele (fora do quadro), vindo para dentro
  const beside: Vec3 = [side * (Math.abs(escort[0]) + 0.9 * D), escort[1], escort[2] * 1.15]
  const over = add(escort, scale(normalize(sub(escort, beside)), OVERSHOOT * D))
  const besideSpeed = (1.2 * length(sub(over, beside))) / ((T_OVER - T_SIDE) * T)
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
    // 4. passa um pouco do canto, para, e volta a ele (mola)
    { t: T_OVER * T, p: over, v: [0, 0, 0] },
    { t: T, p: [...escort], v: [0, 0, 0] },
  )
  return knots
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
  let knots = knotsFor(input, T, lateral)
  for (let i = 0; i < 3 && closestToLens(knots, T) < NEAR_LIMIT; i++) knots = knotsFor(input, T, (lateral *= 1.4))
  return {
    duration: T,
    knots,
    escort: [...input.escort],
    side: input.side,
    face: threeQuarter(input.escort, input.side),
    departure: length(knots[0].v) > 1e-6 ? normalize(knots[0].v) : normalize(knots[1].v),
  }
}

/** Posição no referencial da câmera (travada em [0, duração]). */
export function returnLocal(plan: ReturnPlan, t: number, out: Vec3 = [0, 0, 0]): Vec3 {
  const c = clamp(t, 0, plan.duration)
  const [a, b] = segment(plan, c)
  return hermite(a, b, c, out, false)
}

/** Velocidade no referencial da câmera (unidades/s); zero fora da volta. */
export function returnLocalVelocity(plan: ReturnPlan, t: number, out: Vec3 = [0, 0, 0]): Vec3 {
  if (!(t >= 0 && t <= plan.duration)) {
    out.fill(0)
    return out
  }
  const [a, b] = segment(plan, t)
  return hermite(a, b, t, out, true)
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

/** Peso de "de frente para quem vê": gira durante a entrada, completo ao passar do canto. */
export function returnFaceWeight(plan: ReturnPlan, t: number): number {
  return smoothstep((T_SIDE - 0.08) * plan.duration, T_OVER * plan.duration, t)
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
 * planagem é a passagem por trás da câmera, e a chegada é a entrada pelo lado até assentar no canto (de T_SIDE ao fim).
 */
export function returnBurns(plan: ReturnPlan): BurnWindows {
  return { departure: T_PULL * plan.duration, arrival: T_SIDE * plan.duration }
}

/** Fase do motor na volta (mesma forma de todo voo: ver `burnPhaseAt`). */
export function returnBurnPhase(plan: ReturnPlan, t: number): BurnPhase {
  return burnPhaseAt(returnBurns(plan), plan.duration, t)
}
