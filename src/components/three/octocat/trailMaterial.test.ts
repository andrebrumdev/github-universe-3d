import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { COLORS } from '@/lib/ship/geometry'
import { BLOOM_LOOK } from '@/store/bloom'
import { FIRE_NOISE_GLSL } from './fireGlsl'
import { createThrusterMaterial, THRUSTER_COLORS } from './thrusterMaterial'
import {
  createTrailMaterial,
  createTrailParams,
  easeSlingshot,
  TRAIL_COLORS,
  TRAIL_HALF_WIDTH,
  TRAIL_SPEED,
  trailHalfWidth,
  trailParams,
  updateTrailMaterial,
} from './trailMaterial'

const SPEEDS = [0, 1, TRAIL_SPEED.min, 5, 10, 20, 30, TRAIL_SPEED.max, 60, 200]

describe('material do rastro', () => {
  it('é um ShaderMaterial aditivo, transparente, sem escrever profundidade e em highp', () => {
    const material = createTrailMaterial()
    expect(material).toBeInstanceOf(THREE.ShaderMaterial)
    expect(material.blending).toBe(THREE.AdditiveBlending)
    expect(material.transparent).toBe(true)
    expect(material.depthWrite).toBe(false)
    expect(material.fragmentShader).toContain('precision highp float')
    material.dispose()
  })

  it('declara os uniforms esperados, com a paleta da chama do propulsor', () => {
    const material = createTrailMaterial()
    for (const name of ['uTime', 'uHeat', 'uIntensity', 'uTurbulence', 'uBoost', 'uOpacity', 'uCore', 'uMid', 'uLilac', 'uEdge']) {
      expect(material.uniforms[name], name).toBeDefined()
      expect(material.fragmentShader + material.vertexShader).toContain(name)
    }
    const hex = (name: string) => (material.uniforms[name].value as THREE.Color).getHexString()
    expect(hex('uCore')).toBe(new THREE.Color(THRUSTER_COLORS.core).getHexString())
    expect(hex('uMid')).toBe(new THREE.Color(COLORS.thruster).getHexString())
    expect(hex('uLilac')).toBe(new THREE.Color(COLORS.ship).getHexString())
    expect(hex('uEdge')).toBe(new THREE.Color(THRUSTER_COLORS.edge).getHexString())
    expect(TRAIL_COLORS.lilac).toBe(COLORS.ship)
    material.dispose()
  })

  it('usa o mesmo ruído da chama (o trecho GLSL compartilhado)', () => {
    const trail = createTrailMaterial()
    const thruster = createThrusterMaterial()
    expect(trail.fragmentShader).toContain(FIRE_NOISE_GLSL)
    expect(thruster.fragmentShader).toContain(FIRE_NOISE_GLSL)
    trail.dispose()
    thruster.dispose()
  })

  it('updateTrailMaterial copia os parâmetros, o estilingue e o fator do bloom; o relógio anda na velocidade do fogo', () => {
    const material = createTrailMaterial()
    const p = trailParams(30)
    updateTrailMaterial(material, p, 0.5, BLOOM_LOOK.bloom.trail, 0.25)
    const u = material.uniforms
    expect(u.uHeat.value).toBeCloseTo(p.heat)
    expect(u.uIntensity.value).toBeCloseTo(p.intensity)
    expect(u.uTurbulence.value).toBeCloseTo(p.turbulence)
    expect(u.uBoost.value).toBe(0.5)
    expect(u.uOpacity.value).toBe(BLOOM_LOOK.bloom.trail)
    expect(u.uTime.value).toBeCloseTo(0.25 * p.flow)
    // delta 0 (movimento reduzido): o relógio para
    updateTrailMaterial(material, p, 0, 1, 0)
    expect(u.uTime.value).toBeCloseTo(0.25 * p.flow)
    material.dispose()
  })

  it('cada rastro tem os seus uniforms', () => {
    const a = createTrailMaterial()
    const b = createTrailMaterial()
    expect(a.uniforms.uHeat).not.toBe(b.uniforms.uHeat)
    a.dispose()
    b.dispose()
  })
})

