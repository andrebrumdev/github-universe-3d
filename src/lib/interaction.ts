export type UniverseSelection =
  | { kind: 'none' }
  | { kind: 'profile' }
  | { kind: 'planet'; name: string }
  | { kind: 'moon'; planet: string; language: string }
  /** Modo de foco na nave: a câmera orbita o Octocat estacionado (lib/ship/focus). Sem painel. */
  | { kind: 'ship' }

/**
 * `slingshot`: a nave fez um estilingue gravitacional na viagem; `crash`: voltou rápido demais e bateu na tela (os dois
 * emitidos pela nave, não pela seleção).
 */
export type GuideEvent = 'sun' | 'planet' | 'moon' | 'firstZoom' | 'idle' | 'longIdle' | 'slingshot' | 'crash'

export function selectedPlanet(sel: UniverseSelection): string | null {
  if (sel.kind === 'planet') return sel.name
  if (sel.kind === 'moon') return sel.planet
  return null
}

/** A seleção abre o painel (planeta, lua ou perfil); a nave em foco e o nada, não. */
export function panelSelection(sel: UniverseSelection): boolean {
  return sel.kind === 'planet' || sel.kind === 'moon' || sel.kind === 'profile'
}

export function guideEventFor(sel: UniverseSelection, zoomedOnce: boolean): GuideEvent | null {
  switch (sel.kind) {
    case 'profile':
      return 'sun'
    case 'planet':
      return zoomedOnce ? 'planet' : 'firstZoom'
    case 'moon':
      return 'moon'
    default:
      return null
  }
}
