import * as THREE from 'three'
import { ABERRATION_FALLOFF } from '@/lib/sun/aberration'
import { EYE, FACE_CENTER, FACE_H, FACE_W } from '@/lib/sun/face'
import { SURFACE_AMPLITUDE } from '@/lib/sun/surface'
import { SUN_RADIUS } from '@/lib/universe/orbits'
import type { BloomLook } from '@/store/bloom'
import { SUN_FEATURE } from './sunFace'
import type { Rgb } from './acesBackground'
import { ACES_INVERSE_GLSL, acesFilmicInverse } from './sunAces'
import { SUN_NOISE_GLSL } from './sunGlsl'

const f = (n: number) => n.toFixed(5)
/** Cor em linear (o espaço do shader), como literal GLSL. */
const linear = (hex: string) => {
  const c = new THREE.Color(hex)
  return `vec3( ${f(c.r)}, ${f(c.g)}, ${f(c.b)} )`
}

/**
 * Uniforms do sol (um sol só), objetos estáveis: nada é alocado por quadro.
 * - `uSunTime`: anda no useFrame do Sun (parado sob movimento reduzido); move o balanço, as manchas, a textura e a névoa.
 * - `uSunPupil`: (x, y, raio) da pupila em unidades de desenho, relativa ao centro de cada olho (ver `pupilLook`).
 * - `uSunBloom`: 1 com o bloom ligado — a cor final é pré-compensada pelo inverso do ACES do ToneMapping
 *   (ver `sunBloomCompensation`).
 * - `uSunAberration`: deslocamento RGB no limbo, em px (ver `aberrationLimbPx`); `uSunFringe`: o mesmo em raios do sol,
 *   para o brilho e a névoa (ver `fringeRho`).
 */
export const SUN_UNIFORMS = {
  uSunTime: { value: 0 },
  uSunPupil: { value: new THREE.Vector3(0, 0, 9) },
  uSunBloom: { value: 0 },
  uSunAberration: { value: 0 },
  uSunFringe: { value: 0 },
}

/**
 * Com bloom, o sol passa pelo ACES do ToneMapping (sem bloom ele é `toneMapped: false`). Para sair igual ao `?nobloom`,
 * a cor final entra pré-compensada pelo inverso do ACES (`sunAces.ts`), com dois tetos para nada do sol passar do
 * limiar do GlowBloom (0,8) — se o branco dos olhos vazar, o bloom borra as pupilas (medido: ficam cinza):
 * - na SAÍDA, antes do inverso, luminância até `SUN_BLOOM_OUTPUT_CAP` (mantém o tom: o branco fica cinza-claro neutro);
 * - na ENTRADA, depois do inverso, até `BLOOM_SAFE_INPUT` (segurança).
 * O corpo amarelo e as pupilas cabem e saem iguais em vermelho e verde; o azul do amarelo fica no mínimo que o ACES
 * alcança (ele mistura os canais). O branco precisaria de luminância ~4 na entrada e fica no máximo que não vaza.
 */
export const SUN_BLOOM_OUTPUT_CAP = 0.7
/** Entrada máxima (luminância) que não passa do limiar do bloom (0,8, suavização a partir dele). */
export const BLOOM_SAFE_INPUT = 0.79

const lumaOf = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
const capLuma = (c: Rgb, cap: number): Rgb => {
  const k = Math.min(1, cap / Math.max(lumaOf(c), 1e-4))
  return [c[0] * k, c[1] * k, c[2] * k]
}

/** O mesmo que o shader faz com bloom (FRAGMENT_CAP), em TS: cor de saída desejada → cor que entra no composer. */
export function bloomCompensated(c: Rgb): Rgb {
  return capLuma(acesFilmicInverse(capLuma(c, SUN_BLOOM_OUTPUT_CAP)), BLOOM_SAFE_INPUT)
}

/** Valor de `uSunBloom`: liga a compensação junto com o GlowBloom (store do bloom). */
export function sunBloomCompensation(bloomActive: boolean): number {
  return bloomActive ? 1 : 0
}

export const SUN_PROGRAM_KEY = 'sun-led-v3'
/** Malha densa o bastante para o balanço ficar liso (6 mil vértices; o deslocamento é por vértice). */
export const SUN_SEGMENTS: readonly [number, number] = [96, 64]
/** Emissivo do painel de LED (a cor vem da textura; sem tone mapping). */
export const SUN_EMISSIVE_INTENSITY = 0.85
/** Casca do brilho em volta (a luz que vaza do LED), em raios do sol. */
export const GLOW_SHELL = 1.45
/** Névoa: alcance do billboard, em raios do sol. */
export const HAZE_EXTENT = 2.2
/** Painel de LED: LEDs na volta e de polo a polo (1° cada); só aparecem de perto. */
export const LED_GRID: readonly [number, number] = [360, 180]

