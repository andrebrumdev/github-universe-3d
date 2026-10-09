/**
 * Fases do motor de qualquer voo da nave (transferência, troca de destino, salto da apresentação, passo do tutorial,
 * volta para a escolta), como numa transferência de Hohmann de verdade: dois impulsos e o motor desligado entre eles.
 * Cada tipo de caminho diz só onde ficam as janelas das queimas (`BurnWindows`); a forma da intensidade é uma só, e é
 * ela que alimenta a chama, o tranco, o rastro de fogo e o vapor das asas.
 */

export type BurnPhaseName = 'departure' | 'coast' | 'arrival'

export interface BurnPhase {
  phase: BurnPhaseName
  /** Força do motor, 0..1: 1 no auge da queima, 0 na planagem. */
  intensity: number
}

/** Janelas das queimas de um voo (s desde a partida). */
export interface BurnWindows {
  /** Fim da queima de partida (0 = sem queima: o voo começa planando). */
  departure: number
  /** Começo da queima de chegada (= duração: sem queima). */
  arrival: number
}

/**
 * Intensidade no fim da queima de chegada: a chama assenta no nível de quem fica parado (visita, escolta), sem estalo.
 * Com o mapeamento do ShipRig (0,05 + 1,15 × intensidade), 0,18 dá ~0,26, o nível parado de sempre (0,25).
 */
export const ARRIVAL_TAIL = 0.18

const smoothstep = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return u * u * (3 - 2 * u)
}

/**
 * Fase do motor no instante `t` (s desde a partida) de um voo de `duration` s com as janelas `burns`:
 * - **partida** (0 → `departure`): acende no máximo de uma vez e apaga no fim da janela;
 * - **planagem**: intensidade 0 (fica só uma chama-piloto); o estilingue cai sempre aqui (é de graça);
 * - **chegada** (`arrival` → fim): acende rápido, segura e cai até ARRIVAL_TAIL na entrada na órbita de destino.
 * Antes de 0 vale a partida, depois do fim a chegada (travado nas pontas).
 */
export function burnPhaseAt(burns: BurnWindows, duration: number, t: number): BurnPhase {
  const { departure, arrival } = burns
  if (t < departure) return { phase: 'departure', intensity: 1 - smoothstep(0.55, 1, Math.max(0, t) / departure) }
  if (t < arrival || arrival >= duration) return { phase: 'coast', intensity: 0 }
  const u = Math.min(1, (t - arrival) / (duration - arrival))
  return { phase: 'arrival', intensity: smoothstep(0, 0.3, u) * (ARRIVAL_TAIL + (1 - ARRIVAL_TAIL) * (1 - smoothstep(0.7, 1, u))) }
}
