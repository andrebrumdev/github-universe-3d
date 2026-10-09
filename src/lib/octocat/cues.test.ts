import { describe, expect, it } from 'vitest'
import {
  CLAMP_TOLERANCE,
  FPS_LOW_HOLD_S,
  FPS_SMOOTH_HOLD_S,
  FPS_WARMUP_S,
  newFpsWatch,
  newShrinkWatch,
  newZoomWatch,
  SHRINK_SETTLE_MS,
  smoothFpsReady,
  stepFps,
  stepShrink,
  stepZoom,
  zoomClamp,
  type FpsWatch,
} from './cues'

describe('janela apertada (stepShrink)', () => {
  const settled = () => {
    const w = newShrinkWatch()
    stepShrink(w, 0, 1600, 1000)
    return w
  }
  const T = SHRINK_SETTLE_MS + 100

  it('área caindo mais de 15% em ~1 s', () => {
    const w = settled()
    expect(stepShrink(w, T, 1600, 1000)).toBe(false)
    expect(stepShrink(w, T + 300, 1500, 1000)).toBe(false) // −6%
    expect(stepShrink(w, T + 700, 1300, 1000)).toBe(true) // −19% em 0,7 s
  })

  it('um pulo só, depois de muito tempo parado (a referência é o tamanho de antes, por mais antigo que seja)', () => {
    const w = settled()
    expect(stepShrink(w, T + 30_000, 1100, 700)).toBe(true)
  })

  it('15% ou menos não conta; nem a mesma queda espalhada por vários segundos', () => {
    const w = settled()
    expect(stepShrink(w, T, 1600, 1000)).toBe(false)
    expect(stepShrink(w, T + 500, 1360, 1000)).toBe(false) // −15% exatos
    const slow = settled()
    let width = 1600
    for (let t = T; t < T + 6000; t += 400) {
      width -= 30
      expect(stepShrink(slow, t, width, 1000)).toBe(false)
    }
  })

  it('crescer não conta', () => {
    const w = settled()
    stepShrink(w, T, 1000, 700)
    expect(stepShrink(w, T + 200, 1600, 1000)).toBe(false)
  })

  it('ignora a carga inicial (a janela se ajeitando logo depois de abrir)', () => {
    const w = newShrinkWatch()
    stepShrink(w, 0, 1600, 1000)
    expect(stepShrink(w, 300, 900, 600)).toBe(false)
    expect(stepShrink(w, SHRINK_SETTLE_MS - 1, 800, 500)).toBe(false)
  })

  it('ignora a troca de orientação (deitado ↔ em pé), mesmo com a área caindo', () => {
    const w = settled()
    stepShrink(w, T, 1600, 1000)
    expect(stepShrink(w, T + 200, 700, 1000)).toBe(false) // virou retrato: −56%
    // e a nova orientação vira a referência: dali em diante, uma queda de verdade conta
    expect(stepShrink(w, T + 400, 520, 900)).toBe(true)
  })

  it('ignora quando o navegador avisa que a orientação mudou', () => {
    const w = settled()
    stepShrink(w, T, 1600, 1000)
    expect(stepShrink(w, T + 200, 1100, 900, true)).toBe(false)
  })

  it('depois de disparar, recomeça a contar do tamanho novo', () => {
    const w = settled()
    stepShrink(w, T, 1600, 1000)
    expect(stepShrink(w, T + 200, 1200, 1000)).toBe(true)
    expect(stepShrink(w, T + 400, 1150, 1000)).toBe(false)
  })
})