const VERTEX_PARS = /* glsl */ `#include <common>
${SUN_NOISE_GLSL}
varying vec3 vSunObj;
float sunHeight( vec3 n ) {
	vec3 drift = uSunTime * vec3( 0.05, 0.08, -0.06 );
	return sunFbm( n * 1.3 + drift ) * sunCalm( n );
}`

/**
 * Balanço suave: desloca ao longo da normal e refaz a normal com dois vizinhos na esfera (diferença finita),
 * 3 amostras por vértice. A tangente é qualquer uma: o produto vetorial sai na mesma normal.
 */
const VERTEX_NORMAL = /* glsl */ `vec3 sunN = normalize( position );
float sunR = length( position );
float sunAmp = sunR * ${f(SURFACE_AMPLITUDE)};
vec3 sunTA = normalize( abs( sunN.y ) < 0.99 ? cross( sunN, vec3( 0.0, 1.0, 0.0 ) ) : cross( sunN, vec3( 1.0, 0.0, 0.0 ) ) );
vec3 sunTB = cross( sunN, sunTA );
vec3 sunNA = normalize( sunN + sunTA * 0.02 );
vec3 sunNB = normalize( sunN + sunTB * 0.02 );
vec3 sunP0 = sunN * ( sunR + sunAmp * sunHeight( sunN ) );
vec3 sunPA = sunNA * ( sunR + sunAmp * sunHeight( sunNA ) );
vec3 sunPB = sunNB * ( sunR + sunAmp * sunHeight( sunNB ) );
vec3 objectNormal = normalize( cross( sunPA - sunP0, sunPB - sunP0 ) );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif
vSunObj = sunN;`

const VERTEX_POSITION = /* glsl */ `#include <begin_vertex>
transformed = sunP0;`

const FRAGMENT_PARS = /* glsl */ `#include <common>
${SUN_NOISE_GLSL}
uniform vec3 uSunPupil;
uniform float uSunBloom;
${ACES_INVERSE_GLSL}
uniform float uSunAberration;
varying vec3 vSunObj;`

/**
 * Aberração cromática: o vermelho e o azul vêm da textura deslocados (para fora e para dentro) na direção radial da
 * tela, com força `uSunAberration · (1 − μ)^2` (zero no centro do disco, onde está o rosto). O deslocamento em px vira
 * deslocamento em UV pelas derivadas da UV. Na costura do mapa (u volta de 1 para 0) a derivada explode: lá, nada.
 * `sunTexel` guarda a amostra sem deslocamento para as máscaras (corpo, branco dos olhos).
 */
const FRAGMENT_MAP = /* glsl */ `#ifdef USE_MAP
	vec4 sunTexel = texture2D( map, vMapUv );
	vec4 sampledDiffuseColor = sunTexel;
	{
		vec3 sunNv = normalize( vNormal );
		float sunMuCa = clamp( abs( dot( sunNv, normalize( vViewPosition ) ) ), 0.0, 1.0 );
		float sunCaPx = uSunAberration * pow( 1.0 - sunMuCa, ${f(ABERRATION_FALLOFF)} );
		vec2 sunDir = sunNv.xy / max( length( sunNv.xy ), 1e-4 );
		vec2 sunDx = dFdx( vMapUv );
		vec2 sunDy = dFdy( vMapUv );
		float sunSeam = step( 0.25, max( abs( sunDx.x ), abs( sunDy.x ) ) );
		vec2 sunCaUv = ( sunDx * sunDir.x + sunDy * sunDir.y ) * sunCaPx * ( 1.0 - sunSeam );
		sampledDiffuseColor.r = texture2D( map, vMapUv + sunCaUv ).r;
		sampledDiffuseColor.b = texture2D( map, vMapUv - sunCaUv ).b;
	}
	diffuseColor *= sampledDiffuseColor;
#endif`

const [FACE_X, FACE_Y] = FACE_CENTER
const LUMA = 'vec3( 0.2126, 0.7152, 0.0722 )'

/**
 * Painel de LED por cima da textura:
 * - só no corpo (amarelo; olhos e traços passam iguais): manchas claras redondas que derivam devagar, uma variação lenta
 *   de brilho e saturação (±6%) e uma queda leve na borda;
 * - pupilas: um disco em cada olho, na posição de `uSunPupil`, recortado pelo branco do olho (piscando não há branco);
 * - em tudo: a micro-grade de LEDs, que some com a distância pela derivada (nunca faz moiré).
 * O emissivo usa a mesma amostra com aberração da cor. Muda a cor difusa e a emissiva; continua sem tone mapping.
 */
