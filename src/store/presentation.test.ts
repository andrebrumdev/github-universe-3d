import { beforeEach, describe, expect, it } from 'vitest'
import { buildSampleUniverse } from '@/lib/github/sample'
import { STOP_SECONDS } from '@/lib/presentation'
import { missCanvas, usePresentation } from './presentation'
import { useTutorial } from './tutorial'
import { useUniverse } from './universe'

const universe = buildSampleUniverse()
const p = () => usePresentation.getState()
const u = () => useUniverse.getState()

/** Chega à parada atual e espera o tempo dela inteiro. */
function finishStop() {
  p().arrived()
  p().tick(STOP_SECONDS)
}

beforeEach(() => {
  useUniverse.setState(useUniverse.getInitialState(), true)
  useTutorial.setState({ step: null })
  usePresentation.setState({ state: null, stops: [], universe: null, ended: null })
})

describe('apresentação x seleção', () => {
  it('começa no sol, sem a fala genérica do guia, e narra ao chegar', () => {
    p().start(universe)
    expect(u().selection).toEqual({ kind: 'profile' })
    expect(u().bubble).toBeNull()
    p().arrived()
    expect(u().bubble?.line.text).toBe('Esse é o perfil de {name}!')
  })

  it('cada parada seleciona o planeta do repo, na ordem do ranking, até o encerramento', () => {
    p().start(universe)
    const repos = universe.repos.slice(0, 10).map((r) => r.name)
    const visited: string[] = []
    for (let i = 0; i < repos.length; i++) {
      finishStop()
      const sel = u().selection
      if (sel.kind === 'planet') visited.push(sel.name)
    }
    expect(visited).toEqual(repos)
    finishStop()
    expect(p().stops[p().state!.index]).toEqual({ kind: 'outro' })
    expect(u().selection).toEqual({ kind: 'none' })
    expect(u().bubble?.line.text).toBe('Até a próxima!')
  })

  it('clicar num planeta ou no sol encerra a apresentação e a seleção do usuário vence', () => {
    p().start(universe)
    p().next()
    useUniverse.getState().select({ kind: 'planet', name: universe.repos[5].name })
    expect(p().state).toBeNull()
    expect(u().selection).toEqual({ kind: 'planet', name: universe.repos[5].name })

    p().start(universe)
    p().next()
    useUniverse.getState().select({ kind: 'profile' })
    expect(p().state).toBeNull()
    expect(u().selection).toEqual({ kind: 'profile' })
  })

  it('clicar no vazio durante a apresentação não faz nada (regra do tutorial)', () => {
    p().start(universe)
    p().next()
    missCanvas()
    expect(p().state?.index).toBe(1)
    expect(u().selection).toEqual({ kind: 'planet', name: universe.repos[0].name })
  })

  it('fora da apresentação, clicar no vazio volta à galáxia', () => {
    u().select({ kind: 'planet', name: 'a' })
    missCanvas()
    expect(u().selection).toEqual({ kind: 'none' })
  })

  it('mesmo uma seleção limpa por fora não encerra (só planeta, lua, sol, arrasto ou tutorial)', () => {
    p().start(universe)
    u().clearSelection()
    expect(p().state).not.toBeNull()
  })

  it('sair registra como terminou (o botão recebe o foco de volta só no ✕/Esc/Explorar)', () => {
    p().start(universe)
    p().exit()
    expect(p().ended).toBe('exit')
    p().start(universe)
    expect(p().ended).toBeNull()
    u().select({ kind: 'profile' })
    expect(p().ended).toBe('interrupt')
  })

  it('sair (✕ / Esc) encerra e volta à galáxia', () => {
    p().start(universe)
    p().next()
    p().exit()
    expect(p().state).toBeNull()
    expect(u().selection).toEqual({ kind: 'none' })
  })

  it('apresentação e tutorial se excluem: começar um encerra o outro', () => {
    useTutorial.getState().start()
    p().start(universe)
    expect(useTutorial.getState().step).toBeNull()
    expect(p().state).not.toBeNull()
    useTutorial.getState().start()
    expect(p().state).toBeNull()
    expect(useTutorial.getState().step).toBe('welcome')
  })

  it('ver de novo volta ao sol; pausa alterna', () => {
    p().start(universe)
    p().next()
    p().next()
    p().restart()
    expect(p().state!.index).toBe(0)
    expect(u().selection).toEqual({ kind: 'profile' })
    p().togglePause()
    expect(p().state!.paused).toBe(true)
    p().togglePause()
    expect(p().state!.paused).toBe(false)
  })

  it('voltar ao anterior re-seleciona a parada anterior', () => {
    p().start(universe)
    p().next()
    p().next()
    p().prev()
    expect(u().selection).toEqual({ kind: 'planet', name: universe.repos[0].name })
  })

  it('interromper (arrasto da câmera) encerra sem mexer na seleção', () => {
    p().start(universe)
    p().next()
    p().interrupt()
    expect(p().state).toBeNull()
    expect(u().selection).toEqual({ kind: 'planet', name: universe.repos[0].name })
  })
})
