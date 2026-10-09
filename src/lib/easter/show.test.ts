import { describe, expect, it } from 'vitest'
import {
  noClickVisible,
  SHOW_ARRIVE_SECONDS,
  SHOW_CALL_TIMEOUT,
  SHOW_IDLE,
  SHOW_SECONDS,
  showCuesBetween,
  showReducer,
  type ShowState,
  type ShowTick,
} from './show'

const tick = (s: ShowState, seconds: number, over: Partial<ShowTick> = {}, dt = 1 / 60) => {
  let state = s
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    state = showReducer(state, { type: 'tick', dt, reduced: false, shipMode: 'escort', focused: false, ...over })
  }
  return state
}

describe('pegou o botão → show do Octocat', () => {
  it('pegar chama a nave; na escolta ela vai para o palco (modo de foco) e o show começa quando assenta', () => {
    const calling = showReducer(SHOW_IDLE, { type: 'catch' })
    expect(calling.phase).toBe('calling')
    const arriving = tick(calling, 1 / 60)
    expect(arriving.phase).toBe('arriving')
    expect(arriving.staged).toBe(true)
    // ainda deslizando para o lugar
    expect(tick(arriving, SHOW_ARRIVE_SECONDS / 2, { shipMode: 'focus', focused: true }).phase).toBe('arriving')
    const performing = tick(arriving, SHOW_ARRIVE_SECONDS + 0.1, { shipMode: 'focus', focused: true })
    expect(performing.phase).toBe('performing')
  })

  it('o show acaba sozinho e o botão volta, uma rodada a mais', () => {
    const performing = tick(tick(showReducer(SHOW_IDLE, { type: 'catch' }), 1 / 60), SHOW_ARRIVE_SECONDS + 0.1, { shipMode: 'focus', focused: true })
    const done = tick(performing, SHOW_SECONDS + 0.1, { shipMode: 'focus', focused: true })
    expect(done.phase).toBe('idle')
    expect(done.round).toBe(1)
  })

  it('nave ocupada (voltando): espera; se demorar demais, faz o show onde está', () => {
    const calling = showReducer(SHOW_IDLE, { type: 'catch' })
    expect(tick(calling, 1, { shipMode: 'returning' }).phase).toBe('calling')
    const late = tick(calling, SHOW_CALL_TIMEOUT + 0.1, { shipMode: 'returning' })
    expect(late.phase).toBe('performing')
    expect(late.staged).toBe(false)
  })

  it('movimento reduzido: sem voo, o show (rosto e falas) começa na hora', () => {
    const s = showReducer(showReducer(SHOW_IDLE, { type: 'catch' }), { type: 'tick', dt: 1 / 60, reduced: true, shipMode: 'escort', focused: false })
    expect(s.phase).toBe('performing')
    expect(s.staged).toBe(false)
  })

  it('o usuário sai do palco (Esc, "← Galáxia") no meio: encerra e o botão volta', () => {
    const arriving = tick(showReducer(SHOW_IDLE, { type: 'catch' }), 1 / 60)
    const performing = tick(arriving, SHOW_ARRIVE_SECONDS + 0.1, { shipMode: 'focus', focused: true })
    const left = tick(performing, 0.2, { shipMode: 'returning', focused: false })
    expect(left.phase).toBe('idle')
    expect(left.round).toBe(1)
    // chegando: um instante de folga para a seleção da nave entrar
    expect(tick(arriving, 0.1, { focused: false }).phase).toBe('arriving')
    expect(tick(arriving, 1, { focused: false }).phase).toBe('idle')
  })

  it('interromper (tutorial, apresentação) encerra; pegar de novo durante o show não faz nada', () => {
    const calling = showReducer(SHOW_IDLE, { type: 'catch' })
    expect(showReducer(calling, { type: 'interrupt' })).toMatchObject({ phase: 'idle', round: 1 })
    expect(showReducer(calling, { type: 'catch' })).toBe(calling)
    expect(showReducer(SHOW_IDLE, { type: 'interrupt' })).toBe(SHOW_IDLE)
  })
})

describe('deixas do show', () => {
  it('fala, parafusos com estouro de chama, pulinhos do Clawd, confete e a fala do agradecimento, nessa ordem', () => {
    const all = showCuesBetween(-1, SHOW_SECONDS, false)
    expect(all[0]).toBe('line-1')
    expect(all.filter((c) => c === 'roll').length).toBeGreaterThanOrEqual(2)
    expect(all.filter((c) => c === 'burst').length).toBeGreaterThanOrEqual(2)
    expect(all.filter((c) => c === 'hop').length).toBeGreaterThanOrEqual(1)
    expect(all).toContain('confetti')
    expect(all.at(-1)).toBe('line-2')
  })

  it('cada deixa sai uma vez só, quadro a quadro', () => {
    const seen: string[] = []
    for (let t = 0; t < SHOW_SECONDS; t += 1 / 60) seen.push(...showCuesBetween(t - 1 / 60, t, false))
    expect(seen).toEqual(showCuesBetween(-1, SHOW_SECONDS, false))
  })

  it('movimento reduzido: só as falas', () => {
    expect(showCuesBetween(-1, SHOW_SECONDS, true)).toEqual(['line-1', 'line-2'])
  })
})

describe('noClickVisible (regras de exclusão)', () => {
  const free = { floatingHidden: false, tutorial: false, presentation: false, crash: false, showing: false }
  it('aparece só com a tela livre', () => {
    expect(noClickVisible(free)).toBe(true)
  })
  it('some com os botões flutuantes (painel, modo de foco), no tutorial, na apresentação, na trombada e durante o show', () => {
    for (const key of ['floatingHidden', 'tutorial', 'presentation', 'crash', 'showing'] as const) {
      expect(noClickVisible({ ...free, [key]: true })).toBe(false)
    }
  })
})
