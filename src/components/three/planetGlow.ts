import * as THREE from 'three'
import { GLOW_CELL, GRID_COLS, POLAR_CAP_PX, ROW_H, TEX_H } from './grid'
import { attachHoverUniforms, createHoverUniforms, HOVER_GLSL_FRAGMENT, HOVER_GLSL_PARS, type PlanetHoverUniforms } from './planetHover'

/** Verde do brilho próprio: multiplica o GLOW_CELL refeito do alfa do mapa. */
export const GLOW_EMISSIVE = '#34d399'
/**
 * Intensidade: o dia mais movimentado fica perto do limiar do bloom (luminância ~1) e passa dele no pico do pulso;
 * os dias fracos ficam abaixo e só brilham, sem halo.
 */
export const GLOW_INTENSITY = 2.6

/**
 * Uniforms compartilhados por todos os planetas (o mesmo objeto em cada material):
 * `uGlowTime` anda no useFrame do PlanetGlowDriver; `uGlowPulse` = 0 congela o pulso (movimento reduzido).
 */
export const GLOW_UNIFORMS = {
  uGlowTime: { value: 0 },
  uGlowPulse: { value: 1 },
}

const f = (n: number) => n.toFixed(4)
const glowCell = new THREE.Color(GLOW_CELL)
/** Verde linear do GLOW_CELL a 100%: o alfa do mapa é o verde do brilho dividido por ele (ver `packGlowIntoAlpha`). */
const GLOW_LEVEL_MAX = glowCell.g
/** GLOW_CELL em sRGB dividido pelo verde dele: a cor de cada célula é esta vezes o verde sRGB (como no canvas). */
const GLOW_CELL_RATIO = glowCell.clone().convertLinearToSRGB()
const RATIO = `vec3( ${f(GLOW_CELL_RATIO.r / GLOW_CELL_RATIO.g)}, 1.0, ${f(GLOW_CELL_RATIO.b / GLOW_CELL_RATIO.g)} )`

const PARS = /* glsl */ `#include <emissivemap_pars_fragment>
uniform float uGlowTime;
uniform float uGlowPulse;
float planetGlowMask = 0.0;
${HOVER_GLSL_PARS}`

/**
 * Cor da superfície: só o rgb do mapa. O alfa dele é o brilho (ver `packGlowIntoAlpha`) e fica guardado para o
 * trecho do emissivo; o alfa do material não muda (o planeta é opaco e o sol, com o bloom, depende do alfa 1 de quem
 * não é ele).
 */
const MAP_FRAGMENT = /* glsl */ `#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	planetGlowMask = sampledDiffuseColor.a;
	diffuseColor.rgb *= sampledDiffuseColor.rgb;
#endif`

/**
 * Brilho de cada célula a partir do alfa do mapa: o verde em linear (o alfa × o verde do GLOW_CELL cheio) volta para
 * sRGB, a cor sRGB da célula é o GLOW_CELL na mesma proporção (como o canvas pintava) e volta para linear — a mesma
 * cor que o mapa de brilho separado dava, canal por canal.
 *
 * Pulso por célula: a fase sai de um hash da célula (semana, faixa de latitude) achada pela UV com a mesma grade
 * de `grid.ts`, então os quadrados não piscam juntos. Amplitude 0,12–0,25 (dia mais movimentado pulsa mais):
 * o brilho fica entre ~0,75× e ~1,25× da base. Fora das células o alfa é 0 e nada muda.
 *
 * Por cima, o dia sob o ponteiro (planetHover): o realce soma ao emissivo, depois do pulso.
 */
const FRAGMENT = /* glsl */ `#ifdef USE_MAP
	float glowLevel = clamp( planetGlowMask, 0.0, 1.0 );
	float glowSrgb = sRGBTransferOETF( vec4( vec3( glowLevel * ${f(GLOW_LEVEL_MAX)} ), 1.0 ) ).g;
	totalEmissiveRadiance *= sRGBTransferEOTF( vec4( ${RATIO} * glowSrgb, 1.0 ) ).rgb;
	vec2 glowCell = vec2(
		floor( fract( vMapUv.x ) * ${f(GRID_COLS)} ),
		floor( ( ( 1.0 - vMapUv.y ) * ${f(TEX_H)} - ${f(POLAR_CAP_PX)} ) / ${f(ROW_H)} )
	);
	float glowHash = fract( sin( dot( glowCell, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
	float glowAmp = ( 0.12 + 0.13 * glowLevel ) * uGlowPulse;
	float glowSpeed = 1.1 + 0.7 * fract( glowHash * 7.31 );
	totalEmissiveRadiance *= 1.0 + glowAmp * sin( uGlowTime * glowSpeed + glowHash * 6.2831853 );
${HOVER_GLSL_FRAGMENT}
#else
	totalEmissiveRadiance = vec3( 0.0 );
#endif`

export const GLOW_PROGRAM_KEY = 'planet-glow-v1'

type ShaderLike = { uniforms: Record<string, { value: unknown }>; fragmentShader: string }

const CHUNKS = ['#include <emissivemap_pars_fragment>', '#include <map_fragment>', '#include <emissivemap_fragment>']

/**
 * Troca a cor do mapa e o trecho do emissiveMap do MeshStandardMaterial pelo brilho do alfa, com o pulso por célula
 * (uniforms de todos) e o dia aceso sob o ponteiro (`hover`, uniforms deste planeta).
 */
export function patchGlowShader(shader: ShaderLike, hover: PlanetHoverUniforms = createHoverUniforms()): void {
  for (const chunk of CHUNKS) {
    if (!shader.fragmentShader.includes(chunk)) throw new Error(`planetGlow: o shader não tem ${chunk}`)
  }
  shader.uniforms.uGlowTime = GLOW_UNIFORMS.uGlowTime
  shader.uniforms.uGlowPulse = GLOW_UNIFORMS.uGlowPulse
  shader.uniforms.uHoverCell = hover.uHoverCell
  shader.uniforms.uHoverTime = hover.uHoverTime
  shader.uniforms.uHoverGlow = hover.uHoverGlow
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <emissivemap_pars_fragment>', PARS)
    .replace('#include <map_fragment>', MAP_FRAGMENT)
    .replace('#include <emissivemap_fragment>', FRAGMENT)
}

/**
 * Material do planeta: luz padrão (MeshStandardMaterial), mas só os quadrados verdes emitem, e pulsam; o dia sob o
 * ponteiro acende (uniforms deste material, ver `planetHoverUniforms`). Todos os planetas usam o mesmo programa.
 */
export function createPlanetMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map,
    emissive: GLOW_EMISSIVE,
    emissiveIntensity: GLOW_INTENSITY,
    roughness: 0.85,
    metalness: 0.05,
  })
  const hover = attachHoverUniforms(material)
  material.onBeforeCompile = (shader) => patchGlowShader(shader, hover)
  material.customProgramCacheKey = () => GLOW_PROGRAM_KEY
  return material
}
