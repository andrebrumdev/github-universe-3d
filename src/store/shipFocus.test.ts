import { beforeEach, describe, expect, it } from 'vitest'
import { buildSampleUniverse } from '@/lib/github/sample'
import { missCanvas, usePresentation } from './presentation'
import { useTutorial } from './tutorial'
import { useUniverse } from './universe'

const u = () => useUniverse.getState()
const SHIP = { kind: 'ship' } as const

beforeEach(() => {
  useUniverse.setState(useUniverse.getInitialState(), true)
  useTutorial.setState({ step: null })
  usePresentation.setState({ state: null, stops: [], universe: null, ended: null })
})

describe('modo de foco na nave como seleção', () => {
  it('entrar seleciona a nave, sem fala do guia e sem contar como o primeiro zoom num planeta', () => {
    u().select(SHIP)
    expect(u().selection).toEqual(SHIP)
    expect(u().bubble).toBeNull()
    expect(u().zoomedOnce).toBe(false)
  })

  it('escolher um planeta ou o sol de dentro do modo sai dele e viaja como sempre', () => {
    u().select(SHIP)
    u().select({ kind: 'planet', name: 'a' })
    expect(u().selection).toEqual({ kind: 'planet', name: 'a' })
    u().select(SHIP)
    u().select({ kind: 'profile' })
    expect(u().selection).toEqual({ kind: 'profile' })
  })

  it('"← Galáxia" e Esc (limpar a seleção) voltam à visão geral', () => {
    u().select(SHIP)
    u().clearSelection()
    expect(u().selection).toEqual({ kind: 'none' })
  })

  it('um toque perdido no vazio não tira do modo (no planeta, tira)', () => {
    u().select(SHIP)
    missCanvas()
    expect(u().selection).toEqual(SHIP)
    u().select({ kind: 'planet', name: 'a' })
    missCanvas()
    expect(u().selection).toEqual({ kind: 'none' })
  })

  it('abrir o tutorial sai do modo', () => {
    u().select(SHIP)
    useTutorial.getState().start()
    expect(u().selection).toEqual({ kind: 'none' })
    expect(useTutorial.getState().step).toBe('welcome')
  })

  it('começar a apresentação sai do modo (vai ao sol)', () => {
    u().select(SHIP)
    usePresentation.getState().start(buildSampleUniverse())
    expect(u().selection).toEqual({ kind: 'profile' })
    expect(usePresentation.getState().state).not.toBeNull()
  })

  it('no passo livre do tutorial, o modo convive com ele (como qualquer seleção)', () => {
    useTutorial.setState({ step: 'free' })
    u().select(SHIP)
    expect(useTutorial.getState().step).toBe('free')
    expect(u().selection).toEqual(SHIP)
  })

  it('fala da brincadeira: sempre sai, com a expressão pedida', () => {
    u().play('Quer dar uma volta?', 'wink')
    expect(u().bubble?.line).toMatchObject({ id: 'play', text: 'Quer dar uma volta?', expression: 'wink' })
    const seq = u().bubble!.seq
    u().play('Quer dar uma volta?', 'wink')
    expect(u().bubble!.seq).toBe(seq + 1)
  })
})
