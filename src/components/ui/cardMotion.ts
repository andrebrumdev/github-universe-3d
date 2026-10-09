import { stagger, type Variants } from 'framer-motion'

/**
 * Uma linguagem só para a entrada dos cartões (painel lateral, folha do celular, apresentação, cartão do planeta e o
 * balão do dia): desliza da borda de onde vem e acende, desacelerando no fim; sai pelo mesmo caminho, mais rápido.
 * Com movimento reduzido, nada desliza: só um cruzamento de opacidade curto.
 */

/** Desaceleração exponencial: chega decidido e assenta sem quicar. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const
/** A volta: parte devagar e acelera para fora (o contrário da entrada). */
export const EASE_IN = [0.7, 0, 0.84, 0] as const

/** Entrada do cartão (s), dentro dos 280–380 ms. */
export const CARD_ENTER_S = 0.34
/** Saída do cartão (s): mais curta que a entrada. */
export const CARD_EXIT_S = 0.22
/** Cruzamento de opacidade do movimento reduzido (s). */
export const REDUCED_FADE_S = 0.12

/** Escalonamento do conteúdo (s): título, depois os números, depois as linguagens; tudo assentado antes de 0,5 s. */
export const ITEM_START_S = 0.08
export const ITEM_STEP_S = 0.05
export const ITEM_S = 0.26

export type CardEdge = 'right' | 'bottom'

/** Variantes `hidden` → `shown` do cartão que entra pela borda `edge` (direita na coluna, de baixo na folha). */
export function cardVariants(edge: CardEdge, reduced: boolean): Variants {
  if (reduced) {
    return {
      hidden: { opacity: 0, transition: { duration: REDUCED_FADE_S, ease: 'linear' } },
      shown: { opacity: 1, transition: { duration: REDUCED_FADE_S, ease: 'linear' } },
    }
  }
  const away = edge === 'right' ? { x: '100%', y: 0 } : { x: 0, y: '100%' }
  return {
    hidden: {
      ...away,
      opacity: 0,
      transition: { duration: CARD_EXIT_S, ease: EASE_IN, opacity: { duration: CARD_EXIT_S, ease: 'linear' } },
    },
    shown: {
      x: 0,
      y: 0,
      opacity: 1,
      transition: {
        duration: CARD_ENTER_S,
        ease: EASE_OUT,
        // a opacidade chega antes: o cartão já está legível enquanto termina de assentar
        opacity: { duration: CARD_ENTER_S * 0.6, ease: 'linear' },
        delayChildren: stagger(ITEM_STEP_S, { startDelay: ITEM_START_S }),
      },
    },
  }
}

/** Conteúdo que troca dentro de um cartão já aberto (a parada seguinte da apresentação): só o escalonamento. */
export function contentVariants(reduced: boolean): Variants {
  if (reduced) return { hidden: {}, shown: {} }
  return { hidden: {}, shown: { transition: { delayChildren: stagger(ITEM_STEP_S, { startDelay: ITEM_START_S }) } } }
}

/** Um grupo do conteúdo: sobe 8 px e acende na sua vez. */
export const REVEAL_ITEM: Variants = {
  hidden: { opacity: 0, y: 8, transition: { duration: CARD_EXIT_S * 0.6, ease: 'linear' } },
  shown: { opacity: 1, y: 0, transition: { duration: ITEM_S, ease: EASE_OUT } },
}
/** Movimento reduzido: o conteúdo vem junto com o cartão, sem atraso nem deslize. */
export const REVEAL_ITEM_STILL: Variants = { hidden: { opacity: 1, y: 0 }, shown: { opacity: 1, y: 0 } }
