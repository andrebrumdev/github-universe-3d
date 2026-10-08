import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { OctocatExpression } from '@/lib/octocat/expression'

// Paleta do modelo 3D aprovado (Octocat clássico, nave lilás, Clawd em pé na cabeça).
const SHIP = '#C4B5FD'
const CREAM = '#F1EAD8'
const DOME = '#A5F3FC'
const HEADLIGHT = '#FFF3C4'
const BODY = '#211A2B'
const BODY_UNDER = '#3B2D50'
const SUCKER = '#9BC4C8'
const FACE = '#FAD4AC'
const EYE_WHITE = '#DCECEC'
const IRIS = '#9C4B3B'
const MOUTH = '#45204F'
const TONGUE = '#E9A6B4'
const CLAWD = '#D97757'
const CLAWD_EYE = '#141413'
const SQUARES = ['#39D353', '#26A641', '#39D353', '#0E4429', '#39D353', '#26A641', '#39D353']

function Eye({ cx, cy, look = [0, 0] }: { cx: number; cy: number; look?: [number, number] }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={11} ry={14} fill={EYE_WHITE} />
      <ellipse cx={cx + 1 + look[0]} cy={cy + 3 + look[1]} rx={7} ry={9} fill={IRIS} />
      <circle cx={cx + 3 + look[0]} cy={cy - 1 + look[1]} r={2.6} fill="#FFFFFF" />
      {/* cílio rente ao olho (não sobrancelha) */}
      <path d={`M${cx - 11} ${cy - 9} Q${cx} ${cy - 17} ${cx + 11} ${cy - 9}`} stroke={IRIS} strokeWidth={1.4} fill="none" strokeLinecap="round" />
    </g>
  )
}

/** Olho fechado em arco (feliz/piscadinha) ou em traço (piscada). */
const closedEye = (cx: number, cy: number, arc: boolean) =>
  arc ? `M${cx - 10} ${cy + 3} Q${cx} ${cy - 9} ${cx + 10} ${cy + 3}` : `M${cx - 10} ${cy + 2} L${cx + 10} ${cy + 2}`

const OPEN_SMILE = (
  <g>
    <path d="M186 221 Q200 223 214 221 Q212 240 200 241 Q188 240 186 221 Z" fill={MOUTH} />
    <path d="M192 234 Q200 228 208 234 Q204 241 200 241 Q196 241 192 234 Z" fill={TONGUE} />
  </g>
)

function Face({ expression, blinking }: { expression: OctocatExpression; blinking: boolean }) {
  const lid = (cx: number, arc: boolean) => (
    <path d={closedEye(cx, 196, arc)} stroke={IRIS} strokeWidth={3.2} fill="none" strokeLinecap="round" />
  )
  switch (expression) {
    case 'happy':
      return (
        <g>
          {lid(180, true)}
          {lid(220, true)}
          {OPEN_SMILE}
        </g>
      )
    case 'wink':
      return (
        <g>
          <Eye cx={180} cy={196} />
          {lid(220, true)}
          <path d="M188 224 Q200 234 212 224" stroke={MOUTH} strokeWidth={3} fill="none" strokeLinecap="round" />
        </g>
      )
    case 'surprised':
      return (
        <g>
          <Eye cx={180} cy={194} />
          <Eye cx={220} cy={194} />
          <ellipse cx={200} cy={230} rx={6} ry={8} fill={MOUTH} />
        </g>
      )
    case 'thinking':
      return (
        <g>
          <Eye cx={180} cy={196} look={[3, -4]} />
          <Eye cx={220} cy={196} look={[3, -4]} />
          <path d="M190 226 Q199 233 210 224" stroke={MOUTH} strokeWidth={3} fill="none" strokeLinecap="round" />
          <circle cx={278} cy={150} r={5} fill="#9AA3B8" />
          <circle cx={294} cy={130} r={7} fill="#9AA3B8" />
          <circle cx={314} cy={106} r={9} fill="#9AA3B8" />
        </g>
      )
    default:
      return blinking ? (
        <g>
          {lid(180, false)}
          {lid(220, false)}
          {OPEN_SMILE}
        </g>
      ) : (
        <g>
          <Eye cx={180} cy={196} />
          <Eye cx={220} cy={196} />
          {OPEN_SMILE}
        </g>
      )
  }
}

/** Tentáculo: roxo-escuro por cima, faixa mais clara por baixo e ventosas verde-água. */
function Tentacle({ d, suckers }: { d: string; suckers: [number, number, number][] }) {
  return (
    <g>
      <path d={d} stroke={BODY} strokeWidth={17} fill="none" strokeLinecap="round" />
      <path d={d} stroke={BODY_UNDER} strokeWidth={7} fill="none" strokeLinecap="round" transform="translate(2 3)" />
      {suckers.map(([x, y, rot], i) => (
        <ellipse key={i} cx={x} cy={y} rx={4.5} ry={2.6} fill={SUCKER} transform={`rotate(${rot} ${x} ${y})`} />
      ))}
    </g>
  )
}

