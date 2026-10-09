import * as THREE from 'three'
import { GLOW_CELL, GRID_COLS, POLAR_CAP_PX, ROW_H, TEX_H } from './grid'

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

const PARS = /* glsl */ `#include <emissivemap_pars_fragment>
uniform float uGlowTime;
uniform float uGlowPulse;`

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
#endif`

export const GLOW_PROGRAM_KEY = 'planet-glow-v1'

type ShaderLike = { uniforms: Record<string, { value: unknown }>; fragmentShader: string }

/** Troca o trecho do emissiveMap do MeshStandardMaterial pelo pulso por célula e liga os uniforms compartilhados. */
export function patchGlowShader(shader: ShaderLike): void {
  if (!shader.fragmentShader.includes('#include <emissivemap_fragment>')) {
    throw new Error('planetGlow: o shader não tem #include <emissivemap_fragment>')
  }
  shader.uniforms.uGlowTime = GLOW_UNIFORMS.uGlowTime
  shader.uniforms.uGlowPulse = GLOW_UNIFORMS.uGlowPulse
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <emissivemap_pars_fragment>', PARS)
    .replace('#include <emissivemap_fragment>', FRAGMENT)
}

/** Material do planeta: luz padrão (MeshStandardMaterial), mas só os quadrados verdes emitem, e pulsam. */
export function createPlanetMaterial(map: THREE.Texture, glowMap: THREE.Texture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map,
    emissiveMap: glowMap,
    emissive: GLOW_EMISSIVE,
    emissiveIntensity: GLOW_INTENSITY,
    roughness: 0.85,
    metalness: 0.05,
  })
  material.onBeforeCompile = patchGlowShader
  material.customProgramCacheKey = () => GLOW_PROGRAM_KEY
  return material
}
