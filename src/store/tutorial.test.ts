import { beforeEach, describe, expect, it } from 'vitest'
import { useTutorial } from './tutorial'
import { useUniverse } from './universe'

beforeEach(() => {
  useUniverse.setState(useUniverse.getInitialState(), true)
  useTutorial.setState({ step: null })
})

describe('tutorial x seleção', () => {
  it('clicar num planeta num passo guiado encerra o tutorial e mantém a seleção', () => {
    useTutorial.getState().start()
    useTutorial.getState().next()
    useUniverse.getState().select({ kind: 'planet', name: 'a' })
    expect(useTutorial.getState().step).toBeNull()
    expect(useUniverse.getState().selection).toEqual({ kind: 'planet', name: 'a' })
  })

  it('clicar no sol também encerra', () => {
    useTutorial.getState().start()
    useUniverse.getState().select({ kind: 'profile' })
    expect(useTutorial.getState().step).toBeNull()
  })

  it('limpar a seleção não encerra, e start limpa a seleção', () => {
    useUniverse.getState().select({ kind: 'planet', name: 'a' })
    useTutorial.getState().start()
    expect(useUniverse.getState().selection).toEqual({ kind: 'none' })
    expect(useTutorial.getState().step).toBe('welcome')
    useUniverse.getState().clearSelection()
    expect(useTutorial.getState().step).toBe('welcome')
  })

  it('no passo livre, selecionar não mexe no tutorial', () => {
    useTutorial.setState({ step: 'free' })
    useUniverse.getState().select({ kind: 'planet', name: 'a' })
    expect(useTutorial.getState().step).toBe('free')
  })
})
