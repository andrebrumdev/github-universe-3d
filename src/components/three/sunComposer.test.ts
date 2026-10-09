import { describe, expect, it } from 'vitest'
import { BlendFunction, LuminanceMaterial } from 'postprocessing'
import { createGlowBloomEffect, GLOW_BLOOM, maskBloomLuminance, SUN_MASK_TONE_MAPPING_GLSL, SunMaskToneMappingEffect } from './sunComposer'

describe('composer com o sol fora do ACES e do bloom (o sol marca alfa 0)', () => {
  it('tone mapping: ACES do three onde alfa = 1, cor original onde alfa = 0, e sai opaco', () => {
    expect(SUN_MASK_TONE_MAPPING_GLSL).toContain('#include <tonemapping_pars_fragment>')
    expect(SUN_MASK_TONE_MAPPING_GLSL).toContain('ACESFilmicToneMapping( inputColor.rgb )')
    expect(SUN_MASK_TONE_MAPPING_GLSL).toContain('float keep = 1.0 - clamp( inputColor.a, 0.0, 1.0 );')
    expect(SUN_MASK_TONE_MAPPING_GLSL).toContain('outputColor = vec4( mix( mapped, inputColor.rgb, keep ), 1.0 );')
  })

  it('o efeito substitui a cor (SRC): nada do alfa marcado vaza para a tela', () => {
    const effect = new SunMaskToneMappingEffect()
    expect(effect.blendMode.blendFunction).toBe(BlendFunction.SRC)
    expect(effect.getFragmentShader()).toBe(SUN_MASK_TONE_MAPPING_GLSL)
    effect.dispose()
  })

  it('luminância do bloom (a do postprocessing instalado): multiplica pelo alfa e devolve alfa 0', () => {
    const material = new LuminanceMaterial(true)
    const patched = maskBloomLuminance(material.fragmentShader)
    expect(patched).not.toContain('gl_FragColor=texel*mask;')
    expect(patched).toContain('gl_FragColor=vec4(texel.rgb*mask*clamp(texel.a,0.0,1.0),0.0);')
    material.dispose()
  })

  it('o bloom do GlowBloom nasce com a luminância mascarada e os mesmos parâmetros de antes (ADD, limiar 0,8)', () => {
    const bloom = createGlowBloomEffect()
    expect(bloom.luminanceMaterial.fragmentShader).toContain('gl_FragColor=vec4(texel.rgb*mask*clamp(texel.a,0.0,1.0),0.0);')
    expect(bloom.blendMode.blendFunction).toBe(BlendFunction.ADD)
    expect(bloom.luminanceMaterial.threshold).toBeCloseTo(GLOW_BLOOM.luminanceThreshold)
    expect(bloom.luminanceMaterial.smoothing).toBeCloseTo(GLOW_BLOOM.luminanceSmoothing)
    expect(bloom.intensity).toBeCloseTo(GLOW_BLOOM.intensity)
    expect(GLOW_BLOOM).toEqual({ luminanceThreshold: 0.8, luminanceSmoothing: 0.08, intensity: 0.6, radius: 0.6 })
    bloom.dispose()
  })

  it('aplicar duas vezes não muda nada; um shader de outra versão falha alto em vez de deixar o sol florescer', () => {
    const once = maskBloomLuminance(new LuminanceMaterial(true).fragmentShader)
    expect(maskBloomLuminance(once)).toBe(once)
    expect(() => maskBloomLuminance('void main(){ gl_FragColor = vec4(1.0); }')).toThrow()
  })
})
