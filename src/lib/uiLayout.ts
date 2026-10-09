/**
 * Medidas fixas (px) dos elementos da interface que a nave da escolta precisa evitar.
 * Fonte única: os botões "? Tutorial" e "▶ Apresentação" e os cartões do tutorial e da apresentação leem daqui,
 * e o posicionamento da nave também.
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

/** Largura do painel lateral aberto no desktop (o SidePanel lê daqui). */
export const SIDE_PANEL_WIDTH = 380
/** Celular: o painel vira uma folha no pé da tela com no máximo essa fração da altura (o `max-h-[60vh]` do SidePanel). */
export const SIDE_SHEET_MAX_HEIGHT = 0.6

/**
 * Desktop: à esquerda do "? Tutorial", na mesma linha. Celular: logo acima dele, alinhado à direita
 * (na mesma linha, os dois tomariam a largura que a nave da escolta usa no canto esquerdo).
 */
export const PRESENTATION_BUTTON = {
  width: 132,
  height: TUTORIAL_BUTTON.height,
  desktopRight: TUTORIAL_BUTTON.right + TUTORIAL_BUTTON.width + UI_GAP,
  desktopBottom: TUTORIAL_BUTTON.bottom,
  phoneRight: TUTORIAL_BUTTON.right,
  phoneBottom: TUTORIAL_BUTTON.bottom + TUTORIAL_BUTTON.height + UI_GAP,
} as const

const PRESENTATION_MARGIN = 16

export const PRESENTATION_CARD = {
  /**
   * Desktop: na coluna do painel lateral (as poses de foco da câmera já deixam o alvo à esquerda dela),
   * acima da linha dos botões, crescendo para cima até `desktopTop` do topo.
   */
  desktopRight: PRESENTATION_MARGIN,
  desktopBottom: TUTORIAL_BUTTON.bottom + TUTORIAL_BUTTON.height + PRESENTATION_MARGIN,
  desktopTop: PRESENTATION_MARGIN,
  desktopWidth: SIDE_PANEL_WIDTH - 2 * PRESENTATION_MARGIN,
  /** Celular: folha presa ao pé da tela, com no máximo essa fração da altura (o resto rola dentro dela). */
  phoneMaxHeight: 0.45,
} as const

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

export function presentationButtonRect(width: number, height: number): Rect {
  const { width: w, height: h } = PRESENTATION_BUTTON
  const desktop = width >= DESKTOP_MIN_WIDTH
  const right = desktop ? PRESENTATION_BUTTON.desktopRight : PRESENTATION_BUTTON.phoneRight
  const bottom = desktop ? PRESENTATION_BUTTON.desktopBottom : PRESENTATION_BUTTON.phoneBottom
  return { x: width - right - w, y: height - bottom - h, w, h }
}

/**
 * Zona do cartão da apresentação. Desktop: a faixa da coluna dele, do topo da tela até a borda de baixo (a altura
 * varia com a parada). Celular: a folha no pé da tela, na altura máxima.
 */
export function presentationCardZone(width: number, height: number): Rect {
  if (width >= DESKTOP_MIN_WIDTH) {
    const { desktopRight, desktopBottom, desktopWidth } = PRESENTATION_CARD
    return { x: width - desktopRight - desktopWidth, y: 0, w: desktopWidth, h: height - desktopBottom }
  }
  const h = Math.ceil(height * PRESENTATION_CARD.phoneMaxHeight)
  return { x: 0, y: height - h, w: width, h }
}

/** "← Galáxia" no canto de cima à esquerda (`left-4 top-4`, texto pequeno), com folga para a fonte. */
export const BACK_BUTTON = { left: 16, top: 16, width: 112, height: 40 } as const

export function backButtonRect(): Rect {
  return { x: BACK_BUTTON.left, y: BACK_BUTTON.top, w: BACK_BUTTON.width, h: BACK_BUTTON.height }
}

/** Zona do painel do planeta/perfil: a coluna da direita no desktop; no celular, a folha no pé da tela na altura máxima. */
export function sidePanelZone(width: number, height: number): Rect {
  if (width >= DESKTOP_MIN_WIDTH) return { x: width - SIDE_PANEL_WIDTH, y: 0, w: SIDE_PANEL_WIDTH, h: height }
  const h = Math.ceil(height * SIDE_SHEET_MAX_HEIGHT)
  return { x: 0, y: height - h, w: width, h }
}

export interface OpenCards {
  tutorial?: boolean
  presentation?: boolean
  /** Painel do planeta/perfil e o "← Galáxia", que aparecem juntos (a nave na visita evita os dois). */
  panel?: boolean
}

/** O que a nave da escolta não pode cobrir: sempre os dois botões; cada cartão, quando aberto. */
export function reservedRects(width: number, height: number, open: OpenCards = {}): Rect[] {
  const rects = [tutorialButtonRect(width, height), presentationButtonRect(width, height)]
  if (open.tutorial) rects.push(tutorialCardZone(width, height))
  if (open.presentation) rects.push(presentationCardZone(width, height))
  if (open.panel) rects.push(sidePanelZone(width, height), backButtonRect())
  return rects
}
