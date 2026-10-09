import { describe, expect, it } from 'vitest'
import {
  backButtonRect,
  DESKTOP_MIN_WIDTH,
  floatingButtonsHidden,
  presentationButtonRect,
  presentationCardZone,
  reservedRects,
  sidePanelZone,
  tutorialButtonRect,
  tutorialCardZone,
} from './uiLayout'

const PHONE: [number, number] = [375, 667]
const DESKTOP: [number, number] = [1280, 800]

describe('floatingButtonsHidden', () => {
  it('com o painel (planeta, lua, sol) aberto, os botões somem em qualquer largura', () => {
    expect(floatingButtonsHidden(true, { panel: true })).toBe(true)
    expect(floatingButtonsHidden(false, { panel: true })).toBe(true)
    expect(floatingButtonsHidden(true, { panel: true, tutorial: true })).toBe(true)
  })
  it('a apresentação só tira os botões no celular (no desktop o cartão fica acima da linha deles)', () => {
    expect(floatingButtonsHidden(true, { presentation: true })).toBe(true)
    expect(floatingButtonsHidden(false, { presentation: true })).toBe(false)
  })
  it('sem painel nem apresentação (só o tutorial, ou nada): os botões ficam', () => {
    for (const phone of [true, false]) {
      expect(floatingButtonsHidden(phone, {})).toBe(false)
      expect(floatingButtonsHidden(phone, { tutorial: true })).toBe(false)
    }
  })
})

describe('reservedRects', () => {
  it('celular com o painel aberto: só a folha e o "← Galáxia", sem os botões escondidos', () => {
    expect(reservedRects(...PHONE, { panel: true })).toEqual([sidePanelZone(...PHONE), backButtonRect()])
  })
  it('celular com a apresentação: só a folha dela', () => {
    expect(reservedRects(...PHONE, { presentation: true })).toEqual([presentationCardZone(...PHONE)])
  })
  it('sem nada aberto: os dois botões ficam reservados; desktop com o painel: só a coluna e o "← Galáxia"', () => {
    expect(reservedRects(...PHONE)).toEqual([tutorialButtonRect(...PHONE), presentationButtonRect(...PHONE)])
    expect(reservedRects(...DESKTOP, { panel: true })).toEqual([sidePanelZone(...DESKTOP), backButtonRect()])
  })
  it('o cartão do tutorial cede ao painel: com os dois abertos, a zona dele não conta', () => {
    for (const screen of [PHONE, DESKTOP]) {
      expect(reservedRects(...screen, { tutorial: true })).toContainEqual(tutorialCardZone(...screen))
      expect(reservedRects(...screen, { tutorial: true, panel: true })).not.toContainEqual(tutorialCardZone(...screen))
    }
  })
  it('a fronteira do celular é a mesma do MOBILE_QUERY (max-width: 767px)', () => {
    expect(reservedRects(DESKTOP_MIN_WIDTH - 1, 900, { presentation: true })).toHaveLength(1)
    expect(reservedRects(DESKTOP_MIN_WIDTH, 900, { presentation: true })).toHaveLength(3)
  })
})
