import { describe, expect, it } from 'vitest'
import {
  CANCEL_HEAL,
  CANCEL_STARS_FADE,
  crackHeal,
  CRASH_LINE_AT,
  crashCancel,
  crashDizzy,
  crashFlash,
  crashFlashAt,
  crashHealAt,
  crashImpact,
  crashInterrupted,
  crashOverlayOn,
  crashReset,
  crashShake,
  crashShakeAt,
  crashStarsAt,
  crashTick,
  type CrashTimeline,
  DAZED_FADE,
  DAZED_SPIN,
  dazedStars,
  FLASH_PEAK,
  FLASH_SECONDS,
  HEAL_END,
  HEAL_START,
  newCrashTimeline,
  SHAKE_AMPLITUDE,
  SHAKE_SECONDS,
} from './timeline'

describe('linha do tempo da trombada (s desde o impacto)', () => {
  it('um clarão só, curto (~60 ms) e fraco', () => {
    expect(FLASH_SECONDS).toBeCloseTo(0.06)
    expect(FLASH_PEAK).toBeLessThanOrEqual(0.4)
    expect(crashFlash(-0.01)).toBe(0)
    expect(crashFlash(0)).toBeCloseTo(FLASH_PEAK)
    expect(crashFlash(0.03)).toBeLessThan(FLASH_PEAK)
    expect(crashFlash(FLASH_SECONDS)).toBe(0)
    // nunca acende de novo (menos de 3 clarões por segundo: só um)
    for (let t = FLASH_SECONDS; t < 5; t += 0.01) expect(crashFlash(t)).toBe(0)
  })

  it('a tela treme 250–350 ms, começando em 6–10 px e caindo exponencialmente', () => {
    expect(SHAKE_SECONDS).toBeGreaterThanOrEqual(0.25)
    expect(SHAKE_SECONDS).toBeLessThanOrEqual(0.35)
    expect(SHAKE_AMPLITUDE).toBeGreaterThanOrEqual(6)
    expect(SHAKE_AMPLITUDE).toBeLessThanOrEqual(10)
    const peak = (a: number, b: number) => {
      let m = 0
      for (let t = a; t < b; t += 0.001) {
        const s = crashShake(t)
        m = Math.max(m, Math.hypot(s.x, s.y))
      }
      return m
    }
    expect(peak(0, 0.05)).toBeGreaterThan(5)
    expect(peak(0, SHAKE_SECONDS)).toBeLessThanOrEqual(SHAKE_AMPLITUDE * Math.SQRT2 + 1e-9)
    expect(peak(0.15, 0.2)).toBeLessThan(peak(0, 0.05) / 3)
    expect(crashShake(-0.01)).toEqual({ x: 0, y: 0 })
    expect(crashShake(SHAKE_SECONDS)).toEqual({ x: 0, y: 0 })
    // escreve no `out` sem alocar
    const out = { x: 9, y: 9 }
    expect(crashShake(0.01, out)).toBe(out)
  })

  it('as rachaduras ficam um instante e somem aos poucos em ~1,5–2,5 s', () => {
    expect(HEAL_END - HEAL_START).toBeGreaterThanOrEqual(1.5)
    expect(HEAL_END).toBeLessThanOrEqual(2.5)
    expect(crackHeal(0)).toBe(0)
    expect(crackHeal(HEAL_START)).toBe(0)
    const mid = crackHeal((HEAL_START + HEAL_END) / 2)
    expect(mid).toBeGreaterThan(0.3)
    expect(mid).toBeLessThan(0.7)
    expect(crackHeal(HEAL_END)).toBe(1)
    let last = 0
    for (let t = 0; t <= HEAL_END; t += 0.05) {
      expect(crackHeal(t)).toBeGreaterThanOrEqual(last)
      last = crackHeal(t)
    }
  })

  it('estrelinhas giram ~2,5 s e depois somem', () => {
    expect(DAZED_SPIN).toBeCloseTo(2.5)
    expect(dazedStars(0).opacity).toBe(1)
    expect(dazedStars(DAZED_SPIN - 0.01).opacity).toBe(1)
    expect(dazedStars(DAZED_SPIN + DAZED_FADE / 2).opacity).toBeGreaterThan(0)
    expect(dazedStars(DAZED_SPIN + DAZED_FADE / 2).opacity).toBeLessThan(1)
    expect(dazedStars(DAZED_SPIN + DAZED_FADE).opacity).toBe(0)
    expect(dazedStars(1).angle).toBeGreaterThan(dazedStars(0.5).angle)
  })

  it('a fala vem depois que as estrelas somem (e depois das rachaduras)', () => {
    expect(CRASH_LINE_AT).toBeGreaterThanOrEqual(DAZED_SPIN + DAZED_FADE)
    expect(CRASH_LINE_AT).toBeGreaterThanOrEqual(HEAL_END)
  })
})

/** Avança `seconds` em passos de `dt` e conta quantas vezes a fala foi pedida. */
function run(tl: CrashTimeline, seconds: number, dt = 1 / 60): number {
  let said = 0
  for (let t = 0; t < seconds - 1e-9; t += dt) if (crashTick(tl, dt)) said++
  return said
}

