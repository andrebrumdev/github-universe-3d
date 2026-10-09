import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { EYE, FACE_CENTER } from '@/lib/sun/face'
import { FACE_CALM_INNER, FACE_CALM_OUTER } from '@/lib/sun/surface'
import { SUN_RADIUS } from '@/lib/universe/orbits'
import { BLOOM_LOOK } from '@/store/bloom'
import { acesFilmic, hexToLinear, type Rgb } from './acesBackground'
import { SUN_NOISE_GLSL } from './sunGlsl'
import {
  createGlowMaterial,
  createHazeGeometry,
  createHazeMaterial,
  HAZE_EXTENT,
  createSunGeometry,
  createSunMaterial,
  patchSunShader,
  SUN_EMISSIVE_INTENSITY,
  SUN_GLOW_OPACITY,
  SUN_HAZE_OPACITY,
  SUN_PROGRAM_KEY,
  SUN_SEGMENTS,
  SUN_UNIFORMS,
  sunGlowOpacity,
  sunHazeOpacity,
  BLOOM_SAFE_INPUT,
  bloomCompensated,
  sunBloomCompensation,
  SUN_BLOOM_OUTPUT_CAP,
} from './sunMaterial'

function standardShader() {
  const lib = THREE.ShaderLib.standard
  return { uniforms: THREE.UniformsUtils.clone(lib.uniforms), vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader }
}

