import { BlendFunction, BloomEffect, Effect } from 'postprocessing'

/**
 * Com o bloom (desktop) o sol fica fora do ACES e do bloom, como no `?nobloom` (lá ele é `toneMapped: false`):
 * o shader do sol escreve alfa 0 (ver `uSunMask` em `sunMaterial.ts`), e todo o resto da cena tem alfa 1 (fundo, opacos,
 * e os aditivos/transparentes, que só somam alfa). Quem estiver na frente do sol cobre a marca pelo depth test.
 * - O tone mapping aplica o mesmo ACES Filmic do ToneMapping do postprocessing (`ACESFilmicToneMapping` do three) onde
 *   alfa = 1 e deixa a cor original onde alfa = 0; a borda (MSAA) mistura os dois. Sai opaco.
 * - A luminância do bloom é multiplicada pelo alfa: o sol não floresce (o branco dos olhos borrava as pupilas) e o resto
 *   floresce exatamente como antes. O alfa do bloom sai 0, para o SCREEN do bloom não apagar a marca.
 */
export const SUN_MASK_TONE_MAPPING_GLSL = /* glsl */ `#include <tonemapping_pars_fragment>
void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
	float keep = 1.0 - clamp( inputColor.a, 0.0, 1.0 );
	vec3 mapped = ACESFilmicToneMapping( inputColor.rgb );
	outputColor = vec4( mix( mapped, inputColor.rgb, keep ), 1.0 );
}`

/** O ToneMapping(ACES_FILMIC) do GlowBloom, sem passar pelo sol. */
export class SunMaskToneMappingEffect extends Effect {
  constructor() {
    super('SunMaskToneMappingEffect', SUN_MASK_TONE_MAPPING_GLSL, { blendFunction: BlendFunction.SRC })
  }
}

const LUMINANCE_OUT = 'gl_FragColor=texel*mask;'
const LUMINANCE_MASKED = 'gl_FragColor=vec4(texel.rgb*mask*clamp(texel.a,0.0,1.0),0.0);'

/** Troca a saída do `LuminanceMaterial` (modo cor) do bloom: só floresce o que tem alfa 1. Idempotente. */
export function maskBloomLuminance(fragmentShader: string): string {
  if (fragmentShader.includes(LUMINANCE_MASKED)) return fragmentShader
  if (!fragmentShader.includes(LUMINANCE_OUT)) throw new Error('sunComposer: o LuminanceMaterial do postprocessing mudou')
  return fragmentShader.replace(LUMINANCE_OUT, LUMINANCE_MASKED)
}

/** Os mesmos parâmetros do `<Bloom>` de antes (mipmap blur; o r3f usa o blend ADD). */
export const GLOW_BLOOM = { luminanceThreshold: 0.8, luminanceSmoothing: 0.08, intensity: 0.6, radius: 0.6 }

/** Bloom do GlowBloom já com a luminância mascarada (o sol, alfa 0, não floresce). */
export function createGlowBloomEffect(): BloomEffect {
  const bloom = new BloomEffect({ blendFunction: BlendFunction.ADD, mipmapBlur: true, ...GLOW_BLOOM })
  const material = bloom.luminanceMaterial
  material.fragmentShader = maskBloomLuminance(material.fragmentShader)
  material.needsUpdate = true
  return bloom
}
