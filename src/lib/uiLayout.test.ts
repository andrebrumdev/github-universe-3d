import { afterEach, describe, expect, it } from 'vitest'
import {
  backButtonRect,
  DESKTOP_MIN_WIDTH,
  floatingButtonsHidden,
  isSheetLayout,
  presentationButtonRect,
  presentationCardZone,
  reservedRects,
  setSafeArea,
  sidePanelWidth,
  sidePanelZone,
  TOUCH_TARGET,
  tutorialButtonRect,
  tutorialCardBottom,
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

describe('isSheetLayout', () => {
  it('celular em pé: folha; celular deitado e baixo: coluna lateral, como no desktop', () => {
    expect(isSheetLayout(375, 667)).toBe(true)
    expect(isSheetLayout(412, 915)).toBe(true)
    expect(isSheetLayout(667, 375)).toBe(false)
    expect(isSheetLayout(844, 390)).toBe(false)
    expect(isSheetLayout(1280, 800)).toBe(false)
  })
  it('estreito mas alto (janela de desktop deitada): continua folha', () => {
    expect(isSheetLayout(760, 600)).toBe(true)
  })
})

describe('celular deitado (667×375)', () => {
  const LAND: [number, number] = [667, 375]
  it('o painel lateral fica com metade da largura (a cena com a outra metade)', () => {
    expect(sidePanelWidth(LAND[0])).toBe(333)
    expect(sidePanelWidth(1280)).toBe(380)
    expect(sidePanelZone(...LAND)).toEqual({ x: 334, y: 0, w: 333, h: 375 })
  })
  it('o cartão da apresentação cabe na coluna do painel', () => {
    const card = presentationCardZone(...LAND)
    const panel = sidePanelZone(...LAND)
    expect(card.x).toBeGreaterThanOrEqual(panel.x)
    expect(card.x + card.w).toBeLessThanOrEqual(LAND[0])
  })
  it('o cartão do tutorial não sobe para fora de uma tela baixa', () => {
    expect(tutorialCardBottom(375)).toBeLessThan(150)
    expect(tutorialCardBottom(800)).toBe(224)
    expect(tutorialCardZone(...LAND).h).toBeGreaterThan(375 / 2)
  })
})

describe('alvos de toque', () => {
  it('os botões fixos reservam 44 px de altura', () => {
    expect(tutorialButtonRect(...PHONE).h).toBe(TOUCH_TARGET)
    expect(presentationButtonRect(...PHONE).h).toBe(TOUCH_TARGET)
    expect(backButtonRect().h).toBe(TOUCH_TARGET)
    expect(TOUCH_TARGET).toBeGreaterThanOrEqual(44)
  })
  it('no celular, "▶ Apresentação" fica acima do "? Tutorial" sem encostar', () => {
    const tutorial = tutorialButtonRect(...PHONE)
    const presentation = presentationButtonRect(...PHONE)
    expect(presentation.y + presentation.h).toBeLessThanOrEqual(tutorial.y)
  })
})

describe('áreas seguras', () => {
  afterEach(() => setSafeArea({ top: 0, right: 0, bottom: 0, left: 0 }))
  it('os botões e cartões se afastam do indicador de início e do notch, como no CSS (env)', () => {
    const before = { tutorial: tutorialButtonRect(...PHONE), back: backButtonRect(), card: tutorialCardZone(...PHONE) }
    setSafeArea({ top: 47, right: 0, bottom: 34, left: 0 })
    expect(tutorialButtonRect(...PHONE).y).toBe(before.tutorial.y - 34)
    expect(presentationButtonRect(...PHONE).y + TOUCH_TARGET).toBeLessThanOrEqual(tutorialButtonRect(...PHONE).y)
    expect(backButtonRect().y).toBe(before.back.y + 47)
    expect(tutorialCardZone(...PHONE).h).toBe(before.card.h - 34)
  })
  it('deitado, o notch do lado empurra os elementos da direita e da esquerda', () => {
    setSafeArea({ top: 0, right: 47, bottom: 21, left: 47 })
    expect(tutorialButtonRect(844, 390).x + TOUCH_TARGET).toBeLessThanOrEqual(844 - 47)
    expect(backButtonRect().x).toBe(16 + 47)
  })
})
