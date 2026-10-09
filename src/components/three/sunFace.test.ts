import { describe, expect, it } from 'vitest'
import type { SunExpression } from '@/lib/sun/sunMachine'
import { drawSunFace, SUN_BODY, SUN_FEATURE, SUN_TEX_H, SUN_TEX_W } from './sunFace'

type Op = { op: 'fill' | 'stroke' | 'fillRect'; style: string; lineWidth: number }

/** Contexto 2D falso: grava o estilo de cada fill/stroke (o teste roda no Node, sem canvas). */
function recorder() {
  const ops: Op[] = []
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt' }
  const ctx = new Proxy(state as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key]
      if (key === 'fill') return () => ops.push({ op: 'fill', style: String(state.fillStyle), lineWidth: state.lineWidth })
      if (key === 'stroke') return () => ops.push({ op: 'stroke', style: String(state.strokeStyle), lineWidth: state.lineWidth })
      if (key === 'fillRect') return () => ops.push({ op: 'fillRect', style: String(state.fillStyle), lineWidth: state.lineWidth })
      return () => undefined
    },
    set(target, key: string, value) {
      target[key] = value
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops }
}

const EXPRESSIONS: SunExpression[] = ['happy', 'veryHappy', 'surprised', 'sad', 'admiring']

describe('rosto do sol no estilo do Sphere (emoji em LED)', () => {
  it('canvas com resolução para o close-up (pelo menos 1024×512, 2:1 equirretangular)', () => {
    expect(SUN_TEX_W).toBeGreaterThanOrEqual(1024)
    expect(SUN_TEX_W).toBe(SUN_TEX_H * 2)
  })

  it('corpo liso amarelo LED, sem manchas desenhadas; traços marrom quase preto', () => {
    expect(SUN_FEATURE.toLowerCase()).toBe('#1a1206')
    for (const e of EXPRESSIONS) {
      const { ctx, ops } = recorder()
      drawSunFace(ctx, e, false)
      expect(ops[0]).toMatchObject({ op: 'fillRect', style: SUN_BODY })
      expect(ops.filter((o) => o.style === SUN_BODY)).toHaveLength(1)
      const styles = new Set(ops.slice(1).map((o) => o.style.toLowerCase()))
      expect([...styles].sort()).toEqual(['#1a1206', '#ffffff'])
    }
  })

  it('olhos abertos: dois brancos; as pupilas ficam no shader (nada preto no canvas)', () => {
    for (const e of EXPRESSIONS) {
      const { ctx, ops } = recorder()
      drawSunFace(ctx, e, false)
      expect(ops.filter((o) => o.op === 'fill' && o.style === '#ffffff')).toHaveLength(2)
      expect(ops.some((o) => o.style === '#000000')).toBe(false)
    }
  })

  it('sobrancelhas grossas nas duas expressões de cada olho e uma boquinha', () => {
    for (const e of EXPRESSIONS) {
      const { ctx, ops } = recorder()
      drawSunFace(ctx, e, false)
      const thick = ops.filter((o) => o.op === 'stroke' && o.style === SUN_FEATURE && o.lineWidth >= 5)
      expect(thick.length).toBeGreaterThanOrEqual(2)
      const features = ops.filter((o) => o.style === SUN_FEATURE)
      expect(features.length).toBe(3) // 2 sobrancelhas + boca
    }
  })

  it('piscando: sem branco (o shader não acha onde pôr as pupilas), pálpebras e sobrancelhas no lugar', () => {
    for (const e of EXPRESSIONS) {
      const { ctx, ops } = recorder()
      drawSunFace(ctx, e, true)
      expect(ops.some((o) => o.style === '#ffffff')).toBe(false)
      expect(ops.filter((o) => o.style === SUN_FEATURE).length).toBe(5) // 2 pálpebras + 2 sobrancelhas + boca
    }
  })
})
