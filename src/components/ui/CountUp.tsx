import { useLayoutEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import { COUNT_UP_DELAY_MS, countUpDuration, countUpValue } from '@/lib/countUp'
import { formatCount } from '@/lib/format'

/**
 * Número que conta de 0 até `value` quando aparece (e de novo se o valor mudar), formatado como o final ("1,2 mil").
 * Sem React por quadro: o laço escreve direto no texto. O leitor de tela lê só o valor final, na hora; os dígitos
 * que correm ficam escondidos dele. Com movimento reduzido, o valor final na hora.
 */
export function CountUp({ value }: { value: number }) {
  const digits = useRef<HTMLSpanElement>(null)
  const reduced = useReducedMotion() ?? false

  useLayoutEffect(() => {
    const el = digits.current
    if (!el) return
    const duration = reduced ? 0 : countUpDuration(value)
    let shown = ''
    const paint = (n: number) => {
      const text = formatCount(n)
      if (text !== shown) el.textContent = shown = text
    }
    // antes da pintura: nunca aparece vazio nem com o valor de antes
    paint(countUpValue(value, 0, duration))
    if (duration === 0) return
    const start = performance.now() + COUNT_UP_DELAY_MS
    let frame = 0
    const tick = (now: number) => {
      const elapsed = now - start
      paint(countUpValue(value, elapsed, duration))
      if (elapsed < duration) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, reduced])

  return (
    <>
      <span className="sr-only">{formatCount(value)}</span>
      <span ref={digits} aria-hidden="true" className="tabular-nums" />
    </>
  )
}
