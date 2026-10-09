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
} from './uiLayout'

const PHONE: [number, number] = [375, 667]
const DESKTOP: [number, number] = [1280, 800]

describe('floatingButtonsHidden', () => {
  it('celular com o painel (planeta, lua, sol) ou o cartão da apresentação aberto: os botões somem', () => {
    expect(floatingButtonsHidden(true, { panel: true })).toBe(true)
    expect(floatingButtonsHidden(true, { presentation: true })).toBe(true)
    expect(floatingButtonsHidden(true, { panel: true, tutorial: true })).toBe(true)
  })
  it('celular sem painel nem apresentação (só o tutorial, ou nada): os botões ficam', () => {
    expect(floatingButtonsHidden(true, {})).toBe(false)
    expect(floatingButtonsHidden(true, { tutorial: true })).toBe(false)
  })
  it('desktop: os botões ficam sempre (o painel é uma coluna, a folha não existe)', () => {
    for (const open of [{}, { panel: true }, { presentation: true }, { tutorial: true }]) expect(floatingButtonsHidden(false, open)).toBe(false)
  })
})

describe('reservedRects', () => {
  it('celular com o painel aberto: só a folha e o "← Galáxia", sem os botões escondidos', () => {
    expect(reservedRects(...PHONE, { panel: true })).toEqual([sidePanelZone(...PHONE), backButtonRect()])
  })
  it('celular com a apresentação: só a folha dela', () => {
    expect(reservedRects(...PHONE, { presentation: true })).toEqual([presentationCardZone(...PHONE)])
  })
  it('celular sem nada aberto e desktop com o painel: os dois botões continuam reservados', () => {
    expect(reservedRects(...PHONE)).toEqual([tutorialButtonRect(...PHONE), presentationButtonRect(...PHONE)])
    const desktop = reservedRects(...DESKTOP, { panel: true })
    expect(desktop).toContainEqual(tutorialButtonRect(...DESKTOP))
    expect(desktop).toContainEqual(presentationButtonRect(...DESKTOP))
  })
  it('a fronteira do celular é a mesma do MOBILE_QUERY (max-width: 767px)', () => {
    expect(reservedRects(DESKTOP_MIN_WIDTH - 1, 900, { panel: true })).toHaveLength(2)
    expect(reservedRects(DESKTOP_MIN_WIDTH, 900, { panel: true })).toHaveLength(4)
  })
})
