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
    expect(shader.fragmentShader).not.toContain('#include <map_fragment>')
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

  it('o brilho sai do alfa do mapa de cor: a cor da superfície leva só o rgb, e o alfa do material fica intacto', () => {
    const shader = standardShader()
    patchGlowShader(shader)
    const frag = shader.fragmentShader
    expect(frag).toContain('planetGlowMask = sampledDiffuseColor.a;')
    expect(frag).toContain('diffuseColor.rgb *= sampledDiffuseColor.rgb;')
    expect(frag).not.toMatch(/diffuseColor \*= sampledDiffuseColor/)
    expect(frag).not.toContain('emissiveMap')
    // a cor do brilho volta à curva do GLOW_CELL pintado no canvas (sRGB por canal), não só um verde proporcional
    expect(frag).toContain('sRGBTransferOETF')
    expect(frag).toContain('sRGBTransferEOTF')
  })

  it('material com um mapa só (cor + brilho no alfa), emissive verde e chave de cache própria', () => {
    const map = new THREE.Texture()
    const m = createPlanetMaterial(map)
    expect(m.map).toBe(map)
    expect(m.emissiveMap).toBeNull()
    expect(m.emissive.g).toBeGreaterThan(m.emissive.r)
    expect(m.customProgramCacheKey()).toBe(GLOW_PROGRAM_KEY)
    expect(m.onBeforeCompile).toBe(patchGlowShader)
  })

  it('dois planetas: mesma chave de programa, e o onBeforeCompile do material injeta o pulso', () => {
    const a = createPlanetMaterial(new THREE.Texture())
    const b = createPlanetMaterial(new THREE.Texture())
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey())
    const shader = standardShader()
    // assinatura do three: (shader, renderer); o patch só usa o shader
    a.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer)
    expect(shader.uniforms.uGlowTime).toBe(GLOW_UNIFORMS.uGlowTime)
    expect(shader.fragmentShader).toContain('uniform float uGlowTime;')
    expect(shader.fragmentShader).toContain('float glowHash')
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance *= 1.0 + glowAmp')
  })
})