const FRAGMENT_DETAIL = /* glsl */ `#ifdef USE_MAP
	totalEmissiveRadiance *= sampledDiffuseColor.rgb;
#else
	#include <emissivemap_fragment>
#endif
{
	vec3 sunObj = normalize( vSunObj );
	float sunBlot = 0.0;
	for ( int i = 0; i < 5; i ++ ) {
		float fi = float( i );
		float lat = sin( fi * 2.1 + 0.4 ) * 0.8;
		float lon = fi * 1.2566 + 0.5 + uSunTime * ( 0.025 + 0.008 * fi );
		vec3 c = vec3( cos( lat ) * sin( lon ), sin( lat ), cos( lat ) * cos( lon ) );
		float d = acos( clamp( dot( sunObj, c ), -1.0, 1.0 ) );
		float r = 0.13 + 0.07 * fract( fi * 0.618 );
		sunBlot += 1.0 - smoothstep( r * 0.25, r, d );
	}
	float sunBody = 1.0;
	float sunPupil = 0.0;
	float sunLedF = 1.0;
	#ifdef USE_MAP
		sunBody = smoothstep( 0.5, 0.8, sunTexel.r ) * ( 1.0 - smoothstep( 0.3, 0.7, sunTexel.b ) );
		float sunWhite = smoothstep( 0.55, 0.9, sunTexel.b );
		vec2 sunAt = vec2( vMapUv.x * ${f(FACE_W)}, ( 1.0 - vMapUv.y ) * ${f(FACE_H)} );
		vec2 sunEyeL = vec2( ${f(FACE_X - EYE.dx)}, ${f(FACE_Y + EYE.y)} ) + uSunPupil.xy;
		vec2 sunEyeR = vec2( ${f(FACE_X + EYE.dx)}, ${f(FACE_Y + EYE.y)} ) + uSunPupil.xy;
		float sunD = min( length( sunAt - sunEyeL ), length( sunAt - sunEyeR ) ) - uSunPupil.z;
		float sunAA = max( fwidth( sunD ), 1e-4 );
		sunPupil = ( 1.0 - smoothstep( -sunAA, sunAA, sunD ) ) * sunWhite;
		vec2 sunLed = vMapUv * vec2( ${f(LED_GRID[0])}, ${f(LED_GRID[1])} );
		float sunLedW = max( fwidth( sunLed.x ), fwidth( sunLed.y ) );
		float sunLedVis = 1.0 - smoothstep( 0.12, 0.3, sunLedW );
		float sunLedDot = 1.0 - smoothstep( 0.3, 0.5, length( fract( sunLed ) - 0.5 ) );
		sunLedF = 1.0 - 0.14 * ( 1.0 - sunLedDot ) * sunLedVis;
	#endif
	float sunMix = 0.4 * min( sunBlot, 1.0 ) * sunBody;
	vec3 sunBlotColor = ${linear('#FFEF7A')};
	diffuseColor.rgb = mix( diffuseColor.rgb, sunBlotColor, sunMix );
	totalEmissiveRadiance = mix( totalEmissiveRadiance, emissive * sunBlotColor, sunMix );
	float sunBright = 1.0 + 0.1 * sunFbm( sunObj * 2.2 + uSunTime * vec3( 0.03, 0.02, -0.025 ) ) * sunBody;
	float sunSat = 1.0 + 0.1 * sunFbm( sunObj * 1.6 - uSunTime * vec3( 0.02, -0.03, 0.02 ) + 11.0 ) * sunBody;
	diffuseColor.rgb = mix( vec3( dot( diffuseColor.rgb, ${LUMA} ) ), diffuseColor.rgb, sunSat ) * sunBright;
	totalEmissiveRadiance = mix( vec3( dot( totalEmissiveRadiance, ${LUMA} ) ), totalEmissiveRadiance, sunSat ) * sunBright;
	float sunMu = clamp( abs( dot( normal, normalize( vViewPosition ) ) ), 0.0, 1.0 );
	float sunEdge = mix( 1.0, mix( 0.85, 1.0, smoothstep( 0.0, 0.45, sunMu ) ), sunBody );
	diffuseColor.rgb *= sunEdge;
	totalEmissiveRadiance *= sunEdge;
	vec3 sunFeature = ${linear(SUN_FEATURE)};
	diffuseColor.rgb = mix( diffuseColor.rgb, sunFeature, sunPupil ) * sunLedF;
	totalEmissiveRadiance = mix( totalEmissiveRadiance, emissive * sunFeature, sunPupil ) * sunLedF;
}`

