import * as THREE from 'three'
import { GLOW_CELL, GRID_COLS, POLAR_CAP_PX, ROW_H, TEX_H } from './grid'
import { HEAT_BASE, HEAT_COLOR_HOT, HEAT_COLOR_WARM, HEAT_RIM, HEAT_RIM_POWER, HEAT_SHIMMER } from './planetHeat'

/** Verde do brilho próprio: multiplica o GLOW_CELL do mapa de brilho. */
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
/** Verde linear do GLOW_CELL a 100%: normaliza o brilho lido do mapa para 0–1 (dia vazio → 0, mais movimentado → 1). */
const GLOW_LEVEL_MAX = new THREE.Color(GLOW_CELL).g

/** Cor linear em GLSL (o `mix` do shader bate com o `heatTint` do JS). */
const vec3 = (hex: string) => {
  const c = new THREE.Color(hex)
  return `vec3( ${f(c.r)}, ${f(c.g)}, ${f(c.b)} )`
}

const PARS = /* glsl */ `#include <emissivemap_pars_fragment>
uniform float uGlowTime;
uniform float uGlowPulse;
uniform float uHeat;`

/**
 * Pulso por célula: a fase sai de um hash da célula (semana, faixa de latitude) achada pela UV com a mesma grade
 * de `grid.ts`, então os quadrados não piscam juntos. Amplitude 0,12–0,25 (dia mais movimentado pulsa mais):
 * o brilho fica entre ~0,75× e ~1,25× da base. Fora das células o mapa é preto e nada muda.
 */
const FRAGMENT = /* glsl */ `#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	totalEmissiveRadiance *= emissiveColor.rgb;
	vec2 glowCell = vec2(
		floor( fract( vEmissiveMapUv.x ) * ${f(GRID_COLS)} ),
		floor( ( ( 1.0 - vEmissiveMapUv.y ) * ${f(TEX_H)} - ${f(POLAR_CAP_PX)} ) / ${f(ROW_H)} )
	);
	float glowHash = fract( sin( dot( glowCell, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
	float glowLevel = clamp( emissiveColor.g / ${f(GLOW_LEVEL_MAX)}, 0.0, 1.0 );
	float glowAmp = ( 0.12 + 0.13 * glowLevel ) * uGlowPulse;
	float glowSpeed = 1.1 + 0.7 * fract( glowHash * 7.31 );
	totalEmissiveRadiance *= 1.0 + glowAmp * sin( uGlowTime * glowSpeed + glowHash * 6.2831853 );
	// Calor do periélio: tom quente no fundo, na grade e nos dias vazios, nunca sobre os quadrados verdes (a máscara
	// zera onde há verde: o dia mais fraco já tem glowLevel 0,3). Mais forte na borda do disco (fresnel).
	float heatMask = 1.0 - clamp( glowLevel * 4.0, 0.0, 1.0 );
	float heatRim = pow( 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 ), ${f(HEAT_RIM_POWER)} );
	float heatNoise = sin( uGlowTime * 0.83 + vEmissiveMapUv.x * 37.7 + 1.7 * sin( uGlowTime * 0.51 + vEmissiveMapUv.y * 21.0 ) );
	float heatShimmer = 1.0 + ${f(HEAT_SHIMMER)} * uGlowPulse * heatNoise;
	vec3 heatColor = mix( ${vec3(HEAT_COLOR_WARM)}, ${vec3(HEAT_COLOR_HOT)}, uHeat );
	totalEmissiveRadiance += heatColor * ( uHeat * ( ${f(HEAT_BASE)} + ${f(HEAT_RIM)} * heatRim ) * heatShimmer * heatMask );
#endif`

export const GLOW_PROGRAM_KEY = 'planet-glow-v1'

type ShaderLike = { uniforms: Record<string, { value: unknown }>; fragmentShader: string }

/**
 * Troca o trecho do emissiveMap do MeshStandardMaterial pelo pulso por célula e o calor, e liga os uniforms: o relógio
 * do pulso é compartilhado; `heat` é o do planeta (o código do shader é o mesmo para todos: um programa só).
 */
export function patchGlowShader(shader: ShaderLike, heat: { value: number } = { value: 0 }): void {
  if (!shader.fragmentShader.includes('#include <emissivemap_fragment>')) {
    throw new Error('planetGlow: o shader não tem #include <emissivemap_fragment>')
  }
  shader.uniforms.uGlowTime = GLOW_UNIFORMS.uGlowTime
  shader.uniforms.uGlowPulse = GLOW_UNIFORMS.uGlowPulse
  shader.uniforms.uHeat = heat
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <emissivemap_pars_fragment>', PARS)
    .replace('#include <emissivemap_fragment>', FRAGMENT)
}

/** Calor do planeta (0–1) que o shader lê: um uniform por material, escrito no useFrame do Planet. */
export function planetHeat(material: THREE.Material): { value: number } {
  return material.userData.heat as { value: number }
}

/**
 * Material do planeta: luz padrão (MeshStandardMaterial), mas só os quadrados verdes emitem, e pulsam; perto do
 * periélio o resto da superfície ganha o tom quente (`uHeat`, do próprio material).
 */
export function createPlanetMaterial(map: THREE.Texture, glowMap: THREE.Texture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map,
    emissiveMap: glowMap,
    emissive: GLOW_EMISSIVE,
    emissiveIntensity: GLOW_INTENSITY,
    roughness: 0.85,
    metalness: 0.05,
  })
  const heat = { value: 0 }
  material.userData.heat = heat
  // A chave é fixa: o three compila uma vez e reaproveita o programa; o onBeforeCompile roda por material e liga o uHeat
  // dele (os uniforms são do material, não do programa).
  material.onBeforeCompile = (shader) => patchGlowShader(shader, heat)
  material.customProgramCacheKey = () => GLOW_PROGRAM_KEY
  return material
}
