/**
 * Medidas fixas (px) dos elementos da interface que a nave da escolta precisa evitar.
 * Fonte única: o botão "? Tutorial" e o cartão do tutorial leem daqui, e o posicionamento da nave também.
 */

/** Retângulo na tela, em px, com origem no canto superior esquerdo. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Folga entre a nave e a interface (e as bordas da tela). */
export const UI_GAP = 8
/** Largura a partir da qual vale o layout de desktop (o `md` do Tailwind: 48rem). */
export const DESKTOP_MIN_WIDTH = 768

export const TUTORIAL_BUTTON = { right: 16, bottom: 16, width: 96, height: 32 } as const

export const TUTORIAL_CARD = {
  /** Celular: ocupa a largura toda, com essa margem dos lados, a essa distância do pé da tela. */
  phoneInset: 16,
  phoneBottom: 144,
  /** Desktop: no canto direito, com essa largura. */
  desktopRight: 16,
  desktopBottom: 224,
  desktopWidth: 340,
} as const

/** Largura do painel lateral aberto no desktop (espelho de `md:w-[380px]` do SidePanel). */
export const SIDE_PANEL_WIDTH = 380

export function tutorialButtonRect(width: number, height: number): Rect {
  const { right, bottom, width: w, height: h } = TUTORIAL_BUTTON
  return { x: width - right - w, y: height - bottom - h, w, h }
}

/**
 * Zona do cartão do tutorial: da borda de baixo dele até o topo da tela, na faixa horizontal dele.
 * A altura do cartão varia com o texto; como a nave fica sempre abaixo, só a borda de baixo importa.
 */
export function tutorialCardZone(width: number, height: number): Rect {
  if (width >= DESKTOP_MIN_WIDTH) {
    const { desktopRight, desktopBottom, desktopWidth } = TUTORIAL_CARD
    return { x: width - desktopRight - desktopWidth, y: 0, w: desktopWidth, h: height - desktopBottom }
  }
  const { phoneInset, phoneBottom } = TUTORIAL_CARD
  return { x: phoneInset, y: 0, w: width - 2 * phoneInset, h: height - phoneBottom }
}

/** O que a nave da escolta não pode cobrir: sempre o botão; o cartão, quando o tutorial está aberto. */
export function reservedRects(width: number, height: number, tutorialOpen: boolean): Rect[] {
  const rects = [tutorialButtonRect(width, height)]
  if (tutorialOpen) rects.push(tutorialCardZone(width, height))
  return rects
}
