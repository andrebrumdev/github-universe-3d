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
/**
 * Celular deitado: com até essa altura, a folha no pé da tela deixaria uma faixa fina de cena. Aí vale o layout
 * lateral (painel em coluna), como no desktop.
 */
export const SHORT_LANDSCAPE_MAX_HEIGHT = 500
/** Alvo de toque: 44 px (HIG). Os botões fixos reservam essa altura; com mouse eles desenham menos, no mesmo lugar. */
export const TOUCH_TARGET = 44

/**
 * Layout de folha (o painel vira uma folha no pé da tela): estreito e em pé, ou estreito e alto. Celular deitado e
 * baixo usa a coluna lateral. O mesmo critério do MOBILE_QUERY (hooks/useMediaQuery) e da variante `side:` do CSS.
 */
export function isSheetLayout(width: number, height: number): boolean {
  return width < DESKTOP_MIN_WIDTH && (height >= width || height > SHORT_LANDSCAPE_MAX_HEIGHT)
}

/** Áreas seguras da tela (notch, cantos, indicador de início), em px. */
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * As áreas seguras atuais: o CSS usa `env(safe-area-inset-*)` e o `useSafeAreaSync` mede os mesmos valores para cá,
 * para os retângulos da nave baterem com o que está na tela. Mutável de propósito (como o shipPose); zero fora do iOS.
 */
export const safeArea: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

export function setSafeArea(insets: Insets): void {
  Object.assign(safeArea, insets)
}

export const TUTORIAL_BUTTON = { right: 16, bottom: 16, width: 96, height: TOUCH_TARGET } as const

export const TUTORIAL_CARD = {
  /** Celular: ocupa a largura toda, com essa margem dos lados, a essa distância do pé da tela. */
  phoneInset: 16,
  phoneBottom: 144,
  /** Desktop: no canto direito, com essa largura, a essa distância do pé da tela, ou a essa fração da altura se for menor. */
  desktopRight: 16,
  desktopBottom: 224,
  desktopBottomFraction: 0.3,
  desktopWidth: 340,
} as const

/** Distância do cartão do tutorial ao pé da tela no layout lateral: numa tela baixa, ele não sobe para fora dela. */
export function tutorialCardBottom(height: number): number {
  return Math.min(TUTORIAL_CARD.desktopBottom, Math.round(height * TUTORIAL_CARD.desktopBottomFraction))
}

/** Largura máxima do painel lateral aberto (o SidePanel lê daqui). */
export const SIDE_PANEL_WIDTH = 380
/** Num celular deitado, o painel lateral não passa dessa fração da largura (a cena fica com o resto). */
export const SIDE_PANEL_MAX_FRACTION = 0.5

/** Largura do painel lateral nessa tela: SIDE_PANEL_WIDTH, ou metade da largura num celular deitado. */
export function sidePanelWidth(width: number): number {
  return Math.min(SIDE_PANEL_WIDTH, Math.floor(width * SIDE_PANEL_MAX_FRACTION))
}

/** Celular: o painel vira uma folha no pé da tela com no máximo essa fração da altura visível (o SidePanel lê daqui, em dvh). */
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
  /** Na largura do painel lateral, menos as margens (ver `sidePanelWidth`). */
  desktopMargin: 2 * PRESENTATION_MARGIN,
  /** Celular: folha presa ao pé da tela, com no máximo essa fração da altura (o resto rola dentro dela). */
  phoneMaxHeight: 0.45,
} as const

export function tutorialButtonRect(width: number, height: number): Rect {
  const { right, bottom, width: w, height: h } = TUTORIAL_BUTTON
  return { x: width - right - safeArea.right - w, y: height - bottom - safeArea.bottom - h, w, h }
}

/**
 * Zona do cartão do tutorial: da borda de baixo dele até o topo da tela, na faixa horizontal dele.
 * A altura do cartão varia com o texto; como a nave fica sempre abaixo, só a borda de baixo importa.
 */
export function tutorialCardZone(width: number, height: number): Rect {
  if (!isSheetLayout(width, height)) {
    const { desktopRight, desktopWidth } = TUTORIAL_CARD
    return { x: width - desktopRight - safeArea.right - desktopWidth, y: 0, w: desktopWidth, h: height - tutorialCardBottom(height) - safeArea.bottom }
  }
  const { phoneInset, phoneBottom } = TUTORIAL_CARD
  return {
    x: phoneInset + safeArea.left,
    y: 0,
    w: width - 2 * phoneInset - safeArea.left - safeArea.right,
    h: height - phoneBottom - safeArea.bottom,
  }
}

