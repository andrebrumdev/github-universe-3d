import { describe, expect, it } from 'vitest'
import { planetPixels, TEX_H, TEX_W } from '@/components/three/grid'
import { MOON_TEX_H, MOON_TEX_W, moonPixels } from '@/components/three/moonPaint'
import { SUN_FACE_REGION } from '@/components/three/sunFace'
import { SUN_FACE_VARIANTS } from '@/components/three/sunFacePixels'
import { emptyWeeks } from '@/lib/universe/activity'
import { fakeCanvas } from './fakeCanvas'
import { handleRequest, runJob } from './jobs'

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i])
const weeks = emptyWeeks().map((w, i) => w.map((_, d) => (i * 3 + d) % 5))

describe('tarefas de textura (as mesmas funções no worker e na thread principal)', () => {
  it('planeta: grade de cor + brilho no alfa, RGBA de baixo para cima, buffer transferido', () => {
    const { output, transfer } = runJob({ kind: 'planet', weeks }, fakeCanvas().make)
    const pixels = output as Uint8Array
    expect(pixels).toHaveLength(TEX_W * TEX_H * 4)
    expect(sameBytes(pixels, planetPixels(weeks, fakeCanvas().make))).toBe(true)
    expect(transfer).toEqual([pixels.buffer])
  })

  it('lua: o desenho de sempre (sigla quando não há ícone), buffer transferido', () => {
    const { output, transfer } = runJob({ kind: 'moon', language: 'Makefile', color: '#427819' }, fakeCanvas().make)
    const pixels = output as Uint8Array
    expect(pixels).toHaveLength(MOON_TEX_W * MOON_TEX_H * 4)
    expect(sameBytes(pixels, moonPixels('Makefile', '#427819', fakeCanvas().make))).toBe(true)
    expect(transfer).toEqual([pixels.buffer])
  })

  it('sol: todos os rostos de uma vez, só o pedaço do rosto de cada um, todos transferidos', () => {
    const { output, transfer } = runJob({ kind: 'sunFaces' }, fakeCanvas().make)
    const regions = output as Record<string, Uint8Array>
    expect(Object.keys(regions).sort()).toEqual(SUN_FACE_VARIANTS.map((v) => v.key).sort())
    for (const r of Object.values(regions)) expect(r).toHaveLength(SUN_FACE_REGION.w * SUN_FACE_REGION.h * 4)
    expect(new Set(transfer).size).toBe(SUN_FACE_VARIANTS.length)
    expect(transfer).toEqual(Object.values(regions).map((r) => r.buffer))
  })

  it('a saída atravessa o postMessage por transferência (sem cópia: o buffer do worker fica vazio)', () => {
    const { output, transfer } = runJob({ kind: 'planet', weeks }, fakeCanvas().make)
    const received = structuredClone(output, { transfer }) as Uint8Array
    expect(received).toHaveLength(TEX_W * TEX_H * 4)
    expect((output as Uint8Array).byteLength).toBe(0)
  })

  it('sem canvas 2D no worker: a tarefa responde ok: false (a thread principal refaz)', () => {
    const noCanvas = () => {
      throw new Error('canvas 2D indisponível')
    }
    const { response } = handleRequest({ id: 4, job: { kind: 'moon', language: 'Go', color: '#00ADD8' } }, noCanvas)
    expect(response).toEqual({ id: 4, ok: false, error: 'canvas 2D indisponível' })
  })
})
