import { beforeEach, describe, expect, it } from 'vitest'
import { crashCancel, crashImpact, crashOverlayOn, crashTick, HEAL_END } from '@/lib/crash/timeline'
import { crashApology, crashTimeline, endCrash, overlayExpired, useCrash } from './crash'
import { useUniverse } from './universe'

/** A nave no impacto: publica o ponto da trinca e começa a linha do tempo (como o ShipRig). */
function impact() {
  useCrash.getState().hit(320, 200, 7)
  crashImpact(crashTimeline)
}
const tick = (seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) crashTick(crashTimeline, dt)
}

describe('ciclo de vida da camada do vidro', () => {
  beforeEach(() => endCrash())

  it('monta no impacto', () => {
    expect(useCrash.getState().impact).toBeNull()
    impact()
    expect(useCrash.getState().impact).toMatchObject({ x: 320, y: 200, seed: 7 })
    expect(overlayExpired(crashTimeline)).toBe(false)
  })

  it('sai depois da cura', () => {
    impact()
    tick(HEAL_END - 0.1)
    expect(overlayExpired(crashTimeline)).toBe(false)
    tick(0.2)
    expect(overlayExpired(crashTimeline)).toBe(true)
  })

  it('sai rápido no cancelamento (não congela)', () => {
    impact()
    tick(0.6)
    crashCancel(crashTimeline)
    expect(overlayExpired(crashTimeline)).toBe(false)
    tick(0.35)
    expect(overlayExpired(crashTimeline)).toBe(true)
  })

  it('sai na hora se a nave desmonta no meio (sem trinca congelada depois de "Tentar de novo")', () => {
    impact()
    tick(0.5)
    endCrash()
    expect(useCrash.getState().impact).toBeNull()
    expect(crashOverlayOn(crashTimeline)).toBe(false)
    expect(overlayExpired(crashTimeline)).toBe(true)
  })

  it('limpar uma trombada velha não apaga a nova', () => {
    impact()
    const first = useCrash.getState().impact!.seq
    impact()
    useCrash.getState().clear(first)
    expect(useCrash.getState().impact).not.toBeNull()
  })
})

describe('fala de desculpa: o sol só ri depois que ela saiu de verdade', () => {
  it('a fala da trombada no balão do Octocat conta uma desculpa; outras falas não', () => {
    const before = crashApology.count
    useUniverse.getState().emitGuide('planet')
    expect(crashApology.count).toBe(before)
    useUniverse.getState().emitGuide('crash')
    expect(crashApology.count).toBe(before + 1)
    // mesma fala de novo (once: false): conta de novo
    useUniverse.getState().emitGuide('crash')
    expect(crashApology.count).toBe(before + 2)
  })

  it('cancelada, encerrada à força ou cancelada entre dois quadros: nenhuma desculpa conta', () => {
    const before = crashApology.count
    crashImpact(crashTimeline)
    crashCancel(crashTimeline)
    for (let i = 0; i < 20; i++) crashTick(crashTimeline, 0.1)
    expect(crashApology.count).toBe(before)
    crashImpact(crashTimeline)
    endCrash()
    expect(crashApology.count).toBe(before)
    crashImpact(crashTimeline)
    crashTick(crashTimeline, 0.01)
    crashCancel(crashTimeline)
    crashTick(crashTimeline, 1)
    expect(crashApology.count).toBe(before)
  })
})
