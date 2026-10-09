/**
 * Fases do motor de qualquer voo da nave (transferência, troca de destino, salto da apresentação, passo do tutorial,
 * volta para a escolta): uma queima forte na partida, a planagem com a chama-piloto e, na chegada, a frenagem com um
 * puff de ré dos dois bicos da frente do casco, sem girar a nave. Cada tipo de caminho diz só onde ficam as janelas
 * (`BurnWindows`); a forma da intensidade e o calendário dos puffs são um só, e alimentam a chama, o tranco, o rastro
 * de fogo, o vapor das asas e os puffs.
 */

export type BurnPhaseName = 'departure' | 'coast' | 'arrival'

export interface BurnPhase {
  phase: BurnPhaseName
  /** Força do motor principal, 0..1: 1 no auge da partida, 0 na planagem e na frenagem (só a chama-piloto). */
  intensity: number
}

/** Um jatinho de ré da frenagem. */
export interface Puff {
  /** Quando começa (s desde a partida). */
  time: number
  /** Quanto dura o empurrão (s). */
  duration: number
  /** Fração da velocidade de chegada que ele tira (somando 1: a nave para no fim). */
  strength: number
}

/** Janelas das queimas de um voo (s desde a partida). */
export interface BurnWindows {
  /** Fim da queima de partida (0 = sem queima: o voo começa planando). */
  departure: number
  /** Começo da chegada (frenagem com os puffs; = duração: sem frenagem). */
  arrival: number
  /** Puff de ré da chegada (um só; vazio sem frenagem). */
  puffs: readonly Puff[]
}

/**
 * Intensidade no fim da chegada: 0 — o motor principal termina na chama-piloto (COAST_THRUST) e o ShipRig a assenta
 * aos poucos no nível de quem fica parado (`settleThrust`), sem estalo na troca.
 */
export const ARRIVAL_TAIL = 0
/** Duração do puff de ré (s): a janela inteira da frenagem fica entre estes limites. */
export const PUFF_MIN_SECONDS = 0.5
export const PUFF_MAX_SECONDS = 0.8

const smoothstep = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return u * u * (3 - 2 * u)
}

/**
 * Calendário da frenagem numa janela [start, end] (s): um puff só, os dois bicos juntos, do começo ao fim da janela,
 * com toda a força (a nave para no fim dele). Janela vazia: nenhum.
 */
export function puffSchedule(start: number, end: number): Puff[] {
  const window = end - start
  return window > 0 ? [{ time: start, duration: window, strength: 1 }] : []
}

/**
 * Fase do motor no instante `t` (s desde a partida) de um voo de `duration` s com as janelas `burns`:
 * - **partida** (0 → `departure`): acende no máximo de uma vez e apaga no fim da janela;
 * - **planagem**: intensidade 0 (fica só a chama-piloto); o estilingue cai sempre aqui (é de graça);
 * - **chegada** (`arrival` → fim): o motor principal fica na chama-piloto enquanto os puffs freiam a nave, e no fim
 *   sobe para ARRIVAL_TAIL (o nível parado).
 * Antes de 0 vale a partida, depois do fim a chegada (travado nas pontas).
 */
export function burnPhaseAt(burns: BurnWindows, duration: number, t: number): BurnPhase {
  const { departure, arrival } = burns
  if (t < departure) return { phase: 'departure', intensity: departure > 0 ? 1 - smoothstep(0.55, 1, Math.max(0, t) / departure) : 0 }
  if (t < arrival || arrival >= duration) return { phase: 'coast', intensity: 0 }
  return { phase: 'arrival', intensity: ARRIVAL_TAIL }
}

/** Puff ativo no instante `t` (índice), ou −1. */
export function activePuff(puffs: readonly Puff[], t: number): number {
  for (let i = 0; i < puffs.length; i++) if (t >= puffs[i].time && t < puffs[i].time + puffs[i].duration) return i
  return -1
}

/**
 * Fração da velocidade de chegada que ainda resta em `t` (1 antes da frenagem, 0 parada): o puff tira a força dele
 * numa rampa suave (smoothstep) durante o próprio empurrão — uma curva de desaceleração só, C¹, alinhada com o jato.
 */
export function brakeFactor(puffs: readonly Puff[], t: number): number {
  let k = 1
  for (const p of puffs) k -= p.strength * smoothstep(p.time, p.time + p.duration, t)
  return Math.max(0, k)
}

/** ∫ smoothstep(0, 1, z) dz de 0 a z (z em unidades da largura). */
const smoothRampTo = (z: number) => (z <= 0 ? 0 : z >= 1 ? 0.5 + (z - 1) : z * z * z - (z * z * z * z) / 2)

/** ∫ brakeFactor de `t` até o fim da frenagem (`end`, s): o caminho que ainda falta percorrer, em s de cruzeiro. */
export function brakeIntegral(puffs: readonly Puff[], t: number, end: number): number {
  let total = end - t
  for (const p of puffs) {
    const at = (x: number) => p.duration * smoothRampTo((x - p.time) / p.duration)
    total -= p.strength * (at(end) - at(t))
  }
  return total
}
