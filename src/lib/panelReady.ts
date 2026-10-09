import type { UniverseSelection } from './interaction'

/**
 * Quando o painel (planeta, lua, perfil) pode aparecer: só com a nave chegada ao alvo da seleção, e não no clique.
 * Puro: o relógio e a leitura da nave ficam em quem chama (`store/panelReady`).
 */

/** Rede de segurança (s) desde a seleção: acima da maior viagem (~8 s de transferência, mais as queimas). */
export const PANEL_READY_TIMEOUT = 9
/** Tolerância (s) para a nave assumir o alvo (efeito dela roda no commit); depois disso, sem viagem a caminho, libera. */
export const PANEL_SHIP_GRACE = 0.6

/** Chave do alvo que a seleção pede à nave: o sol (perfil) ou o planeta (planeta e lua dele); null sem painel. */
export function panelTargetKey(sel: UniverseSelection): string | null {
  if (sel.kind === 'profile') return 'sun'
  if (sel.kind === 'planet') return `planet:${sel.name}`
  if (sel.kind === 'moon') return `planet:${sel.planet}`
  return null
}

export interface PanelWatch {
  key: string | null
  /** Segundos desde que esta chave foi selecionada. */
  waited: number
  /** Segundos seguidos sem a nave estar indo (ou parada) no alvo. */
  idle: number
}

export const newPanelWatch = (): PanelWatch => ({ key: null, waited: 0, idle: 0 })

export interface PanelShipInput {
  mode: string
  /** Chave do alvo da nave (mesma forma de `panelTargetKey`); null sem alvo. */
  targetKey: string | null
}

/**
 * Avança `dt` segundos e diz se o painel de `key` já pode aparecer. Trocar de chave recomeça a espera; a mesma chave
 * (outra lua do mesmo planeta) segue valendo. Sem movimento reduzido, é a chegada (`visiting` no alvo); a nave ausente
 * (nunca assume o alvo) e o tempo esgotado liberam do mesmo jeito.
 */
export function stepPanelReady(w: PanelWatch, key: string | null, ship: PanelShipInput, reduced: boolean, dt: number): boolean {
  if (key === null) {
    w.key = null
    w.waited = 0
    w.idle = 0
    return false
  }
  if (w.key !== key) {
    w.key = key
    w.waited = 0
    w.idle = 0
  }
  if (reduced) return true
  w.waited += dt
  const onTarget = ship.targetKey === key
  if (onTarget && ship.mode === 'visiting') return true
  const heading = onTarget && ship.mode === 'traveling'
  w.idle = heading ? 0 : w.idle + dt
  return w.idle >= PANEL_SHIP_GRACE || w.waited >= PANEL_READY_TIMEOUT
}