/** Com bloom: teto na saída (mantém o tom), inverso do ACES e teto de segurança na entrada (ver `SUN_BLOOM_OUTPUT_CAP`). */
const FRAGMENT_CAP = /* glsl */ `if ( uSunBloom > 0.5 ) {
	outgoingLight *= min( 1.0, ${f(SUN_BLOOM_OUTPUT_CAP)} / max( dot( outgoingLight, ${LUMA} ), 1e-4 ) );
	outgoingLight = sunAcesInverse( outgoingLight );
	outgoingLight *= min( 1.0, ${f(BLOOM_SAFE_INPUT)} / max( dot( outgoingLight, ${LUMA} ), 1e-4 ) );
}
#include <opaque_fragment>`

type ShaderLike = { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string }

const INJECTIONS = {
  vertex: ['#include <common>', '#include <beginnormal_vertex>', '#include <begin_vertex>'],
  fragment: ['#include <common>', '#include <map_fragment>', '#include <emissivemap_fragment>', '#include <opaque_fragment>'],
} as const

/** Injeta o balanço (vértice), a aberração, o painel de LED com as pupilas e o teto (fragmento); liga os uniforms. */
export function patchSunShader(shader: ShaderLike): void {
  for (const chunk of INJECTIONS.vertex) {
    if (!shader.vertexShader.includes(chunk)) throw new Error(`sunMaterial: o vertex shader não tem ${chunk}`)
  }
  for (const chunk of INJECTIONS.fragment) {
    if (!shader.fragmentShader.includes(chunk)) throw new Error(`sunMaterial: o fragment shader não tem ${chunk}`)
  }
  shader.uniforms.uSunTime = SUN_UNIFORMS.uSunTime
  shader.uniforms.uSunPupil = SUN_UNIFORMS.uSunPupil
  shader.uniforms.uSunBloom = SUN_UNIFORMS.uSunBloom
  shader.uniforms.uSunAberration = SUN_UNIFORMS.uSunAberration
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', VERTEX_PARS)
    .replace('#include <beginnormal_vertex>', VERTEX_NORMAL)
    .replace('#include <begin_vertex>', VERTEX_POSITION)
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', FRAGMENT_PARS)
    .replace('#include <map_fragment>', FRAGMENT_MAP)
    .replace('#include <emissivemap_fragment>', FRAGMENT_DETAIL)
    .replace('#include <opaque_fragment>', FRAGMENT_CAP)
}

/** Painel de LED: a textura do rosto como cor e emissivo, sem tone mapping, com o shader do sol injetado. */
export function createSunMaterial(texture: THREE.Texture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    emissiveMap: texture,
    emissive: '#ffffff',
    emissiveIntensity: SUN_EMISSIVE_INTENSITY,
    roughness: 0.7,
    toneMapped: false,
  })
  material.onBeforeCompile = patchSunShader
  material.customProgramCacheKey = () => SUN_PROGRAM_KEY
  return material
}

/** Esfera do sol: 96×64 e esfera envolvente um pouco maior que o balanço (o raycast usa a esfera sem deslocamento). */
export function createSunGeometry(): THREE.SphereGeometry {
  const geometry = new THREE.SphereGeometry(SUN_RADIUS, SUN_SEGMENTS[0], SUN_SEGMENTS[1])
  geometry.computeBoundingSphere()
  geometry.boundingSphere!.radius = SUN_RADIUS * (1 + 2 * SURFACE_AMPLITUDE)
  return geometry
}

const GLOW_VERTEX = /* glsl */ `varying vec3 vView;
varying vec3 vCenter;
varying float vRadius;
void main() {
	vec4 mv = modelViewMatrix * vec4( position, 1.0 );
	vView = mv.xyz;
	vCenter = ( modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
	vRadius = ${f(SUN_RADIUS)} * length( modelViewMatrix[ 0 ].xyz );
	gl_Position = projectionMatrix * mv;
}`

/**
 * Brilho em volta: o raio da câmera até o fragmento passa a uma distância b do centro do sol; ρ = b/R vai de 1
 * (borda do sol) a GLOW_SHELL (borda da casca), na perspectiva certa a qualquer distância. Queda lisa e igual em
 * toda a volta, com o vermelho indo um pouco mais longe e o azul um pouco menos (a franja da aberração).
 * Só o lado de trás da casca: o disco do sol o tapa pelo depth test, o rosto fica limpo.
 */
