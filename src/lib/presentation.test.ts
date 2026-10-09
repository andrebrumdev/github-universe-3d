import { describe, expect, it } from 'vitest'
import { buildSampleUniverse } from './github/sample'
import {
  ARRIVAL_TIMEOUT,
  buildStops,
  firstSentence,
  MAX_PRESENTED_REPOS,
  presentationReducer,
  presentationRequested,
  type PresentationState,
  shipAtStop,
  STOP_SECONDS,
  stopLine,
  stopSelection,
  stopTarget,
} from './presentation'
import type { Repo, Universe } from './types'
import { emptyWeeks } from './universe/activity'

function repo(name: string, extra: Partial<Repo> = {}): Repo {
  return {
    name,
    description: '',
    url: `https://github.com/x/${name}`,
    stars: 0,
    forks: 0,
    watchers: 0,
    pushedAt: '2026-01-01T00:00:00Z',
    primaryLanguage: null,
    languages: [],
    lastCommit: null,
    totalCommits: 0,
    activity: { source: 'real', weeks: emptyWeeks(), startDate: '2025-01-05' },
    ...extra,
  }
}

function universe(repos: Repo[]): Universe {
  const base = buildSampleUniverse()
  return { ...base, profile: { ...base.profile, name: 'Ana Maria Souza' }, repos }
}

const started = (count: number) => presentationReducer(null, { type: 'start', count })!
const arrive = (s: PresentationState) => presentationReducer(s, { type: 'arrived' })!

describe('buildStops', () => {
  it('perfil, os 10 primeiros repos na ordem do ranking e o encerramento', () => {
    const repos = Array.from({ length: 14 }, (_, i) => repo(`r${i}`))
    const stops = buildStops(universe(repos))
    expect(stops).toHaveLength(MAX_PRESENTED_REPOS + 2)
    expect(stops[0]).toEqual({ kind: 'profile' })
    expect(stops.slice(1, -1)).toEqual(repos.slice(0, 10).map((r) => ({ kind: 'repo', name: r.name })))
    expect(stops.at(-1)).toEqual({ kind: 'outro' })
  })

  it('com menos de 10 repos, passa por todos', () => {
    const stops = buildStops(universe([repo('a'), repo('b'), repo('c')]))
    expect(stops.map((s) => (s.kind === 'repo' ? s.name : s.kind))).toEqual(['profile', 'a', 'b', 'c', 'outro'])
  })

  it('sem repos: só o perfil e o encerramento', () => {
    expect(buildStops(universe([]))).toEqual([{ kind: 'profile' }, { kind: 'outro' }])
  })
})

describe('presentationReducer', () => {
  it('start abre na primeira parada, esperando a nave chegar', () => {
    expect(started(5)).toEqual({ index: 0, count: 5, paused: false, hidden: false, hovering: false, arrived: false, holdElapsed: 0, waited: 0 })
  })

  it('o tempo da parada só corre depois que a nave chega (a viagem não conta)', () => {
    let s = started(5)
    s = presentationReducer(s, { type: 'tick', dt: 5 })!
    expect(s.holdElapsed).toBe(0)
    s = arrive(s)
    s = presentationReducer(s, { type: 'tick', dt: 4 })!
    expect(s.holdElapsed).toBe(4)
    expect(s.index).toBe(0)
  })

  it('avança sozinho ao completar STOP_SECONDS, zerando o tempo e a chegada', () => {
    let s = arrive(started(5))
    s = presentationReducer(s, { type: 'tick', dt: STOP_SECONDS - 0.01 })!
    expect(s.index).toBe(0)
    s = presentationReducer(s, { type: 'tick', dt: 0.02 })!
    expect(s).toMatchObject({ index: 1, holdElapsed: 0, arrived: false })
  })

  it('depois da última parada vai para o encerramento, que não avança sozinho', () => {
    let s = arrive({ ...started(4), index: 2 })
    s = presentationReducer(s, { type: 'tick', dt: STOP_SECONDS })!
    expect(s.index).toBe(3)
    s = arrive(s)
    const outro = presentationReducer(s, { type: 'tick', dt: 100 })!
    expect(outro.index).toBe(3)
    expect(presentationReducer(outro, { type: 'next' })).toBe(outro)
  })

  it('pausado, o tempo não corre; ao retomar, continua de onde parou', () => {
    let s = arrive(started(5))
    s = presentationReducer(s, { type: 'tick', dt: 3 })!
    s = presentationReducer(s, { type: 'pause' })!
    expect(presentationReducer(s, { type: 'tick', dt: 20 })).toBe(s)
    s = presentationReducer(s, { type: 'resume' })!
    s = presentationReducer(s, { type: 'tick', dt: 1 })!
    expect(s).toMatchObject({ index: 0, holdElapsed: 4, paused: false })
  })

  it('aba escondida e cartão sob o mouse/foco seguram o tempo, sem mexer na pausa do usuário', () => {
    let s = arrive(started(5))
    s = presentationReducer(s, { type: 'visibility', hidden: true })!
    expect(presentationReducer(s, { type: 'tick', dt: 20 })).toBe(s)
    s = presentationReducer(s, { type: 'visibility', hidden: false })!
    s = presentationReducer(s, { type: 'hover', on: true })!
    expect(presentationReducer(s, { type: 'tick', dt: 20 })).toBe(s)
    expect(s.paused).toBe(false)
    s = presentationReducer(s, { type: 'hover', on: false })!
    s = presentationReducer(s, { type: 'tick', dt: 2 })!
    expect(s.holdElapsed).toBe(2)
  })

  it('anterior e próximo ficam dentro dos limites e reiniciam a parada', () => {
    const first = started(3)
    expect(presentationReducer(first, { type: 'prev' })).toBe(first)
    let s = arrive(first)
    s = presentationReducer(s, { type: 'tick', dt: 5 })!
    s = presentationReducer(s, { type: 'next' })!
    expect(s).toMatchObject({ index: 1, holdElapsed: 0, arrived: false })
    s = presentationReducer(s, { type: 'next' })!
    expect(s.index).toBe(2)
    expect(presentationReducer(s, { type: 'next' })).toBe(s)
    s = presentationReducer(s, { type: 'prev' })!
    expect(s.index).toBe(1)
  })

  it('pular de parada mantém a pausa do usuário', () => {
    let s = presentationReducer(started(3), { type: 'pause' })!
    s = presentationReducer(s, { type: 'next' })!
    expect(s).toMatchObject({ index: 1, paused: true })
  })

  it('exit encerra; restart volta ao começo e despausa', () => {
    const s = presentationReducer({ ...started(4), index: 3, paused: true }, { type: 'restart' })!
    expect(s).toMatchObject({ index: 0, count: 4, paused: false, arrived: false, holdElapsed: 0 })
    expect(presentationReducer(s, { type: 'exit' })).toBeNull()
  })

  it('sem apresentação, só start faz algo', () => {
    for (const type of ['next', 'prev', 'pause', 'resume', 'arrived', 'restart', 'exit'] as const) {
      expect(presentationReducer(null, { type })).toBeNull()
    }
    expect(presentationReducer(null, { type: 'tick', dt: 1 })).toBeNull()
  })

  it('se a nave nunca chegar (alvo sumiu), segue mesmo assim depois de ARRIVAL_TIMEOUT', () => {
    let s = started(3)
    s = presentationReducer(s, { type: 'tick', dt: ARRIVAL_TIMEOUT - 0.1 })!
    expect(s.arrived).toBe(false)
    s = presentationReducer(s, { type: 'tick', dt: 0.2 })!
    expect(s.arrived).toBe(true)
  })

  it('chegar de novo na mesma parada não reinicia o tempo', () => {
    let s = arrive(started(3))
    s = presentationReducer(s, { type: 'tick', dt: 2 })!
    expect(arrive(s)).toBe(s)
  })
})

