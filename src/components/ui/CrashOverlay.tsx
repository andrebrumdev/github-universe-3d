import { useEffect, useMemo, useRef } from 'react'
import { crackPattern, crackRetraction, type Crack } from '@/lib/crash/crack'
import { crackHeal, crashFlash, crashShake, HEAL_END } from '@/lib/crash/timeline'
import { crashClock, useCrash } from '@/store/crash'

const points = (c: Crack) => c.points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

/**
 * Vidro trincado da trombada (easter egg): camada de DOM por cima do canvas e abaixo do balão da fala e dos painéis
 * (z-[12]), sem eventos de ponteiro e escondida dos leitores de tela. Um clarão branco curto, a trinca (SVG
 * procedural do ponto do impacto até as bordas, de ponta a ponta) tremendo com a tela, e a cura: cada rachadura se
 * recolhe para o impacto pelo tracejado (no mesmo tempo total, por mais longa que seja) até a camada sair. Anima por
 * requestAnimationFrame direto no DOM, sem renderizar o React por quadro, no relógio da cena (`crashClock`).
 */
export function CrashOverlay() {
  const impact = useCrash((s) => s.impact)
  const clear = useCrash((s) => s.clear)
  const root = useRef<HTMLDivElement>(null)
  const flash = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)

  const scene = useMemo(() => {
    if (!impact) return null
    const { innerWidth: w, innerHeight: h } = window
    const pattern = crackPattern(impact.seed, impact.x, impact.y, w, h)
    return { w, h, cracks: [...pattern.rings, ...pattern.rays] }
  }, [impact])

  useEffect(() => {
    if (!impact || !scene) return
    const shake = { x: 0, y: 0 }
    const lines = Array.from(svg.current?.querySelectorAll<SVGPolylineElement>('[data-crack]') ?? [])
    const shine = svg.current?.querySelector<SVGCircleElement>('[data-shine]')
    let frame = 0
    const tick = () => {
      // tempo de cena desde o impacto (o mesmo da nave); −1 se outra coisa encerrou a trombada
      const t = crashClock.since
      if (t < 0 || t >= HEAL_END) {
        clear(impact.seq)
        return
      }
      crashShake(t, shake)
      if (root.current) root.current.style.transform = shake.x || shake.y ? `translate(${shake.x}px, ${shake.y}px)` : ''
      if (flash.current) flash.current.style.opacity = String(crashFlash(t))
      const heal = crackHeal(t)
      for (const line of lines) {
        const c = scene.cracks[Number(line.dataset.crack)]
        // a rachadura recolhe para o começo dela (o impacto, ou o ponto de onde o galho sai)
        line.style.strokeDashoffset = String(c.length * crackRetraction(heal, c.delay))
      }
      if (shine) shine.style.opacity = String(1 - heal)
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [impact, scene, clear])

  if (!impact || !scene) return null
  const { w, h, cracks } = scene
  return (
    <div ref={root} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[12]">
      <div ref={flash} className="absolute inset-0 bg-white" style={{ opacity: 0 }} />
      <svg ref={svg} className="absolute inset-0" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <defs>
          <radialGradient id="crash-shine">
            <stop offset="0" stopColor="#e0f2fe" stopOpacity="0.35" />
            <stop offset="1" stopColor="#e0f2fe" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* brilho leve no ponto do impacto (o vidro esmagado) */}
        <circle data-shine cx={impact.x} cy={impact.y} r={Math.min(w, h) * 0.12} fill="url(#crash-shine)" />
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {cracks.map((c, i) => (
            <g key={i}>
              {/* reflexo azul-claro largo por baixo, linha branca fina por cima */}
              <polyline
                data-crack={i}
                points={points(c)}
                stroke="#bae6fd"
                strokeOpacity={0.3}
                strokeWidth={c.kind === 'ray' ? 3.5 : 2.5}
                strokeDasharray={`${c.length} ${c.length}`}
              />
              <polyline
                data-crack={i}
                points={points(c)}
                stroke="#ffffff"
                strokeOpacity={c.kind === 'ring' ? 0.7 : 0.9}
                strokeWidth={c.kind === 'ray' ? 1.2 : 0.9}
                strokeDasharray={`${c.length} ${c.length}`}
              />
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