describe('sol de LED: shader injetado no MeshStandardMaterial', () => {
  it('vértice: troca a normal pela do balanço e desloca a posição', () => {
    const shader = standardShader()
    patchSunShader(shader)
    const vert = shader.vertexShader
    expect(vert).not.toContain('#include <beginnormal_vertex>')
    expect(vert).toContain('uniform float uSunTime;')
    expect(vert).toContain('float sunHeight( vec3 n )')
    expect(vert).toContain('vec3 objectNormal = normalize( cross( sunPA - sunP0, sunPB - sunP0 ) );')
    expect(vert).toContain('transformed = sunP0;')
    // a normal nova vem antes do defaultnormal (que a leva para o espaço da vista), a posição depois do begin_vertex
    expect(vert.indexOf('vec3 objectNormal')).toBeLessThan(vert.indexOf('#include <defaultnormal_vertex>'))
    expect(vert.indexOf('transformed = sunP0;')).toBeGreaterThan(vert.indexOf('#include <begin_vertex>'))
  })

  it('fragmento: manchas claras e borda só no corpo, pupilas recortadas pelo branco, antes da luz', () => {
    const shader = standardShader()
    patchSunShader(shader)
    const frag = shader.fragmentShader
    expect(frag).toContain('uniform vec3 uSunPupil;')
    expect(frag).toContain('float sunBlot = 0.0;')
    expect(frag).toContain('sunPupil = ( 1.0 - smoothstep( -sunAA, sunAA, sunD ) ) * sunWhite;')
    expect(frag).toContain('totalEmissiveRadiance = mix( totalEmissiveRadiance, emissive * sunFeature, sunPupil ) * sunLedF;')
    // sem granulação nem manchas escuras do sol "de plasma"
    expect(frag).not.toContain('sunCells')
    expect(frag.indexOf('totalEmissiveRadiance *= sampledDiffuseColor.rgb;')).toBeLessThan(frag.indexOf('float sunBlot'))
    expect(frag.indexOf('sunPupil ) * sunLedF;')).toBeGreaterThan(0)
    expect(frag.indexOf('sunPupil ) * sunLedF;')).toBeLessThan(frag.indexOf('#include <lights_physical_fragment>'))
  })

  it('as pupilas ficam nos olhos que o canvas desenha (mesmas medidas de face.ts)', () => {
    const shader = standardShader()
    patchSunShader(shader)
    const y = (FACE_CENTER[1] + EYE.y).toFixed(5)
    expect(shader.fragmentShader).toContain(`vec2( ${(FACE_CENTER[0] - EYE.dx).toFixed(5)}, ${y} ) + uSunPupil.xy`)
    expect(shader.fragmentShader).toContain(`vec2( ${(FACE_CENTER[0] + EYE.dx).toFixed(5)}, ${y} ) + uSunPupil.xy`)
  })

  it('os uniforms são os objetos compartilhados (um relógio, uma pupila)', () => {
    const shader = standardShader()
    patchSunShader(shader)
    expect(shader.uniforms.uSunTime).toBe(SUN_UNIFORMS.uSunTime)
    expect(shader.uniforms.uSunPupil).toBe(SUN_UNIFORMS.uSunPupil)
    expect(shader.uniforms.uSunBloom).toBe(SUN_UNIFORMS.uSunBloom)
    expect(shader.uniforms.uSunAberration).toBe(SUN_UNIFORMS.uSunAberration)
  })

  it('textura de LED: variação lenta de brilho e saturação só no corpo e micro-grade que some pela derivada', () => {
    const shader = standardShader()
    patchSunShader(shader)
    const frag = shader.fragmentShader
    expect(frag).toContain('float sunBright = 1.0 + 0.1 * sunFbm(')
    expect(frag).toContain('float sunSat = 1.0 + 0.1 * sunFbm(')
    expect(frag).toMatch(/sunBright = .*\* sunBody;/)
    expect(frag).toContain('float sunLedW = max( fwidth( sunLed.x ), fwidth( sunLed.y ) );')
    expect(frag).toContain('float sunLedVis = 1.0 - smoothstep(')
  })

  it('aberração cromática: vermelho e azul da textura deslocados na direção radial, força (1 − μ)^2 · uSunAberration', () => {
    const shader = standardShader()
    patchSunShader(shader)
    const frag = shader.fragmentShader
    expect(frag).not.toContain('#include <map_fragment>')
    expect(frag).toContain('float sunCaPx = uSunAberration * pow( 1.0 - sunMuCa, 2.00000 );')
    expect(frag).toContain('sampledDiffuseColor.r = texture2D( map, vMapUv + sunCaUv ).r;')
    expect(frag).toContain('sampledDiffuseColor.b = texture2D( map, vMapUv - sunCaUv ).b;')
    // as máscaras (corpo, branco dos olhos) usam a amostra sem deslocamento: as pupilas não borram
    expect(frag).toContain('float sunWhite = smoothstep( 0.55, 0.9, sunTexel.b );')
    // na costura do mapa, sem deslocamento
    expect(frag).toContain('float sunSeam = step( 0.25,')
  })

  it('com bloom: teto na saída, inverso do ACES e teto de segurança na entrada, nessa ordem; sem bloom, nada muda', () => {
    const shader = standardShader()
    patchSunShader(shader)
    const frag = shader.fragmentShader
    const at = (needle: string) => frag.indexOf(needle)
    expect(frag).toContain('vec3 sunAcesInverse( vec3 c )')
    expect(frag).toContain('if ( uSunBloom > 0.5 ) {')
    expect(at(`${SUN_BLOOM_OUTPUT_CAP.toFixed(5)} / max( dot( outgoingLight`)).toBeGreaterThan(at('if ( uSunBloom > 0.5 )'))
    expect(at('outgoingLight = sunAcesInverse( outgoingLight );')).toBeGreaterThan(at(`${SUN_BLOOM_OUTPUT_CAP.toFixed(5)} / max`))
    expect(at(`${BLOOM_SAFE_INPUT.toFixed(5)} / max( dot( outgoingLight`)).toBeGreaterThan(at('outgoingLight = sunAcesInverse'))
    expect(at('#include <opaque_fragment>')).toBeGreaterThan(at(`${BLOOM_SAFE_INPUT.toFixed(5)} / max`))
    expect(sunBloomCompensation(true)).toBe(1)
    expect(sunBloomCompensation(false)).toBe(0)
  })

  it('a compensação inteira (o mesmo que o shader): nada passa do limiar; corpo e pupila voltam iguais em R e G (±3%)', () => {
    const luma = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    expect(BLOOM_SAFE_INPUT).toBeLessThan(0.8)
    const srgb = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
    // as cores como saem no ?nobloom (medidas na GPU): corpo (243, 215, 0), pupila (25, 17, 6), branco (248, 250, 252)
    for (const hex of ['#F3D700', '#191106', '#F8FAFC']) {
      const target = hexToLinear(hex)
      const input = bloomCompensated(target)
      expect(luma(input)).toBeLessThanOrEqual(BLOOM_SAFE_INPUT + 1e-9)
      const out = acesFilmic(input)
      if (hex === '#F8FAFC') {
        // o branco precisaria de luminância ~4 na entrada: fica cinza-claro neutro, o máximo que não vaza
        const rgb = out.map(srgb)
        expect(Math.max(...rgb) - Math.min(...rgb)).toBeLessThanOrEqual(5) // na GPU: (217, 218, 219)
        expect(srgb(out[1])).toBeGreaterThan(210)
        continue
      }
      for (const k of [0, 1]) expect(Math.abs(srgb(out[k]) - srgb(target[k]))).toBeLessThanOrEqual(0.03 * 255)
    }
  })

  it('falha alto se o three mudar os trechos, em vez de perder a superfície em silêncio', () => {
    expect(() => patchSunShader({ uniforms: {}, vertexShader: 'void main() {}', fragmentShader: 'void main() {}' })).toThrow()
    const s = standardShader()
    expect(() => patchSunShader({ ...s, fragmentShader: s.fragmentShader.replace('#include <emissivemap_fragment>', '') })).toThrow()
  })

  it('o peso "longe do rosto" do GLSL usa os mesmos ângulos da função pura', () => {
    expect(SUN_NOISE_GLSL).toContain(`smoothstep( ${FACE_CALM_INNER.toFixed(5)}, ${FACE_CALM_OUTER.toFixed(5)}, acos( clamp( n.z`)
  })
})