describe('zoom demais (stepZoom)', () => {
  it('no limite: um dos extremos da distância (com folga) ou nenhum', () => {
    expect(zoomClamp(2, 2, 100)).toBe('min')
    expect(zoomClamp(2 * (1 + CLAMP_TOLERANCE) - 1e-6, 2, 100)).toBe('min')
    expect(zoomClamp(2.5, 2, 100)).toBeNull()
    expect(zoomClamp(99, 2, 100)).toBe('max')
    expect(zoomClamp(50, 2, 100)).toBeNull()
    expect(zoomClamp(1e9, 2, Infinity)).toBeNull()
  })

  it('continua empurrando no limite por ~1 s: tonto', () => {
    const w = newZoomWatch()
    let fired = false
    for (let t = 0; t <= 1000; t += 100) fired = stepZoom(w, t, -1, 'min') || fired
    expect(fired).toBe(true)
  })

  it('empurrar menos de 1 s, ou com pausas, ou para o outro lado, não', () => {
    const short = newZoomWatch()
    for (let t = 0; t < 900; t += 100) expect(stepZoom(short, t, -1, 'min')).toBe(false)
    const paused = newZoomWatch()
    for (const t of [0, 200, 800, 1000, 1600, 1800]) expect(stepZoom(paused, t, 1, 'max')).toBe(false)
    const away = newZoomWatch()
    for (let t = 0; t <= 1500; t += 100) expect(stepZoom(away, t, 1, 'min')).toBe(false)
    const notAtLimit = newZoomWatch()
    for (let t = 0; t <= 1500; t += 100) expect(stepZoom(notAtLimit, t, -1, null)).toBe(false)
  })

  it('vai e volta rápido (4 inversões em 2 s): tonto', () => {
    const w = newZoomWatch()
    const dirs = [-1, -1, 1, 1, -1, 1, -1] as const
    const results = dirs.map((d, i) => stepZoom(w, i * 250, d, null))
    expect(results.slice(0, -1).every((r) => !r)).toBe(true)
    expect(results.at(-1)).toBe(true)
  })

  it('inversões devagar (espalhadas por mais de 2 s) não', () => {
    const w = newZoomWatch()
    const dirs = [-1, 1, -1, 1, -1, 1] as const
    dirs.forEach((d, i) => expect(stepZoom(w, i * 800, d, null)).toBe(false))
  })

  it('depois de disparar, zera', () => {
    const w = newZoomWatch()
    for (let t = 0; t <= 1000; t += 100) stepZoom(w, t, -1, 'min')
    expect(stepZoom(w, 1100, -1, 'min')).toBe(false)
  })
})

describe('fps liso (stepFps)', () => {
  const run = (w: FpsWatch, fps: number, seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / fps) stepFps(w, 1 / fps)
  }

  it('≥ 55 fps por 15 s (depois do aquecimento) qualifica', () => {
    const w = newFpsWatch()
    run(w, 60, FPS_WARMUP_S + FPS_SMOOTH_HOLD_S - 1)
    expect(w.qualified).toBe(false)
    run(w, 60, 1.5)
    expect(w.qualified).toBe(true)
    expect(w.low).toBe(false)
  })

  it('uma queda abaixo de 55 recomeça a contagem', () => {
    const w = newFpsWatch()
    run(w, 60, FPS_WARMUP_S + 10)
    run(w, 30, 1.5)
    run(w, 60, 10)
    expect(w.qualified).toBe(false)
  })

  it('aparelho lento (abaixo de 40 por 5 s) nunca qualifica, mesmo melhorando depois', () => {
    const w = newFpsWatch()
    run(w, 30, FPS_WARMUP_S + FPS_LOW_HOLD_S + 0.5)
    expect(w.low).toBe(true)
    run(w, 60, 30)
    expect(w.qualified).toBe(false)
  })

  it('um engasgo (aba escondida, compilação) não conta como aparelho lento, mas recomeça a contagem', () => {
    const w = newFpsWatch()
    run(w, 60, FPS_WARMUP_S + 10)
    stepFps(w, 2)
    expect(w.low).toBe(false)
    run(w, 60, 10)
    expect(w.qualified).toBe(false)
    run(w, 60, 6)
    expect(w.qualified).toBe(true)
  })

  it('a fala só sai no desktop, sem aparelho lento, depois da 3ª interação ou de 60 s', () => {
    const watch = { ...newFpsWatch(), qualified: true }
    const base = { watch, desktop: true, interactions: 0, sinceStartMs: 30_000, force: false }
    expect(smoothFpsReady(base)).toBe(false)
    expect(smoothFpsReady({ ...base, interactions: 3 })).toBe(true)
    expect(smoothFpsReady({ ...base, sinceStartMs: 60_000 })).toBe(true)
    expect(smoothFpsReady({ ...base, sinceStartMs: 60_000, desktop: false })).toBe(false)
    expect(smoothFpsReady({ ...base, sinceStartMs: 60_000, watch: { ...watch, qualified: false } })).toBe(false)
    expect(smoothFpsReady({ ...base, sinceStartMs: 60_000, watch: { ...watch, low: true } })).toBe(false)
    // o atalho de desenvolvimento pula a espera (mas não o celular)
    expect(smoothFpsReady({ ...base, watch: newFpsWatch(), force: true })).toBe(true)
    expect(smoothFpsReady({ ...base, watch: newFpsWatch(), force: true, desktop: false })).toBe(false)
  })
})
