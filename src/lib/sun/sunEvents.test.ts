import { describe, expect, it } from 'vitest'
import { LINE_DURATION_MS } from '../octocat/lines'
import { CLOSE_PASS_RADII, deriveSunEvents, isClosePass, newSunEvents, newSunEventState, newSunSnapshot, TAB_AWAY_MS, type SunSnapshot } from './sunEvents'

/** Roda uma sequência de quadros (cada um com alterações no retrato) e devolve os eventos de cada quadro. */
function run(frames: Partial<SunSnapshot>[], dt = 0.1) {
  const state = newSunEventState()
  const snap = newSunSnapshot()
  const out = newSunEvents()
  const trace = []
  let t = 0
  for (const f of frames) {
    Object.assign(snap, { t }, f)
    deriveSunEvents(state, snap, out)
    trace.push({ ...out })
    t += dt
  }
  return trace
}
const idle = (n: number, f: Partial<SunSnapshot> = {}) => Array.from({ length: n }, () => ({ ...f }))

describe('deriveSunEvents: as transições que o humor do sol precisa', () => {
  it('começo: sinceStart conta a partir do primeiro quadro; nada mais aconteceu', () => {
    const trace = run(idle(5))
    expect(trace[0].sinceStart).toBe(0)
    expect(trace[4].sinceStart).toBeCloseTo(0.4)
    const last = trace.at(-1)!
    expect([last.sinceArrival, last.sinceLeave, last.sinceTabReturn, last.sinceCometNear]).toEqual([Infinity, Infinity, Infinity, Infinity])
    expect(last.crash).toBe('none')
  })

  it('nave chega num planeta (viajando/voltando → visitando): marca a chegada e o planeta', () => {
    for (const from of ['traveling', 'returning']) {
      const trace = run([{ shipMode: from }, { shipMode: from }, { shipMode: 'visiting', shipTarget: 'api' }, { shipMode: 'visiting', shipTarget: 'api' }])
      expect(trace[1].sinceArrival).toBe(Infinity)
      expect(trace[2].sinceArrival).toBe(0)
      expect(trace[2].arrivalPlanet).toBe('api')
      expect(trace[3].sinceArrival).toBeCloseTo(0.1)
    }
    // escoltando → visitando não é chegada de viagem
    expect(run([{ shipMode: 'escort' }, { shipMode: 'visiting', shipTarget: 'api' }])[1].sinceArrival).toBe(Infinity)
  })

  it('quem interagia saiu: fechou o painel do perfil, ou o mouse saiu do sol (hover → away)', () => {
    const panel = run([{ profileOpen: true }, { profileOpen: true }, { profileOpen: false }, {}])
    expect(panel[1].sinceLeave).toBe(Infinity)
    expect(panel[2].sinceLeave).toBe(0)
    expect(panel[3].sinceLeave).toBeCloseTo(0.1)
    const hover = run([{ mode: 'hover' }, { mode: 'away' }])
    expect(hover[1].sinceLeave).toBe(0)
    // idle → away (sem ter interagido) não é saída
    expect(run([{ mode: 'idle' }, { mode: 'away' }])[1].sinceLeave).toBe(Infinity)
  })

  it('cometa entra e sai da zona perto do periélio: conta desde a entrada, Infinity fora; entrar de novo recomeça', () => {
    const trace = run([{}, { cometNear: true }, { cometNear: true }, { cometNear: false }, { cometNear: true }])
    expect(trace[0].sinceCometNear).toBe(Infinity)
    expect(trace[1].sinceCometNear).toBe(0)
    expect(trace[2].sinceCometNear).toBeCloseTo(0.1)
    expect(trace[3].sinceCometNear).toBe(Infinity)
    expect(trace[4].sinceCometNear).toBe(0)
  })

  it('aba: escondida mais de 10 s e de volta acorda o sol; menos que isso, não', () => {
    const long = run([{}, { tabHiddenMs: TAB_AWAY_MS + 2000 }, { tabHiddenMs: 0 }])
    expect(long[1].sinceTabReturn).toBe(0)
    expect(long[2].sinceTabReturn).toBeCloseTo(0.1)
    expect(run([{}, { tabHiddenMs: TAB_AWAY_MS - 1 }])[1].sinceTabReturn).toBe(Infinity)
  })

  it('trombada: impacto enquanto a linha do tempo corre (não cancelada)', () => {
    const trace = run([{}, { crashActive: true }, { crashActive: true }, { crashActive: false }])
    expect(trace[1].crash).toBe('impact')
    expect(trace[2].crash).toBe('impact')
    // acabou sem fala: nada de risada
    expect(trace[3].crash).toBe('none')
  })

  it('risada só quando a fala de desculpa saiu de verdade, pelo tempo da fala', () => {
    const dt = 0.5
    const frames: Partial<SunSnapshot>[] = [{ crashActive: true }, { crashActive: false, apologies: 1 }, ...idle(20, { apologies: 1 })]
    const trace = run(frames, dt)
    expect(trace[1].crash).toBe('laugh')
    const laughing = trace.filter((e) => e.crash === 'laugh').length * dt
    expect(laughing).toBeCloseTo(LINE_DURATION_MS / 1000, 0)
    expect(trace.at(-1)!.crash).toBe('none')
  })

  it('cancelada, encerrada à força (endCrash) ou cancelada entre dois quadros: nunca ri', () => {
    // cancelada: a linha do tempo para de "correr" sem fala
    expect(run([{ crashActive: true }, { crashActive: false }, ...idle(5)]).some((e) => e.crash === 'laugh')).toBe(false)
    // encerrada à força no meio
    expect(run([{ crashActive: true }, {}, {}]).some((e) => e.crash === 'laugh')).toBe(false)
    // começou e terminou entre dois quadros lidos (nunca vista ativa), sem fala
    expect(run([{}, {}, {}]).some((e) => e.crash === 'laugh')).toBe(false)
  })

  it('a fala conta mesmo se a linha do tempo nunca foi vista correndo (trombada curta entre quadros)', () => {
    expect(run([{}, { apologies: 1 }])[1].crash).toBe('laugh')
  })

  it('escreve no estado e na saída recebidos (nada alocado por quadro)', () => {
    const state = newSunEventState()
    const snap = newSunSnapshot()
    const out = newSunEvents()
    expect(deriveSunEvents(state, snap, out)).toBe(out)
  })
})

describe('raspão: só pela distância (cobre o estilingue, sem depender do sinal da nave)', () => {
  it('em viagem e perto do sol', () => {
    expect(isClosePass(true, CLOSE_PASS_RADII - 0.5)).toBe(true)
    expect(isClosePass(true, CLOSE_PASS_RADII + 0.5)).toBe(false)
    expect(isClosePass(false, 1)).toBe(false)
  })
})
