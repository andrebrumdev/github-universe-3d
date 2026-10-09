import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createPlanetMaterial, GLOW_PROGRAM_KEY, GLOW_UNIFORMS, patchGlowShader } from './planetGlow'

function standardShader() {
  return { uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms), fragmentShader: THREE.ShaderLib.standard.fragmentShader }
}

describe('pulso dos quadrados verdes no shader do planeta', () => {
  it('troca o trecho do emissiveMap e declara os uniforms', () => {
    const shader = standardShader()
    patchGlowShader(shader)
    expect(shader.fragmentShader).not.toContain('#include <emissivemap_fragment>')
    expect(shader.fragmentShader).toContain('uniform float uGlowTime;')
    expect(shader.fragmentShader).toContain('uniform float uGlowPulse;')
    expect(shader.fragmentShader).toContain('uGlowTime * glowSpeed')
  })

  it('os uniforms são o mesmo objeto em todos os planetas (um só relógio)', () => {
    const a = standardShader()
    const b = standardShader()
    patchGlowShader(a)
    patchGlowShader(b)
    expect(a.uniforms.uGlowTime).toBe(GLOW_UNIFORMS.uGlowTime)
    expect(b.uniforms.uGlowTime).toBe(GLOW_UNIFORMS.uGlowTime)
    expect(a.uniforms.uGlowPulse).toBe(GLOW_UNIFORMS.uGlowPulse)
  })

  it('falha alto se o three mudar o trecho, em vez de perder o brilho em silêncio', () => {
    expect(() => patchGlowShader({ uniforms: {}, fragmentShader: 'void main() {}' })).toThrow()
  })

  it('material com mapa de brilho, emissive verde e chave de cache própria', () => {
    const map = new THREE.Texture()
    const glow = new THREE.Texture()
    const m = createPlanetMaterial(map, glow)
    expect(m.map).toBe(map)
    expect(m.emissiveMap).toBe(glow)
    expect(m.emissive.g).toBeGreaterThan(m.emissive.r)
    expect(m.customProgramCacheKey()).toBe(GLOW_PROGRAM_KEY)
    expect(m.onBeforeCompile).toBe(patchGlowShader)
  })
})
