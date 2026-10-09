import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { REVEAL_ITEM, REVEAL_ITEM_STILL } from './cardMotion'

/** Um grupo do conteúdo do cartão, que entra na sua vez (herda `hidden`/`shown` do cartão; ver cardMotion). */
export function Reveal({ className, children }: { className?: string; children: ReactNode }) {
  const reduced = useReducedMotion() ?? false
  return (
    <motion.div variants={reduced ? REVEAL_ITEM_STILL : REVEAL_ITEM} className={className}>
      {children}
    </motion.div>
  )
}
