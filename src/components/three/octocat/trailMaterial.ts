/**
 * Rastro da nave com o fogo da chama do propulsor: ShaderMaterial aditivo para a faixa de `trailRibbon.ts`, com o mesmo
 * ruído (`FIRE_NOISE_GLSL`) e a mesma paleta (THRUSTER_COLORS + o lilás da nave).
 *
 * - Ao longo (idade 0 no bocal → 1 na cauda): branco-ciano quente perto da nave, esfria para o ciano, o lilás e o
 *   violeta e some na cauda, comida pelo ruído. A largura afina com a idade (`trailHalfWidth`, aplicada na faixa).
 * - Através: borda suave (roída pelo ruído) e um núcleo claro no meio.
 * - Fogo: fbm rolando para trás (da nave para a cauda) e brasas — ruído em células presas ao espaço (odômetro da faixa ×
 *   largura em unidades do mundo), limiarizado em poucos pontinhos claros que piscam com o relógio.
 * - Velocidade (`trailParams`): turbulência, brilho, fluxo e largura crescem com |shipPose.velocity|.
 * - Estilingue (`uBoost`, suavizado por `easeSlingshot`): mais quente e mais claro durante o sobrevoo.
 * - Bloom: `uOpacity` recebe `bloomLook(active).trail` (o aditivo soma no buffer HDR do EffectComposer).
 *
 * Um material por rastro (`createTrailMaterial` em useMemo, `dispose` no unmount): o relógio e o calor são de cada um.
 */
import * as THREE from 'three'
import { COLORS } from '@/lib/ship/geometry'
import { FIRE_NOISE_GLSL } from './fireGlsl'
import { THRUSTER_COLORS } from './thrusterMaterial'

/** Paleta do rastro: a da chama (núcleo, ciano, violeta) com o lilás da nave entre o ciano e o violeta. */
export const TRAIL_COLORS = {
  core: THRUSTER_COLORS.core,
  mid: THRUSTER_COLORS.mid,
  lilac: COLORS.ship,
  edge: THRUSTER_COLORS.edge,
} as const

/**
 * Faixa de velocidade da viagem (u/s) para normalizar o calor. Medida nas transferências de Hohmann dos casos de
 * `transfer.test.ts`: a mediana de cada viagem fica entre ~2,5 (vizinho na mesma órbita) e ~27, o pico chega a ~60.
 * Abaixo de `min` o rastro fica frio; de `max` para cima, no máximo.
 */
export const TRAIL_SPEED = { min: 2, max: 40 } as const

/** Na queima, o rastro fica pelo menos tão quente quanto a esta velocidade × a força do motor (a partida sai devagar). */
export const BURN_TRAIL_SPEED = 24

/** Meia largura do rastro no bocal (unidades do mundo), em calor médio: ~ o raio da chama na viagem (0,33 × 0,18). */
export const TRAIL_HALF_WIDTH = 0.065

