import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createPlanetMaterial, GLOW_PROGRAM_KEY, GLOW_UNIFORMS, patchGlowShader, planetHeat } from './planetGlow'

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
  })

  it('dois planetas: mesma chave de programa, e o onBeforeCompile do material injeta o pulso', () => {
    const a = createPlanetMaterial(new THREE.Texture(), new THREE.Texture())
    const b = createPlanetMaterial(new THREE.Texture(), new THREE.Texture())
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey())
    const shader = standardShader()
    // assinatura do three: (shader, renderer); o patch só usa o shader
    a.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer)
    expect(shader.uniforms.uGlowTime).toBe(GLOW_UNIFORMS.uGlowTime)
    expect(shader.fragmentShader).toContain('uniform float uGlowTime;')
    expect(shader.fragmentShader).toContain('float glowHash')
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance *= 1.0 + glowAmp')
  })

  it('calor do periélio: um uHeat por planeta, mesma chave de programa (o patch é o mesmo, só o valor muda)', () => {
    const a = createPlanetMaterial(new THREE.Texture(), new THREE.Texture())
    const b = createPlanetMaterial(new THREE.Texture(), new THREE.Texture())
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey())
    const sa = standardShader()
    const sb = standardShader()
    a.onBeforeCompile(sa as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer)
    b.onBeforeCompile(sb as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer)
    // o código do shader é idêntico (um programa só para todos os planetas)
    expect(sa.fragmentShader).toBe(sb.fragmentShader)
    expect(sa.fragmentShader).toContain('uniform float uHeat;')
    // cada material tem o seu uniform: aquecer um não aquece o outro
    expect(sa.uniforms.uHeat).toBe(planetHeat(a))
    expect(sb.uniforms.uHeat).toBe(planetHeat(b))
    planetHeat(a).value = 0.8
    expect(sa.uniforms.uHeat.value).toBe(0.8)
    expect(sb.uniforms.uHeat.value).toBe(0)
  })

  it('o calor tinge fora dos quadrados verdes, e o tremor do calor para com o pulso (movimento reduzido)', () => {
    const shader = standardShader()
    patchGlowShader(shader, { value: 0 })
    const src = shader.fragmentShader
    // máscara: onde há quadrado verde o tom quente some
    expect(src).toMatch(/heatMask\s*=\s*1\.0 - clamp\( glowLevel/)
    // o tremor é multiplicado por uGlowPulse (0 sob movimento reduzido); o tom fixo continua
    expect(src).toMatch(/heatShimmer\s*=\s*1\.0 \+ [\d.]+ \* uGlowPulse/)
    // soma depois do pulso dos verdes (o pulso não mexe no calor)
    expect(src.indexOf('totalEmissiveRadiance += ')).toBeGreaterThan(src.indexOf('totalEmissiveRadiance *= 1.0 + glowAmp'))
  })
})