describe('material e malha do sol', () => {
  it('painel de LED: textura como cor e emissivo branco, sem tone mapping, sem facetas', () => {
    const tex = new THREE.Texture()
    const m = createSunMaterial(tex)
    expect(m.map).toBe(tex)
    expect(m.emissiveMap).toBe(tex)
    expect(m.emissive.getHexString()).toBe('ffffff')
    expect(m.emissiveIntensity).toBe(SUN_EMISSIVE_INTENSITY)
    expect(m.toneMapped).toBe(false)
    expect(m.flatShading).toBe(false)
  })

  it('chave de programa própria e estável; o onBeforeCompile do material injeta a superfície', () => {
    const a = createSunMaterial(new THREE.Texture())
    const b = createSunMaterial(new THREE.Texture())
    expect(a.customProgramCacheKey()).toBe(SUN_PROGRAM_KEY)
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey())
    expect(a.customProgramCacheKey()).not.toBe(new THREE.MeshStandardMaterial().customProgramCacheKey())
    const shader = standardShader()
    a.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer)
    expect(shader.uniforms.uSunTime).toBe(SUN_UNIFORMS.uSunTime)
    expect(shader.vertexShader).toContain('transformed = sunP0;')
    expect(shader.fragmentShader).toContain('float sunBlot = 0.0;')
  })

  it('malha 96×64 com esfera envolvente um pouco maior que o balanço; o raycast ainda acerta a esfera', () => {
    const g = createSunGeometry()
    expect(g.parameters.widthSegments).toBe(SUN_SEGMENTS[0])
    expect(g.parameters.heightSegments).toBe(SUN_SEGMENTS[1])
    expect(g.boundingSphere!.radius).toBeGreaterThan(SUN_RADIUS * 1.01)
    expect(g.boundingSphere!.radius).toBeLessThan(SUN_RADIUS * 1.05)
    const mesh = new THREE.Mesh(g, createSunMaterial(new THREE.Texture()))
    mesh.updateMatrixWorld()
    const hits = new THREE.Raycaster(new THREE.Vector3(0.5, 0.3, 20), new THREE.Vector3(0, 0, -1)).intersectObject(mesh)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].point.z).toBeCloseTo(Math.sqrt(SUN_RADIUS ** 2 - 0.34), 1)
  })

  it('brilho em volta: casca aditiva, só o lado de trás, sem escrever profundidade, com a franja da aberração', () => {
    const m = createGlowMaterial()
    expect(m.blending).toBe(THREE.AdditiveBlending)
    expect(m.side).toBe(THREE.BackSide)
    expect(m.depthWrite).toBe(false)
    expect(m.transparent).toBe(true)
    expect(m.fragmentShader).toContain('#include <colorspace_fragment>')
    expect(m.uniforms.uSunFringe).toBe(SUN_UNIFORMS.uSunFringe)
    expect(m.fragmentShader).toContain('glowAt( rho * ( 1.0 - uSunFringe ) ), glowAt( rho ), glowAt( rho * ( 1.0 + uSunFringe ) )')
  })

  it('névoa: billboard aditivo de frente para a câmera, ruído de 3 oitavas no relógio do sol, franja nas quedas', () => {
    const m = createHazeMaterial()
    expect(m.blending).toBe(THREE.AdditiveBlending)
    expect(m.depthWrite).toBe(false)
    expect(m.uniforms.uSunTime).toBe(SUN_UNIFORMS.uSunTime) // parado sob movimento reduzido
    expect(m.uniforms.uSunFringe).toBe(SUN_UNIFORMS.uSunFringe)
    expect(m.vertexShader).toContain('c.xy += position.xy')
    expect(m.fragmentShader).toContain('sunFbm( vec3( vRho')
    expect(SUN_NOISE_GLSL).toContain('for ( int i = 0; i < 3; i ++ )')
    expect(m.fragmentShader).toContain('hazeAt( rho * ( 1.0 - uSunFringe ) ), hazeAt( rho ), hazeAt( rho * ( 1.0 + uSunFringe ) )')
    expect(createHazeGeometry().parameters.width).toBeCloseTo(2 * HAZE_EXTENT * SUN_RADIUS)
  })
})

