/**
 * Trombada na tela (easter egg): a volta que vem rápido demais. O ShipRig usa este caminho no lugar da volta normal
 * (lib/ship/returnFlight) quando a trombada é sorteada (lib/crash/rarity).
 *
 * Um só embalo, em coordenadas da câmera (ver `cameraFrame`):
 * 1. **a volta normal**: a nave faz a mesma volta de sempre (`planReturn`: saída pela tangente, passagem por trás da
 *    câmera e entrada pelo lado, na planagem);
 * 2. **a tomada** (`takeover`): na planagem da volta (rapidez de cruzeiro, antes do puff de ré), no instante em que o
 *    mergulho dali vira mais devagar, a trombada assume com a mesma posição e a mesma velocidade (C¹) — sem puff,
 *    sem parar, sem girar para quem vê;
 * 3. **o mergulho**: uma curva inclinada e aberta da direção em que vinha até a lente, com a rapidez subindo em
 *    ease-in da de cruzeiro até a do impacto (o ponto mais rápido do voo), motor no máximo; bate na distância mínima da lente
 *    (MIN_SHIP_DISTANCE, a mesma do keepAway: nada atravessa o plano próximo), perto do centro da tela e um pouco
 *    puxada para o canto da escolta;
 * 4. **a recuperação**: congela um instante colada no vidro, quica para trás (mola) e volta ao canto da escolta
 *    bambeando, chegando nele parada em `duration + CRASH_RECOVER`.
 * A câmera fica onde está até o impacto (`crashHoldsCamera`): não vai para a visão geral enquanto a nave vem.
 */
import { burnPhaseAt, type BurnPhase, type BurnWindows } from '../ship/burn'
import { blendFramesPoint, type CameraFrame } from '../ship/cameraFrame'
import { MIN_SHIP_DISTANCE, THREE_QUARTER_YAW } from '../ship/escort'
import { planReturn, returnBlend, returnLocal, returnLocalVelocity, type ReturnInput, type ReturnPlan } from '../ship/returnFlight'
import { add, cross, dot, length, normalize, scale, sub } from '../ship/vec'
import type { Vec3 } from '../universe/orbits'

/** Quanto a mira sai do centro da tela em direção ao canto da escolta (0 = centro, 1 = o canto). */
export const CRASH_AIM_SHIFT = 0.2
/**
 * Direção de chegada: a corda (da tomada ao impacto) puxada CRASH_FACE_ON vezes para "de frente para a lente". Vindo
 * do lado, de frente de vez exigiria dar meia-volta; assim bate em diagonal, de três-quartos, numa curva aberta.
 */
export const CRASH_FACE_ON = 0.8
/** Rapidez do impacto: ao menos isto × a de cruzeiro, 1,2 × a maior da volta até ali, e CRASH_MIN_IMPACT_SPEED (u/s). */
const IMPACT_GAIN = 1.6
const PRIOR_GAIN = 1.2
const CRASH_MIN_IMPACT_SPEED = 14
/** Maior taxa de giro da frente (rad/s) no mergulho: uma curva inclinada, nunca um giro no lugar. */
export const CRASH_MAX_TURN_RATE = 15
/** Recuperação depois do impacto (s): congela, quica para trás e volta ao canto bambeando. */
export const CRASH_FREEZE = 0.3
export const CRASH_DRIFT_START = 0.9
export const CRASH_RECOVER = 2.6
/** Quanto quica para trás (unidades), e a mola do quique (rad/s, amortecimento). */
export const CRASH_BOUNCE = 0.55
const BOUNCE_OMEGA = 9
const BOUNCE_ZETA = 0.35
/** Amostras do comprimento de arco do mergulho. */
const ARC_SAMPLES = 240
/** Candidatas à tomada na planagem: do começo do puff para trás, até esta fração da planagem. */
const TAKEOVER_CANDIDATES = 12
const TAKEOVER_REACH = 0.9
/** Uma chegada com menos que isto "contra a lente" (cosseno) é de raspão, e custa GRAZE_PENALTY rad/s por unidade. */
const MIN_INTO_LENS = 0.45
const GRAZE_PENALTY = 40