describe('parada → seleção, alvo da nave e chegada', () => {
  it('perfil é o sol; repo é o planeta; encerramento volta à visão geral', () => {
    expect(stopSelection({ kind: 'profile' })).toEqual({ kind: 'profile' })
    expect(stopSelection({ kind: 'repo', name: 'a' })).toEqual({ kind: 'planet', name: 'a' })
    expect(stopSelection({ kind: 'outro' })).toEqual({ kind: 'none' })
    expect(stopTarget({ kind: 'profile' })).toEqual({ kind: 'sun' })
    expect(stopTarget({ kind: 'repo', name: 'a' })).toEqual({ kind: 'planet', name: 'a' })
    expect(stopTarget({ kind: 'outro' })).toBeNull()
  })

  it('a nave chegou só quando visita o alvo desta parada', () => {
    const stop = { kind: 'repo', name: 'a' } as const
    expect(shipAtStop(stop, 'visiting', { kind: 'planet', name: 'a' })).toBe(true)
    expect(shipAtStop(stop, 'visiting', { kind: 'planet', name: 'b' })).toBe(false)
    expect(shipAtStop(stop, 'traveling', { kind: 'planet', name: 'a' })).toBe(false)
    expect(shipAtStop({ kind: 'profile' }, 'visiting', { kind: 'sun' })).toBe(true)
    expect(shipAtStop({ kind: 'profile' }, 'visiting', { kind: 'planet', name: 'a' })).toBe(false)
    expect(shipAtStop({ kind: 'outro' }, 'returning', null)).toBe(true)
  })
})

describe('falas do Octocat', () => {
  const u = universe([
    repo('galaxy', { description: 'Um universo 3D do GitHub. Feito com React.' }),
    repo('notes', { readme: 'Anotações pessoais em markdown' }),
    repo('empty'),
  ])

  it('primeira frase, curta', () => {
    expect(firstSentence('Um universo 3D. Feito com React.')).toBe('Um universo 3D.')
    expect(firstSentence('  sem ponto final  ')).toBe('sem ponto final')
    expect(firstSentence('v1.2 do app! Mais coisas')).toBe('v1.2 do app!')
    const long = firstSentence('a'.repeat(200))
    expect(long.length).toBeLessThanOrEqual(90)
    expect(long.endsWith('…')).toBe(true)
  })

  it('uma fala por parada, com o nome do perfil e o que o repo faz', () => {
    expect(stopLine({ kind: 'profile' }, u)).toBe('Esse é o perfil de {name}!')
    expect(stopLine({ kind: 'repo', name: 'galaxy' }, u)).toBe('galaxy: Um universo 3D do GitHub.')
    expect(stopLine({ kind: 'repo', name: 'notes' }, u)).toBe('notes: Anotações pessoais em markdown')
    expect(stopLine({ kind: 'repo', name: 'empty' }, u)).toBe('Olha só o empty!')
    expect(stopLine({ kind: 'outro' }, u)).toBe('Até a próxima!')
  })
})

describe('presentationRequested', () => {
  it('liga com ?apresentacao (com ou sem valor)', () => {
    expect(presentationRequested('?apresentacao')).toBe(true)
    expect(presentationRequested('?user=x&apresentacao=1')).toBe(true)
    expect(presentationRequested('?perf')).toBe(false)
    expect(presentationRequested('')).toBe(false)
  })
})
