import { describe, expect, it } from 'vitest'
import { EYE, FACE_CENTER, LID, VIAJANDO } from '@/lib/sun/face'
import type { SunExpression } from '@/lib/sun/sunMachine'
import { BLUSH, BROW_WIDTH, drawSunFace, MOUTH_WIDTH, SUN_BODY, SUN_FEATURE, SUN_TEX_H, SUN_TEX_W } from './sunFace'

type Cmd = [string, ...number[]]
type Op = { op: 'fill' | 'stroke' | 'fillRect'; style: string; lineWidth: number; path: Cmd[] }

/** Contexto 2D falso: grava estilo e o caminho (comandos e argumentos) de cada fill/stroke (o teste roda no Node). */
function recorder() {
  const ops: Op[] = []
  let path: Cmd[] = []
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter' }
  const commands = new Set(['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'ellipse', 'closePath'])
  const ctx = new Proxy(state as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key]
      if (key === 'beginPath') return () => (path = [])
      if (commands.has(key)) return (...args: number[]) => path.push([key, ...args])
      if (key === 'fill' || key === 'stroke') {
        return () => ops.push({ op: key, style: String(key === 'fill' ? state.fillStyle : state.strokeStyle), lineWidth: state.lineWidth, path: [...path] })
      }
      if (key === 'fillRect') return () => ops.push({ op: 'fillRect', style: String(state.fillStyle), lineWidth: state.lineWidth, path: [] })
      return () => undefined
    },
    set(target, key: string, value) {
      target[key] = value
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops }
}

/** Olhos abertos (com branco e pupila). */
const EXPRESSIONS: SunExpression[] = ['serious', 'watching', 'happy', 'surprised', 'sad', 'admiring']
const BROWED: SunExpression[] = ['serious', 'happy', 'surprised', 'sad', 'admiring']
/** Traços de cor escura: sobrancelhas OU pálpebras pesadas, e a boca (viajando: traços dos olhos e boca). */
const FEATURES: Record<SunExpression, number> = { viajando: 3, serious: 3, watching: 3, happy: 3, surprised: 3, sad: 3, admiring: 3 }
const draw = (e: SunExpression, closed = false) => {
  const { ctx, ops } = recorder()
  drawSunFace(ctx, e, closed)
  return ops
}

describe('rosto do sol no estilo do Sphere (emoji em LED)', () => {
  it('canvas com resolução para o close-up (pelo menos 1024×512, 2:1 equirretangular)', () => {
    expect(SUN_TEX_W).toBeGreaterThanOrEqual(1024)
    expect(SUN_TEX_W).toBe(SUN_TEX_H * 2)
  })

  it('corpo liso no amarelo-ouro do miolo (o âmbar da borda vem do shader); traços marrom quase preto', () => {
    expect(SUN_BODY.toLowerCase()).toBe('#ffd21a')
    expect(SUN_FEATURE.toLowerCase()).toBe('#1a1206')
    for (const e of [...EXPRESSIONS, 'viajando'] as const) {
      const ops = draw(e)
      expect(ops[0]).toMatchObject({ op: 'fillRect', style: SUN_BODY })
      expect(ops.filter((o) => o.style === SUN_BODY)).toHaveLength(1)
      const styles = new Set(ops.slice(1).map((o) => o.style.toLowerCase()))
      const expected = e === 'viajando' ? ['#1a1206'] : e === 'admiring' ? ['#1a1206', '#ffffff', BLUSH.toLowerCase()] : ['#1a1206', '#ffffff']
      expect([...styles].sort()).toEqual(expected.sort())
    }
  })

  it('olhos abertos: dois brancos REDONDOS do tamanho de EYE; as pupilas ficam no shader (nada preto no canvas)', () => {
    for (const e of EXPRESSIONS) {
      const whites = draw(e).filter((o) => o.op === 'fill' && o.style === '#ffffff')
      expect(whites).toHaveLength(2)
      for (const w of whites) {
        const shape = w.path.find((c) => c[0] === 'ellipse' || c[0] === 'arc')!
        const [rx, ry] = shape[0] === 'arc' ? [shape[3], shape[3]] : [shape[3], shape[4]]
        expect(rx).toBeCloseTo(EYE.rx)
        expect(ry).toBeCloseTo(EYE.rx)
      }
      expect(draw(e).some((o) => o.style === '#000000')).toBe(false)
    }
  })

  it('sobrancelhas por humor: duas barras retas e grossas (só moveTo + lineTo); boca bem mais fina', () => {
    expect(BROW_WIDTH).toBeGreaterThan(2 * MOUTH_WIDTH - 0.5)
    for (const e of BROWED) {
      const brows = draw(e).filter((o) => o.op === 'stroke' && o.lineWidth === BROW_WIDTH)
      expect(brows).toHaveLength(2)
      // admirando: macias (curvas); as outras, barras retas
      for (const b of brows) expect(b.path.map((c) => c[0])).toEqual(e === 'admiring' ? ['moveTo', 'quadraticCurveTo'] : ['moveTo', 'lineTo'])
    }
    for (const e of [...EXPRESSIONS, 'viajando'] as const) expect(draw(e).filter((o) => o.style === SUN_FEATURE).length).toBe(FEATURES[e])
  })

  it('de olho: pálpebra pesada PREENCHIDA cobrindo o topo ~38% de cada branco (ela é a sobrancelha); boca neutra inclinada', () => {
    const ops = draw('watching')
    const lids = ops.filter((o) => o.op === 'fill' && o.style === SUN_FEATURE)
    expect(lids).toHaveLength(2)
    for (const l of lids) {
      expect(l.path.map((c) => c[0])).toEqual(['moveTo', 'arc', 'quadraticCurveTo', 'closePath'])
      const lowerEdgeY = l.path[0][2]
      const eyeTop = FACE_CENTER[1] + EYE.y - EYE.ry
      expect((lowerEdgeY - eyeTop) / (2 * EYE.ry)).toBeCloseTo(LID.cover, 6)
      // a pálpebra passa um pouco da borda do olho (o arco de cima é maior que o branco)
      expect(l.path[1][3]).toBeGreaterThan(EYE.rx)
    }
    expect(ops.some((o) => o.op === 'stroke' && o.lineWidth === BROW_WIDTH)).toBe(false)
    const mouth = ops.find((o) => o.op === 'stroke' && o.lineWidth === MOUTH_WIDTH)!
    const [[, , y1], [, , y2]] = mouth.path
    expect(Math.abs(y2 - y1)).toBeGreaterThan(0.5)
  })

  it('admirando: sem pálpebra pesada, bochechas de LED âmbar-claro (não rosa), sorriso maior', () => {
    const ops = draw('admiring')
    expect(ops.filter((o) => o.op === 'fill' && o.style === SUN_FEATURE)).toHaveLength(0)
    const blush = ops.filter((o) => o.style === BLUSH)
    expect(blush).toHaveLength(2)
    expect(BLUSH).toMatch(/^rgba\(255, 1[5-9]\d, \d{1,2}, 0\.\d+\)$/)
    const smile = ops.find((o) => o.op === 'stroke' && o.lineWidth === MOUTH_WIDTH)!
    const happy = draw('happy').find((o) => o.op === 'stroke' && o.lineWidth === MOUTH_WIDTH)!
    expect(smile.path[0][3]).toBeGreaterThan(happy.path[0][3])
  })

  it('nenhuma expressão desenha sobrancelha e pálpebra pesada juntas', () => {
    for (const e of [...EXPRESSIONS, 'viajando'] as const) {
      const ops = draw(e)
      const brows = ops.some((o) => o.op === 'stroke' && o.lineWidth === BROW_WIDTH)
      const lids = ops.some((o) => o.op === 'fill' && o.style === SUN_FEATURE && o.path.some((c) => c[0] === 'arc'))
      expect(brows && lids).toBe(false)
    }
  })

  it('viajando: olhos em traço reto grosso, sem branco nem sobrancelha, boquinha oval; o rosto à direita do centro', () => {
    const ops = draw('viajando')
    expect(ops.some((o) => o.style === '#ffffff')).toBe(false)
    const dashes = ops.filter((o) => o.op === 'stroke' && o.lineWidth === VIAJANDO.dashWidth)
    expect(dashes).toHaveLength(2)
    for (const d of dashes) {
      const [[, x1, y1], [, x2, y2]] = d.path
      expect(y1).toBeCloseTo(y2)
      expect(Math.abs(x2 - x1)).toBeCloseTo(2 * VIAJANDO.dashHalf)
    }
    const centre = dashes.map((d) => (d.path[0][1] + d.path[1][1]) / 2).reduce((a, b) => a + b) / 2
    expect(centre).toBeGreaterThan(128)
    const mouth = ops.find((o) => o.op === 'fill' && o.style === SUN_FEATURE)!
    expect(mouth.path[0][0]).toBe('ellipse')
  })

  it('sério: as duas sobrancelhas niveladas e a boca um meio sorriso torto (assimétrico)', () => {
    const ops = draw('serious')
    for (const b of ops.filter((o) => o.op === 'stroke' && o.lineWidth === BROW_WIDTH)) {
      const [[, , y1], [, , y2]] = b.path
      expect(y1).toBeCloseTo(y2)
    }
    const mouth = ops.find((o) => o.op === 'stroke' && o.lineWidth === MOUTH_WIDTH)!
    const curve = mouth.path.find((c) => c[0] === 'quadraticCurveTo')!
    const start = mouth.path.find((c) => c[0] === 'moveTo')!
    // pontas em alturas diferentes: o canto de um lado sobe mais
    expect(Math.abs(start[2] - curve[4])).toBeGreaterThan(0.5)
  })

  it('piscando: sem branco (o shader não acha onde pôr as pupilas), pálpebras fechadas e sobrancelhas no lugar', () => {
    for (const e of EXPRESSIONS) {
      const ops = draw(e, true)
      expect(ops.some((o) => o.style === '#ffffff')).toBe(false)
      expect(ops.some((o) => o.op === 'fill' && o.style === SUN_FEATURE && o.path.some((c) => c[0] === 'arc'))).toBe(false)
      // 2 pálpebras fechadas + sobrancelhas (se houver) + boca
      expect(ops.filter((o) => o.style === SUN_FEATURE).length).toBe(e === 'watching' ? 3 : 5)
    }
  })

  it('viajando: piscar não muda nada (os olhos já são traços)', () => {
    expect(draw('viajando', true)).toEqual(draw('viajando', false))
  })
})