export type CrashInput = ReturnInput

interface Knot {
  p: Vec3
  v: Vec3
}

/** Forma do mergulho: da tomada ao impacto. */
type Dash = [Knot, Knot]

export interface CrashPlan {
  /** A volta normal que a trombada segue até a tomada. */
  ret: ReturnPlan
  /** Instante da tomada (s): onde a volta começaria a frear. */
  takeover: number
  /** Instante do impacto (s). A recuperação vai até `duration + CRASH_RECOVER`. */
  duration: number
  /** Forma do mergulho (Hermite, da tomada ao impacto) e o arco acumulado nos parâmetros `arcU` (0..1). */
  dash: Dash
  arc: Float64Array
  arcU: Float64Array
  /** Lei de velocidade do mergulho: da tomada (a de cruzeiro) à do impacto (u/s), em ease-in. */
  vTake: number
  vImpact: number
  escort: Vec3
  /** Direção unitária (referencial da câmera) da mira, da lente para fora; o impacto fica nela, a MIN_SHIP_DISTANCE. */
  aim: Vec3
  impact: Vec3
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

/** Hermite do mergulho (parâmetro 0..1) com as direções das pontas escaladas pela corda: sem laço nem bico. */
function dashShape([k0, k1]: Dash, u: number, out: Vec3, derivative: boolean): Vec3 {
  const w = clamp(u, 0, 1)
  const w2 = w * w
  const w3 = w2 * w
  const chord = length(sub(k1.p, k0.p))
  const [a, b, c, d] = derivative
    ? [6 * w2 - 6 * w, (3 * w2 - 4 * w + 1) * chord, -6 * w2 + 6 * w, (3 * w2 - 2 * w) * chord]
    : [2 * w3 - 3 * w2 + 1, (w3 - 2 * w2 + w) * chord, -2 * w3 + 3 * w2, (w3 - w2) * chord]
  for (let k = 0; k < 3; k++) out[k] = a * k0.p[k] + b * k0.v[k] + c * k1.p[k] + d * k1.v[k]
  return out
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

/**
 * Planeja a trombada: a volta normal até a tomada (o começo da frenagem dela) e o mergulho dali até a lente. O
 * mergulho sai na direção e na rapidez da volta (C¹) e chega de frente para a lente; a rapidez sobe em ease-in,
 * v(τ) = vT + (vI − vT)·(τ/D)², então o caminho S = D·(vT + (vI − vT)/3) dá a duração D do mergulho.
 */
export function planCrash(input: CrashInput): CrashPlan {
  const ret = planReturn(input)
  const aim = normalize(add(scale([0, 0, -1], 1 - CRASH_AIM_SHIFT), scale(normalize(input.escort), CRASH_AIM_SHIFT)))
  const impact = scale(aim, MIN_SHIP_DISTANCE)
  // a tomada fica na planagem (rapidez de cruzeiro, antes do puff): no instante em que o mergulho vira mais devagar
  const { departure, arrival } = ret.burns
  let best: CrashPlan | null = null
  let bestRate = Infinity
  for (let i = 0; i <= TAKEOVER_CANDIDATES; i++) {
    const takeover = arrival - (i / TAKEOVER_CANDIDATES) * (arrival - departure) * TAKEOVER_REACH
    const plan = dashFrom(ret, takeover, aim, impact, input)
    // custo: o giro mais rápido do mergulho, e uma chegada de raspão (pouco contra a lente) pesa como giro
    const into = dot(plan.dash[1].v, scale(aim, -1))
    const cost = dashTurnRate(plan) + GRAZE_PENALTY * Math.max(0, MIN_INTO_LENS - into)
    // a tomada mais tarde ganha no empate (a volta normal aparece mais)
    if (cost < bestRate - 0.25) {
      best = plan
      bestRate = cost
    }
  }
  return best!
}

/** O mergulho a partir de `takeover` (posição e velocidade da volta ali). */
function dashFrom(ret: ReturnPlan, takeover: number, aim: Vec3, impact: Vec3, input: CrashInput): CrashPlan {
  const p0 = returnLocal(ret, takeover)
  const v = returnLocalVelocity(ret, takeover)
  const vTake = length(v)
  const chordDir = normalize(sub(impact, p0))
  const dash: Dash = [
    { p: p0, v: normalize(v, chordDir) },
    { p: impact, v: normalize(add(chordDir, scale(aim, -CRASH_FACE_ON)), chordDir) },
  ]
  const arc = new Float64Array(ARC_SAMPLES + 1)
  const arcU = new Float64Array(ARC_SAMPLES + 1)
  const q: Vec3 = [0, 0, 0]
  let prev: Vec3 = [...p0]
  for (let i = 1; i <= ARC_SAMPLES; i++) {
    arcU[i] = i / ARC_SAMPLES
    dashShape(dash, arcU[i], q, false)
    arc[i] = arc[i - 1] + length(sub(q, prev))
    prev = [q[0], q[1], q[2]]
  }
  // o impacto é o ponto mais rápido de todo o voo
  let prior = 0
  for (let i = 0; i <= 120; i++) prior = Math.max(prior, length(returnLocalVelocity(ret, (i / 120) * takeover)))
  const vImpact = Math.max(IMPACT_GAIN * vTake, PRIOR_GAIN * prior, CRASH_MIN_IMPACT_SPEED)
  const D = arc[ARC_SAMPLES] / (vTake + (vImpact - vTake) / 3)
  return {
    ret,
    takeover,
    duration: takeover + D,
    dash,
    arc,
    arcU,
    vTake,
    vImpact,
    escort: [...input.escort],
    aim,
    impact,
    face: threeQuarter(input.escort, input.side),
    departure: ret.departure,
  }
}

/** Maior taxa de giro (rad/s) da frente no mergulho, amostrada. */
function dashTurnRate(plan: CrashPlan): number {
  const D = plan.duration - plan.takeover
  const steps = 120
  const a: Vec3 = [0, 0, 0]
  const b: Vec3 = [0, 0, 0]
  dashDirection(plan, 0, a)
  let max = 0
  for (let i = 1; i <= steps; i++) {
    dashDirection(plan, (i / steps) * D, b)
    max = Math.max(max, Math.acos(clamp(dot(a, b), -1, 1)) / (D / steps))
    a[0] = b[0]
    a[1] = b[1]
    a[2] = b[2]
  }
  return max
}

/** Duração total (s): o voo até o impacto mais a recuperação (o modo `returning` dura isto). */
export function crashTotal(plan: CrashPlan): number {
  return plan.duration + CRASH_RECOVER
}

/** Rapidez e distância percorrida no mergulho, `t` s depois da tomada (ease-in de vT a vI). */
function dashLaw(plan: CrashPlan, t: number): { speed: number; distance: number } {
  const D = plan.duration - plan.takeover
  const c = clamp(t, 0, D)
  const w = c / D
  const { vTake: v0, vImpact: vI } = plan
  return { speed: v0 + (vI - v0) * w * w, distance: Math.min(plan.arc[plan.arc.length - 1], v0 * c + ((vI - v0) * D * w * w * w) / 3) }
}

/** Parâmetro (0..1) do mergulho na distância `d` do arco. */
function dashParam(plan: CrashPlan, d: number): number {
  const { arc, arcU } = plan
  const last = arc.length - 1
  if (d <= 0) return 0
  if (d >= arc[last]) return arcU[last]
  let lo = 0
  let hi = last
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (arc[mid] <= d) lo = mid
    else hi = mid
  }
  return arcU[lo] + (arcU[hi] - arcU[lo]) * ((d - arc[lo]) / (arc[hi] - arc[lo] || 1))
}

/** Direção unitária do mergulho `t` s depois da tomada. */
function dashDirection(plan: CrashPlan, t: number, out: Vec3): Vec3 {
  dashShape(plan.dash, dashParam(plan, dashLaw(plan, t).distance), out, true)
  const l = length(out) || 1
  out[0] /= l
  out[1] /= l
  out[2] /= l
  return out
}

/** Posição no referencial da câmera em `t` (s desde o começo da volta): volta, mergulho, impacto e recuperação. */
export function crashLocal(plan: CrashPlan, t: number, out: Vec3 = [0, 0, 0]): Vec3 {
  if (t > plan.duration) {
    const r = t - plan.duration
    const reach = MIN_SHIP_DISTANCE + CRASH_BOUNCE * springStepResponse(r - CRASH_FREEZE)
    const w = crashDriftWeight(r)
    for (let k = 0; k < 3; k++) out[k] = plan.aim[k] * reach * (1 - w) + plan.escort[k] * w
    return out
  }
  if (t <= plan.takeover) return returnLocal(plan.ret, t, out)
  return dashShape(plan.dash, dashParam(plan, dashLaw(plan, t - plan.takeover).distance), out, false)
}

/** Velocidade (unidades/s, referencial da câmera) até o impacto; zero fora dele. */
export function crashLocalVelocity(plan: CrashPlan, t: number, out: Vec3 = [0, 0, 0]): Vec3 {
  if (!(t >= 0 && t <= plan.duration)) {
    out.fill(0)
    return out
  }
  if (t <= plan.takeover) return returnLocalVelocity(plan.ret, t, out)
  const tt = t - plan.takeover
  const { speed } = dashLaw(plan, tt)
  dashDirection(plan, tt, out)
  out[0] *= speed
  out[1] *= speed
  out[2] *= speed
  return out
}

/** Peso do referencial da câmera de agora: o da volta (já 1 na tomada) e 1 depois. */
export function crashBlend(plan: CrashPlan, t: number): number {
  return t >= plan.takeover ? 1 : returnBlend(plan.ret, t)
}

/** Posição no mundo: `start` é o referencial da hora da volta, `now` o da câmera (atrasada) deste frame. */
export function crashPoint(plan: CrashPlan, t: number, start: CameraFrame, now: CameraFrame, out: Vec3 = [0, 0, 0]): Vec3 {
  return blendFramesPoint(start, now, crashBlend(plan, t), crashLocal(plan, t), out)
}

/** Peso do "para cima" da câmera na orientação: inclina nas curvas da volta e do mergulho, e chega de pé na tela. */
export function crashFaceWeight(plan: CrashPlan, t: number): number {
  return smoothstep(plan.takeover, plan.duration, t)
}

/**
 * Para onde aponta a frente da nave (referencial da câmera): sempre a direção da velocidade até o impacto (sem o giro
 * para quem vê da chegada da volta normal); depois, vira de cara para a lente e, voltando, para os três-quartos do canto.
 */
export function crashHeading(plan: CrashPlan, t: number): Vec3 {
  if (t > plan.duration) {
    // colada no vidro, vira de cara para a lente na primeira metade do congelamento; depois, os três-quartos do canto
    const r = t - plan.duration
    const facing = slerpDir(plan.dash[1].v, scale(plan.aim, -1), smoothstep(0, CRASH_FREEZE / 2, r))
    return slerpDir(facing, plan.face, crashDriftWeight(r))
  }
  if (t > plan.takeover) return dashDirection(plan, t - plan.takeover, [0, 0, 0])
  const v = returnLocalVelocity(plan.ret, Math.max(0, t))
  return length(v) > 1e-6 ? normalize(v) : plan.departure
}

/** Janelas do motor: as da volta até a tomada, e então queima até o impacto — sem planagem final nem puff de ré. */
export function crashBurns(plan: CrashPlan): BurnWindows {
  return { departure: plan.ret.burns.departure, arrival: plan.duration, puffs: [] }
}

/** Fase do motor: a da volta até a tomada; no mergulho, no máximo; depois do impacto, a chama-piloto. */
export function crashBurnPhase(plan: CrashPlan, t: number): BurnPhase {
  if (t >= plan.duration) return { phase: 'arrival', intensity: 0 }
  if (t >= plan.takeover) return { phase: 'departure', intensity: 1 }
  return burnPhaseAt(crashBurns(plan), plan.duration, t)
}

/** Câmera durante a trombada: fica onde está até o impacto (não vai para a visão geral nem enquadra uma chegada). */
export function crashHoldsCamera(plan: CrashPlan | null, t: number): boolean {
  return plan !== null && t < plan.duration
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