describe('trailParams', () => {
  it('parado ou devagar: frio, mas aceso; rápido: calor 1', () => {
    expect(trailParams(0).heat).toBe(0)
    expect(trailParams(TRAIL_SPEED.min).heat).toBe(0)
    expect(trailParams(0).intensity).toBeGreaterThan(0)
    expect(trailParams(TRAIL_SPEED.max).heat).toBe(1)
    expect(trailParams(500).heat).toBe(1)
    // a viagem típica (mediana ~15–25 u/s) já é quente
    expect(trailParams(15).heat).toBeGreaterThan(0.5)
  })

  it('turbulência, brilho, fluxo e largura crescem com a velocidade (nunca diminuem)', () => {
    const ps = SPEEDS.map((s) => trailParams(s))
    for (let i = 1; i < ps.length; i++) {
      for (const k of ['heat', 'intensity', 'turbulence', 'flow', 'halfWidth'] as const) {
        expect(ps[i][k], `${k} @ ${SPEEDS[i]}`).toBeGreaterThanOrEqual(ps[i - 1][k])
      }
    }
    expect(ps.at(-1)!.intensity).toBeGreaterThan(ps[0].intensity)
    expect(ps.at(-1)!.turbulence).toBeGreaterThan(ps[0].turbulence)
  })

  it('a largura afina com a idade: cheia no bocal (~ o diâmetro da chama), fina na cauda', () => {
    const head = trailParams(30, 0).halfWidth
    const mid = trailParams(30, 0.5).halfWidth
    const tail = trailParams(30, 1).halfWidth
    expect(head).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(tail)
    expect(tail).toBeGreaterThan(0)
    expect(tail / head).toBeLessThan(0.4)
    expect(head).toBeGreaterThan(TRAIL_HALF_WIDTH * 0.7)
    expect(head).toBeLessThan(TRAIL_HALF_WIDTH * 1.3)
    expect(trailParams(30, 0.5).halfWidth).toBeCloseTo(trailHalfWidth(0.5, trailParams(30).heat))
  })

  it('idade fora de 0–1 é limitada', () => {
    expect(trailParams(10, -1).halfWidth).toBe(trailParams(10, 0).halfWidth)
    expect(trailParams(10, 3).halfWidth).toBe(trailParams(10, 1).halfWidth)
  })

  it('valores finitos em toda a faixa (sem NaN chegando ao shader)', () => {
    for (const s of [...SPEEDS, -5, Number.NaN, Infinity]) {
      for (const age of [0, 0.5, 1, Number.NaN]) {
        const p = trailParams(s, age)
        for (const v of [p.heat, p.intensity, p.turbulence, p.flow, p.halfWidth]) expect(Number.isFinite(v)).toBe(true)
      }
    }
  })

  it('escreve no alvo passado e devolve o mesmo objeto (sem alocar no quadro)', () => {
    const out = createTrailParams()
    expect(trailParams(20, 0, out)).toBe(out)
    expect(out).toEqual(trailParams(20))
  })
})

describe('estilingue', () => {
  it('esquenta rápido ao entrar no sobrevoo e esfria mais devagar depois', () => {
    let b = 0
    for (let i = 0; i < 10; i++) b = easeSlingshot(b, true, 1 / 60)
    const up = b
    expect(up).toBeGreaterThan(0.5)
    for (let i = 0; i < 10; i++) b = easeSlingshot(b, false, 1 / 60)
    expect(b).toBeLessThan(up)
    // a soltura é mais lenta que a subida: depois do mesmo tempo, ainda sobra mais da metade
    expect(b).toBeGreaterThan(up * 0.5)
    expect(easeSlingshot(0.3, true, 0)).toBe(0.3)
    expect(easeSlingshot(0, true, 10)).toBeCloseTo(1)
    expect(easeSlingshot(1, false, 10)).toBeCloseTo(0)
  })
})
