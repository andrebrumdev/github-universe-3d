import { describe, expect, it } from 'vitest'
import { guideEventFor, panelSelection, selectedPlanet } from './interaction'

describe('selectedPlanet', () => {
  it('devolve o planeta de uma seleção de planeta ou de lua', () => {
    expect(selectedPlanet({ kind: 'planet', name: 'alpha' })).toBe('alpha')
    expect(selectedPlanet({ kind: 'moon', planet: 'alpha', language: 'Go' })).toBe('alpha')
  })

  it('devolve null para perfil e nada selecionado', () => {
    expect(selectedPlanet({ kind: 'profile' })).toBeNull()
    expect(selectedPlanet({ kind: 'none' })).toBeNull()
    expect(selectedPlanet({ kind: 'ship' })).toBeNull()
  })
})

describe('guideEventFor', () => {
  it('mapeia seleção para o evento do guia', () => {
    expect(guideEventFor({ kind: 'profile' }, false)).toBe('sun')
    expect(guideEventFor({ kind: 'moon', planet: 'a', language: 'Go' }, true)).toBe('moon')
    expect(guideEventFor({ kind: 'none' }, false)).toBeNull()
    expect(guideEventFor({ kind: 'ship' }, false)).toBeNull()
  })

  it('o primeiro planeta focado dispara firstZoom, os seguintes disparam planet', () => {
    expect(guideEventFor({ kind: 'planet', name: 'a' }, false)).toBe('firstZoom')
    expect(guideEventFor({ kind: 'planet', name: 'a' }, true)).toBe('planet')
  })
})

describe('panelSelection', () => {
  it('planeta, lua e perfil abrem um painel; a nave em foco e o nada, não', () => {
    expect(panelSelection({ kind: 'planet', name: 'a' })).toBe(true)
    expect(panelSelection({ kind: 'moon', planet: 'a', language: 'Go' })).toBe(true)
    expect(panelSelection({ kind: 'profile' })).toBe(true)
    expect(panelSelection({ kind: 'ship' })).toBe(false)
    expect(panelSelection({ kind: 'none' })).toBe(false)
  })
})
