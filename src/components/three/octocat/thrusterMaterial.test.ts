import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { COLORS } from '@/lib/ship/geometry'
import { BLOOM_LOOK } from '@/store/bloom'
import {
  createThrusterMaterial,
  createThrusterParams,
  THRUSTER_COLORS,
  thrusterHaloOpacity,
  thrusterParams,
  updateThrusterMaterial,
} from './thrusterMaterial'

const LEVELS = [0, 0.05, 0.1, 0.25, 0.4, 0.6, 0.8, 1, 1.2]

describe('material da chama do propulsor', () => {
  it('é um ShaderMaterial aditivo, transparente, sem escrever profundidade', () => {
    const material = createThrusterMaterial()
    expect(material).toBeInstanceOf(THREE.ShaderMaterial)
    expect(material.blending).toBe(THREE.AdditiveBlending)
    expect(material.transparent).toBe(true)
    expect(material.depthWrite).toBe(false)
    material.dispose()
  })

  it('declara os uniforms esperados, com as cores do propulsor', () => {
    const material = createThrusterMaterial()
    for (const name of ['uTime', 'uLevel', 'uFlicker', 'uIntensity', 'uTurbulence', 'uDiamonds', 'uCore', 'uMid', 'uEdge']) {
      expect(material.uniforms[name], name).toBeDefined()
      expect(material.fragmentShader + material.vertexShader).toContain(name)
    }
    expect((material.uniforms.uMid.value as THREE.Color).getHexString()).toBe(new THREE.Color(COLORS.thruster).getHexString())
    expect((material.uniforms.uEdge.value as THREE.Color).getHexString()).toBe(new THREE.Color(THRUSTER_COLORS.edge).getHexString())
    material.dispose()
  })

  it('cada nave tem os seus uniforms (o nível de uma não mexe na outra)', () => {
    const a = createThrusterMaterial()
    const b = createThrusterMaterial()
    expect(a.uniforms.uLevel).not.toBe(b.uniforms.uLevel)
    a.dispose()
    b.dispose()
  })

  it('updateThrusterMaterial copia os parâmetros e anda o relógio da chama na velocidade do nível', () => {
    const material = createThrusterMaterial()
    updateThrusterMaterial(material, thrusterParams(1, 1.1), 0.5)
    const p = thrusterParams(1, 1.1)
    expect(material.uniforms.uLevel.value).toBe(1)
    expect(material.uniforms.uFlicker.value).toBeCloseTo(p.flicker)
    expect(material.uniforms.uIntensity.value).toBeCloseTo(p.intensity)
    expect(material.uniforms.uTime.value).toBeCloseTo(0.5 * p.speed)
    // delta 0 (movimento reduzido): o relógio não anda
    updateThrusterMaterial(material, p, 0)
    expect(material.uniforms.uTime.value).toBeCloseTo(0.5 * p.speed)
    material.dispose()
  })
})

describe('thrusterParams', () => {
  it('nível 0 (ou negativo) apaga a chama', () => {
    for (const level of [0, -0.3]) {
      const p = thrusterParams(level, 0)
      expect(p.visible).toBe(false)
      expect(p.intensity).toBe(0)
      expect(p.length).toBe(0)
      expect(p.diamonds).toBe(0)
    }
  })

  it('cresce com o nível: brilho, velocidade e turbulência nunca diminuem', () => {
    const ps = LEVELS.map((level) => thrusterParams(level, level))
    for (let i = 1; i < ps.length; i++) {
      expect(ps[i].intensity).toBeGreaterThanOrEqual(ps[i - 1].intensity)
      expect(ps[i].length).toBeGreaterThanOrEqual(ps[i - 1].length)
      expect(ps[i].speed).toBeGreaterThanOrEqual(ps[i - 1].speed)
      expect(ps[i].turbulence).toBeGreaterThanOrEqual(ps[i - 1].turbulence)
      expect(ps[i].diamonds).toBeGreaterThanOrEqual(ps[i - 1].diamonds)
    }
    expect(ps.at(-1)!.intensity).toBeGreaterThan(ps[1].intensity)
  })

  it('discos de choque só na viagem (nível alto), não na escolta nem entrando devagar', () => {
    expect(thrusterParams(0.25, 0.25).diamonds).toBe(0)
    expect(thrusterParams(0.6, 0.6).diamonds).toBe(0)
    expect(thrusterParams(1, 1).diamonds).toBeGreaterThan(0.9)
  })

  it('a chama da escolta (0,25) ainda passa do lábio do bocal; a da viagem é um rastro longo (3×)', () => {
    expect(thrusterParams(0.25, 0.25).length).toBeGreaterThan(0.5)
    expect(thrusterParams(0.25, 0.25).length).toBeLessThan(0.6)
    expect(thrusterParams(0.8, 0.8).length).toBeCloseTo(2.046)
    expect(thrusterParams(1, 1).length).toBeCloseTo(3)
    // a tremulação mexe o comprimento, mas menos que o thrusterScale (±23%)
    expect(thrusterParams(1, 1.2).length).toBeCloseTo(3.3)
  })

  it('flicker vira razão em torno de 1 (thrusterScale / nível), limitada', () => {
    expect(thrusterParams(0.5, 0.5).flicker).toBeCloseTo(1)
    expect(thrusterParams(0.5, 0.6).flicker).toBeCloseTo(1.2)
    expect(thrusterParams(1, 5).flicker).toBeLessThanOrEqual(1.5)
    expect(thrusterParams(1, -1).flicker).toBeGreaterThanOrEqual(0.5)
  })

  it('valores finitos em toda a faixa (sem NaN chegando ao shader)', () => {
    for (const level of [...LEVELS, 3, Number.NaN]) {
      const p = thrusterParams(level, level)
      for (const v of [p.length, p.intensity, p.speed, p.turbulence, p.diamonds, p.flicker]) expect(Number.isFinite(v)).toBe(true)
    }
  })
})

describe('thrusterParams sem alocar', () => {
  it('escreve no alvo passado e devolve o mesmo objeto', () => {
    const out = createThrusterParams()
    expect(thrusterParams(1, 1, out)).toBe(out)
    expect(out.visible).toBe(true)
    expect(out).toEqual(thrusterParams(1, 1))
    thrusterParams(0, 0, out)
    expect(out.visible).toBe(false)
    expect(out.intensity).toBe(0)
  })
})

describe('halo do bocal com o visual do bloom', () => {
  it('com bloom o halo fica mais fraco (aditivo no buffer HDR); sem bloom, como antes (0,8 × tremulação)', () => {
    expect(BLOOM_LOOK.plain.thrusterHalo).toBe(1)
    expect(BLOOM_LOOK.bloom.thrusterHalo).toBeLessThan(BLOOM_LOOK.plain.thrusterHalo)
    expect(thrusterHaloOpacity(1, false)).toBeCloseTo(0.8)
    expect(thrusterHaloOpacity(1, true)).toBeCloseTo(0.8 * BLOOM_LOOK.bloom.thrusterHalo)
    expect(thrusterHaloOpacity(0, true)).toBe(0)
  })
})