export function presentationButtonRect(width: number, height: number): Rect {
  const { width: w, height: h } = PRESENTATION_BUTTON
  const side = !isSheetLayout(width, height)
  const right = side ? PRESENTATION_BUTTON.desktopRight : PRESENTATION_BUTTON.phoneRight
  const bottom = side ? PRESENTATION_BUTTON.desktopBottom : PRESENTATION_BUTTON.phoneBottom
  return { x: width - right - safeArea.right - w, y: height - bottom - safeArea.bottom - h, w, h }
}

/**
 * Zona do cartão da apresentação. Desktop: a faixa da coluna dele, do topo da tela até a borda de baixo (a altura
 * varia com a parada). Celular: a folha no pé da tela, na altura máxima.
 */
export function presentationCardZone(width: number, height: number): Rect {
  if (!isSheetLayout(width, height)) {
    const { desktopRight, desktopBottom, desktopMargin } = PRESENTATION_CARD
    const w = sidePanelWidth(width) - desktopMargin
    return { x: width - desktopRight - safeArea.right - w, y: 0, w, h: height - desktopBottom - safeArea.bottom }
  }
  const h = Math.ceil(height * PRESENTATION_CARD.phoneMaxHeight)
  return { x: 0, y: height - h, w: width, h }
}

/** "← Galáxia" no canto de cima à esquerda (o BackButton lê posição e tamanho daqui). */
export const BACK_BUTTON = { left: 16, top: 16, width: 112, height: TOUCH_TARGET } as const

export function backButtonRect(): Rect {
  return { x: BACK_BUTTON.left + safeArea.left, y: BACK_BUTTON.top + safeArea.top, w: BACK_BUTTON.width, h: BACK_BUTTON.height }
}

/** Zona do painel do planeta/perfil: a coluna da direita no desktop; no celular, a folha no pé da tela na altura máxima. */
export function sidePanelZone(width: number, height: number): Rect {
  if (!isSheetLayout(width, height)) {
    const w = sidePanelWidth(width)
    return { x: width - w, y: 0, w, h: height }
  }
  const h = Math.ceil(height * SIDE_SHEET_MAX_HEIGHT)
  return { x: 0, y: height - h, w: width, h }
}

export interface OpenCards {
  tutorial?: boolean
  presentation?: boolean
  /** Painel do planeta/perfil e o "← Galáxia", que aparecem juntos (a nave na visita evita os dois). */
  panel?: boolean
  /** Modo de foco na nave: o "← Galáxia" e a dica no pé da tela, sem painel. */
  ship?: boolean
}

/** Dica do modo de foco na nave: centrada no pé da tela (no celular, em até duas linhas). */
export const SHIP_HINT = { bottom: 16, maxWidth: 440, height: 36, phoneHeight: 56, inset: 16 } as const

export function shipHintZone(width: number, height: number): Rect {
  const { bottom, maxWidth, inset } = SHIP_HINT
  const h = isSheetLayout(width, height) ? SHIP_HINT.phoneHeight : SHIP_HINT.height
  const w = Math.min(maxWidth, width - 2 * inset - safeArea.left - safeArea.right)
  return { x: (width - w) / 2, y: height - bottom - safeArea.bottom - h, w, h }
}

/**
 * Com o painel (planeta, lua, sol) aberto, os botões "? Tutorial" e "▶ Apresentação" somem em qualquer largura: no
 * celular a folha ocupa o lugar deles, e da tela larga para cima eles cairiam em cima da coluna do painel. O
 * "← Galáxia" e o ✕ cuidam da navegação. No modo de foco na nave também somem (o "← Galáxia" e o Esc saem dele). O
 * cartão da apresentação também os tira no celular (no desktop ele fica acima da linha dos botões). `phone` = layout de
 * folha (o MOBILE_QUERY).
 */
export function floatingButtonsHidden(phone: boolean, open: OpenCards = {}): boolean {
  return Boolean(open.panel || open.ship || (phone && open.presentation))
}

/** O que a nave da escolta não pode cobrir: os dois botões, quando aparecem; cada cartão, quando está na tela. */
export function reservedRects(width: number, height: number, open: OpenCards = {}): Rect[] {
  const rects = floatingButtonsHidden(isSheetLayout(width, height), open) ? [] : [tutorialButtonRect(width, height), presentationButtonRect(width, height)]
  // O cartão do tutorial cede ao painel e ao modo de foco (some enquanto eles estão abertos: ver `tutorialCardVisible`).
  if (open.tutorial && !open.panel && !open.ship) rects.push(tutorialCardZone(width, height))
  if (open.presentation) rects.push(presentationCardZone(width, height))
  if (open.panel) rects.push(sidePanelZone(width, height), backButtonRect())
  if (open.ship) rects.push(backButtonRect(), shipHintZone(width, height))
  return rects
}
