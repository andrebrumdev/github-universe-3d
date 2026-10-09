import { describe, expect, it } from 'vitest'
import { newPanelWatch, PANEL_READY_TIMEOUT, PANEL_SHIP_GRACE, panelTargetKey, stepPanelReady } from './panelReady'

const traveling = (key: string) => ({ mode: 'traveling', targetKey: key })
const visiting = (key: string) => ({ mode: 'visiting', targetKey: key })

describe('panelTargetKey', () => {
  it('mapeia a seleção para o alvo da nave', () => {
    expect(panelTargetKey({ kind: 'profile' })).toBe('sun')
    expect(panelTargetKey({ kind: 'planet', name: 'a' })).toBe('planet:a')
    expect(panelTargetKey({ kind: 'moon', planet: 'a', language: 'TS' })).toBe('planet:a')
    expect(panelTargetKey({ kind: 'ship' })).toBeNull()
    expect(panelTargetKey({ kind: 'none' })).toBeNull()
  })
})

describe('stepPanelReady', () => {
  it('falso na viagem, verdadeiro na chegada', () => {
    const w = newPanelWatch()
    const k = 'planet:a'
    expect(stepPanelReady(w, k, traveling(k), false, 0.016)).toBe(false)
    for (let i = 0; i < 100; i++) expect(stepPanelReady(w, k, traveling(k), false, 0.05)).toBe(false)
    expect(stepPanelReady(w, k, visiting(k), false, 0.016)).toBe(true)
  })

  it('a troca de alvo no meio do voo recomeça a espera', () => {
    const w = newPanelWatch()
    expect(stepPanelReady(w, 'planet:a', visiting('planet:a'), false, 0.016)).toBe(true)
    expect(stepPanelReady(w, 'planet:b', traveling('planet:b'), false, 0.016)).toBe(false)
    expect(stepPanelReady(w, 'planet:b', visiting('planet:b'), false, 0.016)).toBe(true)
  })

  it('nave ainda visitando o alvo antigo não libera o novo', () => {
    const w = newPanelWatch()
    expect(stepPanelReady(w, 'planet:b', visiting('planet:a'), false, 0.1)).toBe(false)
  })

  it('movimento reduzido: imediato', () => {
    expect(stepPanelReady(newPanelWatch(), 'sun', { mode: 'escort', targetKey: null }, true, 0)).toBe(true)
  })

  it('lua do planeta já visitado: pronto na hora, sem nova viagem', () => {
    const w = newPanelWatch()
    const planet = panelTargetKey({ kind: 'planet', name: 'a' })
    const moon = panelTargetKey({ kind: 'moon', planet: 'a', language: 'TS' })
    stepPanelReady(w, planet, visiting('planet:a'), false, 0.016)
    expect(stepPanelReady(w, moon, visiting('planet:a'), false, 0)).toBe(true)
  })

  it('nave ausente (sem alvo): libera depois da tolerância', () => {
    const w = newPanelWatch()
    const idle = { mode: 'escort', targetKey: null }
    expect(stepPanelReady(w, 'sun', idle, false, PANEL_SHIP_GRACE / 2)).toBe(false)
    expect(stepPanelReady(w, 'sun', idle, false, PANEL_SHIP_GRACE)).toBe(true)
  })

  it('tempo esgotado libera mesmo viajando', () => {
    const w = newPanelWatch()
    let ready = false
    for (let t = 0; t < PANEL_READY_TIMEOUT - 0.5; t += 0.5) ready ||= stepPanelReady(w, 'sun', traveling('sun'), false, 0.5)
    expect(ready).toBe(false)
    expect(stepPanelReady(w, 'sun', traveling('sun'), false, 1)).toBe(true)
  })

  it('sem seleção: falso e zera', () => {
    const w = newPanelWatch()
    stepPanelReady(w, 'sun', traveling('sun'), false, 3)
    expect(stepPanelReady(w, null, traveling('sun'), false, 1)).toBe(false)
    expect(w.waited).toBe(0)
  })
})