export type TrailParams = {
  /** Calor 0–1: a velocidade normalizada em TRAIL_SPEED, com raiz (a viagem típica já fica quente). */
  heat: number
  /** Brilho geral. */
  intensity: number
  /** Quanto o ruído rói as bordas e risca o corpo, 0–1. */
  turbulence: number
  /** Velocidade do relógio do fogo (o ruído rola mais rápido em velocidade alta). */
  flow: number
  /** Meia largura (unidades do mundo) na idade pedida. */
  halfWidth: number
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** Alvo novo para `trailParams` (crie um por rastro e reaproveite no useFrame). */
export const createTrailParams = (): TrailParams => ({ heat: 0, intensity: 0, turbulence: 0, flow: 0, halfWidth: 0 })

/**
 * Meia largura do rastro na idade `age` (0 no bocal, 1 na cauda) com calor `heat` (0–1; o estilingue pode passar um
 * pouco). Mais larga quando quente; afina até ~28% na cauda.
 */
export function trailHalfWidth(age: number, heat: number): number {
  const a = Number.isNaN(age) ? 0 : clamp01(age)
  const h = Number.isNaN(heat) ? 0 : Math.min(1.5, Math.max(0, heat))
  return TRAIL_HALF_WIDTH * (0.8 + 0.3 * h) * (1 - 0.72 * a)
}

/**
 * Parâmetros do rastro pela velocidade da nave (u/s) e, para a largura, pela idade (0 = bocal). Monótona na
 * velocidade; finita para qualquer entrada. Escreve em `out` (sem alocar no quadro) e o devolve.
 */
export function trailParams(speed: number, age = 0, out: TrailParams = createTrailParams()): TrailParams {
  const s = Number.isNaN(speed) ? 0 : speed
  const heat = Math.sqrt(clamp01((s - TRAIL_SPEED.min) / (TRAIL_SPEED.max - TRAIL_SPEED.min)))
  out.heat = heat
  out.intensity = 0.3 + 0.35 * heat
  out.turbulence = 0.35 + 0.65 * heat
  out.flow = 0.8 + 2.2 * heat
  out.halfWidth = trailHalfWidth(age, heat)
  return out
}

/**
 * Suaviza o empurrão do estilingue: sobe rápido ao entrar no sobrevoo (~0,1 s) e solta devagar (~0,4 s), para o
 * calor não estalar. `dt` 0 não muda nada.
 */
export function easeSlingshot(current: number, active: boolean, dt: number): number {
  const rate = active ? 8 : 2.5
  return current + ((active ? 1 : 0) - current) * (1 - Math.exp(-rate * dt))
}

const VERTEX = /* glsl */ `
attribute vec4 aTrail;
varying float vAge;
varying float vSide;
varying float vOdo;
varying float vHalf;
varying float vNear;

void main() {
  vAge = aTrail.x;
  vSide = aTrail.y;
  vOdo = aTrail.z;
  vHalf = aTrail.w;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // colado na lente (o rastro aponta para a câmera de perseguição), some em vez de virar um borrão na tela
  vNear = smoothstep(0.25, 1.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`

const FRAGMENT = /* glsl */ `
// o hash do ruído passa de 1e5: em mediump vira bloco; não depender do prefixo do three
precision highp float;

uniform float uTime;
uniform float uHeat;
uniform float uIntensity;
uniform float uTurbulence;
uniform float uBoost;
uniform float uOpacity;
uniform vec3 uCore;
uniform vec3 uMid;
uniform vec3 uLilac;
uniform vec3 uEdge;

varying float vAge;
varying float vSide;
varying float vOdo;
varying float vHalf;
varying float vNear;

${FIRE_NOISE_GLSL}

void main() {
  float heat = clamp(uHeat + 0.6 * uBoost, 0.0, 1.0);
  float age = clamp(vAge, 0.0, 1.0);
  float x = abs(vSide);

  // fogo rolando para trás: o ruído vive no odômetro (escala do mundo, igual em viagem curta ou longa); um traço em
  // vOdo * 2.5 + uTime * 1.5 constante anda para odômetros menores, isto é, para a cauda
  float turb = fbm3(vec3(vOdo * 2.5 + uTime * 1.5, vSide * 1.6, age * 3.0 - uTime * 0.4));
  float jitter = (turb - 0.5) * uTurbulence;

  // através: borda suave roída pelo ruído, núcleo claro no meio
  float edge = 1.0 - smoothstep(0.2, 1.0, x + jitter * 1.2);
  float core = 1.0 - smoothstep(0.0, 0.22 + 0.12 * heat, x + jitter * 0.1);
  // ao longo: some na cauda, rasgada pelo ruído; corpo riscado (mais para a cauda)
  float tail = 1.0 - smoothstep(0.35, 1.0, age + jitter * 0.4);
  float density = mix(1.0, 0.05 + 2.2 * turb * turb, uTurbulence * (0.7 + 0.3 * age));

  // temperatura: branco-ciano colado no bocal (mais longo quente e no estilingue) → ciano → lilás → violeta;
  // os vãos entre as línguas do ruído e a borda puxam o violeta
  float hotEnd = 0.015 + 0.035 * heat + 0.08 * uBoost;
  vec3 color = mix(uCore, uMid, smoothstep(0.0, hotEnd + 0.05, age + jitter * 0.04));
  color = mix(color, uLilac, smoothstep(hotEnd + 0.12, 0.55, age + jitter * 0.2));
  color = mix(color, uEdge, smoothstep(0.45, 0.9, age + jitter * 0.2));
  color = mix(color, uEdge, clamp((1.0 - turb) * 0.4 + x * x * 0.4, 0.0, 0.7));

  vec3 rgb = color * (0.6 * edge * tail * density);
  rgb += color * (0.1 * core * tail);
  float hot = core * (1.0 - smoothstep(0.0, hotEnd + 0.05, age));
  rgb += uCore * hot * (0.3 + 0.2 * heat + 0.4 * uBoost);

  // brasas: células presas ao espaço (odômetro × largura, em unidades do mundo); o hash da célula, limiarizado, acende
  // poucas, cada uma um pontinho redondo num lugar sorteado dentro dela, piscando com o relógio
  vec2 cell = vec2(vOdo, vSide * vHalf) * 12.0;
  vec2 id = floor(cell);
  float pick = hash3(vec3(id, 7.0));
  vec2 spot = vec2(hash3(vec3(id, 1.0)), hash3(vec3(id, 2.0))) * 0.6 + 0.2;
  float speck = 1.0 - smoothstep(0.04, 0.13, length(fract(cell) - spot));
  float blink = 0.55 + 0.45 * sin(uTime * 9.0 + pick * 60.0);
  float spark = step(0.86 - 0.08 * heat - 0.06 * uBoost, pick) * speck * blink;
  spark *= (1.0 - smoothstep(0.15, 0.9, age)) * (1.0 - smoothstep(0.6, 1.0, x));
  rgb += mix(uCore, uLilac, clamp(age * 1.6, 0.0, 1.0)) * spark * (0.7 + 0.5 * heat + 0.5 * uBoost);

  rgb *= uIntensity * uOpacity * (1.0 + 0.35 * uBoost) * vNear;
  gl_FragColor = vec4(rgb, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/** Material do rastro de uma nave. Duas faces: a faixa vira para a câmera, mas o sentido do giro depende da curva. */
export function createTrailMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHeat: { value: 0 },
      uIntensity: { value: 0 },
      uTurbulence: { value: 0 },
      uBoost: { value: 0 },
      uOpacity: { value: 1 },
      uCore: { value: new THREE.Color(TRAIL_COLORS.core) },
      uMid: { value: new THREE.Color(TRAIL_COLORS.mid) },
      uLilac: { value: new THREE.Color(TRAIL_COLORS.lilac) },
      uEdge: { value: new THREE.Color(TRAIL_COLORS.edge) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

/**
 * Passa os parâmetros do quadro para os uniforms, sem alocar. `uTime` anda `delta × flow` (integrado: a troca de
 * velocidade não dá salto no ruído); com delta 0 (movimento reduzido) o fogo fica parado. `boost` é o estilingue
 * suavizado (0–1); `opacity`, o fator do bloom.
 */
export function updateTrailMaterial(material: THREE.ShaderMaterial, params: TrailParams, boost: number, opacity: number, delta: number): void {
  const u = material.uniforms
  u.uTime.value += delta * params.flow
  u.uHeat.value = params.heat
  u.uIntensity.value = params.intensity
  u.uTurbulence.value = params.turbulence
  u.uBoost.value = boost
  u.uOpacity.value = opacity
}