const GLOW_FRAGMENT = /* glsl */ `uniform vec3 uColor;
uniform float uOpacity;
uniform float uSunFringe;
varying vec3 vView;
varying vec3 vCenter;
varying float vRadius;
float glowAt( float rho ) {
	float fall = 1.0 - smoothstep( 1.0, ${f(GLOW_SHELL)}, rho );
	return fall * fall * fall;
}
void main() {
	vec3 d = normalize( vView );
	float rho = length( d * dot( vCenter, d ) - vCenter ) / vRadius;
	vec3 fall = vec3( glowAt( rho * ( 1.0 - uSunFringe ) ), glowAt( rho ), glowAt( rho * ( 1.0 + uSunFringe ) ) );
	gl_FragColor = vec4( uColor * fall * uOpacity, 1.0 );
	#include <colorspace_fragment>
}`

/** Opacidade do brilho sem bloom, no idle. */
export const SUN_GLOW_OPACITY = 0.32

/**
 * Opacidade do brilho: metade fixa, metade do modo (`SUN_LOOK[mode].glow`: mais forte no hover e no clique, mais
 * fraca no away), vezes a chave `halo` do visual com/sem bloom (o mesmo interruptor do antigo GlowHalo), no máximo 1.
 */
export function sunGlowOpacity(look: BloomLook, modeGlow: number): number {
  return Math.min(1, SUN_GLOW_OPACITY * look.halo * (0.5 + 0.5 * modeGlow))
}

/** Casca aditiva do brilho (lado de trás, sem escrever profundidade). `uOpacity` segue o store do bloom. */
export function createGlowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#FFD21F') }, uOpacity: { value: 0 }, uSunFringe: SUN_UNIFORMS.uSunFringe },
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

export function createGlowGeometry(): THREE.SphereGeometry {
  return new THREE.SphereGeometry(SUN_RADIUS * GLOW_SHELL, 48, 24)
}

/** Billboard: o quadrado fica no plano do centro do sol, sempre de frente para a câmera (o disco tapa o miolo). */
const HAZE_VERTEX = /* glsl */ `varying vec2 vRho;
void main() {
	vec4 c = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
	c.xy += position.xy * length( modelViewMatrix[ 0 ].xyz );
	vRho = position.xy / ${f(SUN_RADIUS)};
	gl_Position = projectionMatrix * c;
}`

/**
 * Névoa de luz quente: queda radial (mais densa junto do limbo) vezes fbm de 3 oitavas que deriva devagar; some antes
 * da borda do billboard. Vermelho e azul com quedas um pouco deslocadas (a franja da aberração).
 */
const HAZE_FRAGMENT = /* glsl */ `${SUN_NOISE_GLSL}
uniform vec3 uColor;
uniform float uOpacity;
uniform float uSunFringe;
varying vec2 vRho;
float hazeAt( float rho ) {
	return exp( -max( rho - 1.0, 0.0 ) * 3.0 ) * ( 1.0 - smoothstep( ${f(HAZE_EXTENT * 0.6)}, ${f(HAZE_EXTENT)}, rho ) );
}
void main() {
	float rho = length( vRho );
	vec2 drift = uSunTime * vec2( 0.03, -0.02 );
	float cloud = clamp( 0.55 + 0.7 * sunFbm( vec3( vRho * 1.3 + drift, uSunTime * 0.02 ) ), 0.15, 1.3 );
	vec3 dens = vec3( hazeAt( rho * ( 1.0 - uSunFringe ) ), hazeAt( rho ), hazeAt( rho * ( 1.0 + uSunFringe ) ) );
	gl_FragColor = vec4( uColor * dens * cloud * uOpacity, 1.0 );
	#include <colorspace_fragment>
}`

/** Opacidade da névoa sem bloom. */
export const SUN_HAZE_OPACITY = 0.1

/** Opacidade da névoa: a base vezes a chave `haze` do visual com/sem bloom. */
export function sunHazeOpacity(look: BloomLook): number {
  return SUN_HAZE_OPACITY * look.haze
}

/** Névoa aditiva (billboard, sem escrever profundidade). `uSunTime` parado = névoa parada. */
export function createHazeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunTime: SUN_UNIFORMS.uSunTime,
      uSunFringe: SUN_UNIFORMS.uSunFringe,
      uColor: { value: new THREE.Color('#FFC23A') },
      uOpacity: { value: 0 },
    },
    vertexShader: HAZE_VERTEX,
    fragmentShader: HAZE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

/** Quadrado do tamanho da névoa (a esfera envolvente cobre o billboard em qualquer orientação). */
export function createHazeGeometry(): THREE.PlaneGeometry {
  return new THREE.PlaneGeometry(2 * HAZE_EXTENT * SUN_RADIUS, 2 * HAZE_EXTENT * SUN_RADIUS)
}