describe('máquina da trombada (impacto → tick → fim, ou cancelamento)', () => {
  it('parada: sem camada, sem estrelas, sem rosto tonto, tick não faz nada', () => {
    const tl = newCrashTimeline()
    expect(crashOverlayOn(tl)).toBe(false)
    expect(crashDizzy(tl)).toBe(false)
    expect(crashStarsAt(tl).opacity).toBe(0)
    expect(run(tl, 5)).toBe(0)
    expect(tl.since).toBe(-1)
  })

  it('ciclo normal: a camada monta no impacto e sai depois da cura; a fala sai uma vez só, e depois tudo volta a parar', () => {
    const tl = newCrashTimeline()
    crashImpact(tl)
    expect(crashOverlayOn(tl)).toBe(true)
    expect(crashFlashAt(tl)).toBeGreaterThan(0)
    expect(crashDizzy(tl)).toBe(true)
    expect(crashStarsAt(tl).opacity).toBe(1)
    expect(run(tl, HEAL_END - 0.05)).toBe(0)
    expect(crashOverlayOn(tl)).toBe(true)
    expect(run(tl, 0.1)).toBe(0)
    expect(crashOverlayOn(tl)).toBe(false)
    // a fala sai exatamente uma vez, quando as estrelas somem
    expect(run(tl, CRASH_LINE_AT - HEAL_END + 0.1)).toBe(1)
    expect(crashDizzy(tl)).toBe(false)
    expect(run(tl, 10)).toBe(0)
    expect(tl.since).toBe(-1)
  })

  it('a fala sai uma vez mesmo com quadros longos (passo grande atravessando o instante dela)', () => {
    const tl = newCrashTimeline()
    crashImpact(tl)
    expect(run(tl, 8, 0.1)).toBe(1)
  })

  it('cancelar: rosto normal na hora, estrelas somem em ~0,2 s, sem fala, e a trinca termina de curar em ~0,3 s', () => {
    for (const at of [0.01, 0.2, 1, 2, 2.6]) {
      const tl = newCrashTimeline()
      crashImpact(tl)
      run(tl, at)
      const healBefore = crashHealAt(tl)
      crashCancel(tl)
      expect(crashDizzy(tl)).toBe(false)
      expect(crashFlashAt(tl)).toBe(0)
      expect(crashShakeAt(tl)).toEqual({ x: 0, y: 0 })
      expect(crashHealAt(tl)).toBeCloseTo(healBefore)
      run(tl, CANCEL_STARS_FADE / 2)
      expect(crashStarsAt(tl).opacity).toBeLessThan(1)
      run(tl, CANCEL_STARS_FADE / 2 + 0.02)
      expect(crashStarsAt(tl).opacity).toBe(0)
      expect(run(tl, CANCEL_HEAL)).toBe(0)
      expect(crashOverlayOn(tl)).toBe(false)
      // e não fala nunca mais
      expect(run(tl, 10)).toBe(0)
      expect(tl.since).toBe(-1)
    }
  })

  it('a cura não congela no cancelamento: só avança, até 1', () => {
    const tl = newCrashTimeline()
    crashImpact(tl)
    run(tl, 0.8)
    crashCancel(tl)
    let last = crashHealAt(tl)
    for (let i = 0; i < 20; i++) {
      crashTick(tl, CANCEL_HEAL / 20)
      const h = crashHealAt(tl)
      expect(h).toBeGreaterThanOrEqual(last)
      last = h
    }
    expect(last).toBeCloseTo(1, 9)
  })

  it('cancelar parada ou já cancelada não faz nada; zerar (a nave desmontou) tira tudo na hora', () => {
    const idle = newCrashTimeline()
    crashCancel(idle)
    expect(idle).toEqual(newCrashTimeline())
    const tl = newCrashTimeline()
    crashImpact(tl)
    run(tl, 0.5)
    crashCancel(tl)
    const at = tl.cancelledAt
    run(tl, 0.1)
    crashCancel(tl)
    expect(tl.cancelledAt).toBe(at)
    crashImpact(tl)
    run(tl, 1)
    crashReset(tl)
    expect(crashOverlayOn(tl)).toBe(false)
    expect(crashStarsAt(tl).opacity).toBe(0)
    expect(run(tl, 5)).toBe(0)
  })

  it('uma trombada nova recomeça do zero (mesmo depois de cancelada)', () => {
    const tl = newCrashTimeline()
    crashImpact(tl)
    run(tl, 1)
    crashCancel(tl)
    crashImpact(tl)
    expect(crashDizzy(tl)).toBe(true)
    expect(run(tl, 4)).toBe(1)
  })

  it('escreve nos `out` (sem alocar no laço por quadro)', () => {
    const tl = newCrashTimeline()
    crashImpact(tl)
    const stars = { opacity: 9, angle: 9 }
    expect(crashStarsAt(tl, stars)).toBe(stars)
    const shake = { x: 9, y: 9 }
    expect(crashShakeAt(tl, shake)).toBe(shake)
    expect(dazedStars(1, stars)).toBe(stars)
  })
})

describe('o que interrompe a trombada', () => {
  const calm = { mode: 'returning' as const, selection: false, tutorial: false, presentation: false }
  it('a volta e a escolta não interrompem', () => {
    expect(crashInterrupted(calm)).toBe(false)
    expect(crashInterrupted({ ...calm, mode: 'escort' })).toBe(false)
  })
  it('selecionar algo, abrir o tutorial, começar a apresentação ou sair em outra viagem interrompem', () => {
    expect(crashInterrupted({ ...calm, selection: true })).toBe(true)
    expect(crashInterrupted({ ...calm, tutorial: true })).toBe(true)
    expect(crashInterrupted({ ...calm, presentation: true })).toBe(true)
    expect(crashInterrupted({ ...calm, mode: 'traveling' })).toBe(true)
    expect(crashInterrupted({ ...calm, mode: 'visiting' })).toBe(true)
    expect(crashInterrupted({ ...calm, mode: 'entering' })).toBe(true)
  })
})