export function OctocatArt({ expression, waving = false }: { expression: OctocatExpression; waving?: boolean }) {
  const reduced = useReducedMotion()
  const [blinking, setBlinking] = useState(false)

  useEffect(() => {
    if (reduced) return
    let reopen = 0
    const interval = window.setInterval(() => {
      setBlinking(true)
      reopen = window.setTimeout(() => setBlinking(false), 150)
    }, 4000)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(reopen)
    }
  }, [reduced])

  return (
    <svg viewBox="0 0 400 420" className="h-auto w-full drop-shadow-[0_0_18px_rgba(196,181,253,0.35)]" aria-hidden="true">
      {/* asas enflechadas, atrás do casco (vista de frente: o propulsor fica escondido atrás) */}
      <path d="M84 318 L18 374 L42 380 L120 336 Z" fill={SHIP} />
      <path d="M316 318 L382 374 L358 380 L280 336 Z" fill={SHIP} />
      <path d="M28 372 L42 380 L120 336 L112 332 Z" fill={SUCKER} opacity={0.8} />
      <path d="M372 372 L358 380 L280 336 L288 332 Z" fill={SUCKER} opacity={0.8} />

      {/* corpo e tentáculos do Octocat (dentro da cabine) */}
      <path d="M154 304 Q148 240 200 234 Q252 240 246 304 Z" fill={BODY} />
      <Tentacle
        d="M240 262 Q282 256 292 292"
        suckers={[
          [262, 262, -10],
          [282, 272, 40],
        ]}
      />
      <motion.g
        style={{ transformOrigin: '160px 260px', transformBox: 'view-box' }}
        animate={waving && !reduced ? { rotate: [0, -18, 8, -18, 0] } : { rotate: 0 }}
        transition={waving && !reduced ? { duration: 1.2, repeat: Infinity } : { duration: 0.3 }}
      >
        <Tentacle
          d="M160 260 Q118 246 112 206 Q108 178 128 174"
          suckers={[
            [136, 254, 20],
            [118, 230, 70],
            [113, 204, 90],
          ]}
        />
      </motion.g>

      {/* cabeça com orelhas de gato */}
      <path d="M138 168 L134 108 L178 140 Z" fill={BODY} />
      <path d="M262 168 L266 108 L222 140 Z" fill={BODY} />
      <path d="M144 150 L142 122 L166 140 Z" fill={BODY_UNDER} />
      <path d="M256 150 L258 122 L234 140 Z" fill={BODY_UNDER} />
      <ellipse cx={200} cy={190} rx={72} ry={58} fill={BODY} />
      <path d="M150 196 Q146 166 174 164 Q200 170 226 164 Q254 166 250 196 Q250 238 200 242 Q150 238 150 196 Z" fill={FACE} />
      <ellipse cx={200} cy={214} rx={4.5} ry={2.8} fill={IRIS} />
      <Face expression={expression} blinking={blinking} />
      {/* bigodes */}
      <path d="M150 208 L120 202 M150 215 L118 218 M250 208 L280 202 M250 215 L282 218" stroke="#000000" strokeWidth={1.6} strokeLinecap="round" />

      {/* Clawd em pé na cabeça: corpo largo, olhos pretos, bracinhos e 4 perninhas */}
      <g shapeRendering="crispEdges">
        <rect x={174} y={124} width={7} height={12} fill={CLAWD} />
        <rect x={187} y={124} width={7} height={12} fill={CLAWD} />
        <rect x={206} y={124} width={7} height={12} fill={CLAWD} />
        <rect x={219} y={124} width={7} height={12} fill={CLAWD} />
        <rect x={172} y={90} width={56} height={35} fill={CLAWD} />
        <rect x={162} y={103} width={11} height={9} fill={CLAWD} />
        <rect x={227} y={103} width={11} height={9} fill={CLAWD} />
        <rect x={186} y={99} width={6} height={13} fill={CLAWD_EYE} />
        <rect x={208} y={99} width={6} height={13} fill={CLAWD_EYE} />
      </g>

      {/* casco em banheira, aro creme, quadradinhos e faróis */}
      <ellipse cx={200} cy={322} rx={152} ry={50} fill={SHIP} />
      <ellipse cx={200} cy={340} rx={140} ry={32} fill="#000000" fillOpacity={0.18} />
      <path d="M50 304 Q200 324 350 304" stroke={CREAM} strokeWidth={9} fill="none" strokeLinecap="round" />
      {SQUARES.map((color, i) => (
        <rect key={i} x={112 + i * 28} y={[310, 313, 315, 315, 315, 313, 310][i]} width={10} height={10} rx={2} fill={color} />
      ))}
      <circle cx={130} cy={340} r={10} fill={HEADLIGHT} stroke={CREAM} strokeWidth={3} />
      <circle cx={270} cy={340} r={10} fill={HEADLIGHT} stroke={CREAM} strokeWidth={3} />

      {/* cúpula de vidro */}
      <path d="M54 300 Q54 58 200 56 Q346 58 346 300 Z" fill={DOME} fillOpacity={0.12} stroke={DOME} strokeOpacity={0.55} strokeWidth={2.5} />
      <path d="M92 176 Q104 114 156 88" stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={7} fill="none" strokeLinecap="round" />
    </svg>
  )
}
