export type UniverseSelection =
  | { kind: 'none' }
  | { kind: 'profile' }
  | { kind: 'planet'; name: string }
  | { kind: 'moon'; planet: string; language: string }

export type GuideEvent = 'sun' | 'planet' | 'moon' | 'firstZoom' | 'idle' | 'longIdle'

export function selectedPlanet(sel: UniverseSelection): string | null {
  if (sel.kind === 'planet') return sel.name
  if (sel.kind === 'moon') return sel.planet
  return null
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