describe('brilho e névoa seguem o visual com/sem bloom (chaves halo e haze)', () => {
  it('sem bloom: a opacidade base vezes o brilho do modo; com bloom: a mesma razão da chave halo', () => {
    expect(sunGlowOpacity(BLOOM_LOOK.plain, 1)).toBeCloseTo(SUN_GLOW_OPACITY)
    expect(sunGlowOpacity(BLOOM_LOOK.bloom, 1) / sunGlowOpacity(BLOOM_LOOK.plain, 1)).toBeCloseTo(BLOOM_LOOK.bloom.halo / BLOOM_LOOK.plain.halo)
    expect(sunGlowOpacity(BLOOM_LOOK.plain, 1.6)).toBeGreaterThan(sunGlowOpacity(BLOOM_LOOK.plain, 1))
    expect(sunGlowOpacity(BLOOM_LOOK.plain, 0.6)).toBeLessThan(sunGlowOpacity(BLOOM_LOOK.plain, 1))
    expect(sunGlowOpacity(BLOOM_LOOK.plain, 100)).toBe(1)
  })

  it('névoa: a base vezes a chave haze', () => {
    expect(sunHazeOpacity(BLOOM_LOOK.plain)).toBeCloseTo(SUN_HAZE_OPACITY)
    expect(sunHazeOpacity(BLOOM_LOOK.bloom)).toBeCloseTo(SUN_HAZE_OPACITY * BLOOM_LOOK.bloom.haze)
  })

  it('com bloom o sol não vaza (teto), e o ACES só escurece o aditivo: brilho e névoa sobem (medidos contra o ?nobloom)', () => {
    expect(BLOOM_LOOK.plain.halo).toBe(1)
    expect(BLOOM_LOOK.plain.haze).toBe(1)
    expect(BLOOM_LOOK.bloom.halo).toBe(1.6)
    expect(BLOOM_LOOK.bloom.haze).toBe(1.8)
  })
})
