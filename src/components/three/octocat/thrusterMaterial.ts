/**
 * Chama do propulsor: ShaderMaterial aditivo com ruído animado (fbm de 3 oitavas de value noise 3D) rolando do bocal
 * para fora, gradiente de temperatura ao longo do comprimento (núcleo branco-ciano → ciano → violeta → some na ponta,
 * comida pelo ruído), silhueta suave por fresnel e discos de choque (shock diamonds) fracos no núcleo em velocidade alta.
 *
 * Um material por nave (`createThrusterMaterial` em useMemo, `dispose` no unmount): os uniforms de nível e de relógio
 * são de cada nave. A geometria (FLAME_GEOMETRY) aponta para −z a partir da origem, no espaço local; o shader usa a
 * posição local (antes da escala do mesh), então o gradiente estica junto quando o mesh tremula em z.
 */
import * as THREE from 'three'
import { COLORS, NOZZLE, THRUSTER } from '@/lib/ship/geometry'
import { bloomLook } from '@/store/bloom'

/** Paleta da chama: núcleo quente quase branco puxado para o ciano, ciano do propulsor, violeta da cauda. */
export const THRUSTER_COLORS = {
  core: '#E6FDFF',
  mid: COLORS.thruster,
  edge: '#8B5CF6',
} as const

export type ThrusterParams = {
  /** false com nível 0: o mesh some (nem desenha). */
  visible: boolean
  /** Nível limitado a 0–1,25 (vai para `uLevel`: comprimento do núcleo quente). */
  level: number
  /**
   * Escala z do mesh (comprimento relativo a THRUSTER.length), convexa no nível: escolta (0,25) ≈ 0,52 — curta, mas
   * passando do lábio —, entrando (0,8) ≈ 2,05, viagem (1) ≈ 3 (um rastro longo). A tremulação mexe metade do que
   * mexia (o ruído do shader já dá vida).
   */
  length: number
  /** Brilho geral, 0 → ~1,1. */
  intensity: number
  /** Velocidade do relógio da chama (o ruído rola mais rápido em nível alto). */
  speed: number
  /** Quanto o ruído come a ponta e risca o corpo, 0–1. */
  turbulence: number
  /** Peso dos discos de choque, 0–1: só aparecem em viagem (nível ≥ ~0,8). */
  diamonds: number
  /** Tremulação como razão em volta de 1 (thrusterScale / nível), limitada a 0,5–1,5. */
  flicker: number
}

const MAX_LEVEL = 1.25
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Alvo novo para `thrusterParams` (crie um por nave e reaproveite no useFrame). */
export const createThrusterParams = (): ThrusterParams => ({
  visible: false,
  level: 0,
  length: 0,
  intensity: 0,
  speed: 0,
  turbulence: 0,
  diamonds: 0,
  flicker: 1,
})

/**
 * Parâmetros do shader a partir do nível do propulsor (ShipRig: ~1 viajando, 0,8 entrando, 0,25 na escolta) e do valor
 * tremulado de `thrusterScale(t, nível)` (ou o próprio nível sob movimento reduzido). Monótona no nível; nível 0 apaga.
 * Escreve em `out` (sem alocar no quadro) e o devolve.
 */
export function thrusterParams(level: number, flicker: number, out: ThrusterParams = createThrusterParams()): ThrusterParams {
  if (!(level > 0)) {
    out.visible = false
    out.level = out.length = out.intensity = out.speed = out.turbulence = out.diamonds = 0
    out.flicker = 1
    return out
  }
  const l = Math.min(level, MAX_LEVEL)
  const ratio = Number.isFinite(flicker) ? flicker / level : 1
  out.visible = true
  out.level = l
  out.flicker = Math.min(1.5, Math.max(0.5, ratio))
  out.length = (0.35 + 2.65 * l * l) * (1 + 0.5 * (out.flicker - 1))
  // acende rápido do zero (sem estalo) e cresce menos que linear: a escolta ainda tem chama visível
  out.intensity = smoothstep(0, 0.12, l) * Math.pow(l, 0.6)
  out.speed = 0.8 + 1.6 * l
  out.turbulence = 0.4 + 0.6 * Math.min(l, 1)
  out.diamonds = smoothstep(0.75, 0.95, l)
  return out
}

/**
 * Opacidade do halo (GlowHalo) na boca do bocal: 0,8 × o valor tremulado, vezes o fator do visual com bloom — o sprite
 * aditivo, somado no buffer HDR do EffectComposer, ficava maior e mais claro que a própria chama.
 */
export function thrusterHaloOpacity(flicker: number, bloomActive: boolean): number {
  return 0.8 * flicker * bloomLook(bloomActive).thrusterHalo
}

const f = (n: number) => n.toFixed(4)

const VERTEX = /* glsl */ `
varying vec3 vLocal;
varying vec3 vNormalV;
varying vec3 vViewV;

void main() {
  vLocal = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`

const FRAGMENT = /* glsl */ `
// o hash do ruído passa de 1e5: em mediump vira bloco; não depender do prefixo do three
precision highp float;

uniform float uTime;
uniform float uLevel;
uniform float uFlicker;
uniform float uIntensity;
uniform float uTurbulence;
uniform float uDiamonds;
uniform vec3 uCore;
uniform vec3 uMid;
uniform vec3 uEdge;

varying vec3 vLocal;
varying vec3 vNormalV;
varying vec3 vViewV;

#define FLAME_LENGTH ${f(THRUSTER.length)}
#define FLAME_SQUASH ${f(NOZZLE.squash)}

// value noise 3D barato (hash aritmético, sem textura)
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 u = fract(x);
  u = u * u * (3.0 - 2.0 * u);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), u.x),
        mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
    mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), u.x),
        mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
    u.z);
}
float fbm3(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * noise3(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    amp *= 0.5;
  }
  return sum / 0.875;
}

void main() {
  // 0 na boca do bocal, 1 na ponta (a geometria aponta para −z)
  float axial = clamp(-vLocal.z / FLAME_LENGTH, 0.0, 1.0);
  float facing = abs(dot(normalize(vNormalV), normalize(vViewV)));

  // ruído no espaço da nave, rolando para fora: um traço do ruído em z_noise fixo anda para a ponta com o relógio
  vec3 q = vec3(vLocal.x * 7.0, vLocal.y * 7.0 / FLAME_SQUASH, axial * 3.0 - uTime);
  float turb = fbm3(q);
  float jitter = (turb - 0.5) * uTurbulence;

  // ponta rasgada: o corte anda com o ruído; corpo riscado pelo ruído
  float body = 1.0 - smoothstep(0.5, 1.0, axial + jitter * 0.7);
  // mais riscado para a ponta, quase liso no núcleo
  float density = mix(1.0, 0.1 + 1.8 * turb * turb, uTurbulence * (0.35 + 0.65 * axial));

  // temperatura: núcleo quente (mais longo em nível alto) → ciano → violeta
  float coreEnd = 0.08 + 0.14 * uLevel;
  vec3 color = mix(uCore, uMid, smoothstep(0.0, coreEnd + 0.12, axial + jitter * 0.12));
  color = mix(color, uEdge, smoothstep(0.3, 0.8, axial + jitter * 0.25));
  // silhueta puxa para o violeta e some (fresnel)
  color = mix(color, uEdge, (1.0 - facing) * 0.45);
  float soft = smoothstep(0.0, 0.9, facing);

  // núcleo branco-ciano colado no bocal, olhando de frente para o eixo
  float core = pow(facing, 4.0);
  float hot = core * (1.0 - smoothstep(0.0, coreEnd + 0.1, axial));

  // discos de choque: faixas periódicas no núcleo, sumindo com a distância
  float bands = pow(0.5 + 0.5 * cos(axial * 6.2831853 * 4.5), 8.0);
  float diamonds = uDiamonds * bands * core * (1.0 - smoothstep(0.05, 0.6, axial));

  float flick = 0.8 + 0.2 * uFlicker;
  vec3 rgb = color * (0.5 * soft * body * density);
  rgb += uCore * (0.45 * hot * uLevel + 0.35 * diamonds) * body;
  rgb *= uIntensity * flick;
  // face de trás (dentro do volume) soma menos: dá corpo sem estourar (sem desvio)
  rgb *= mix(0.6, 1.0, float(gl_FrontFacing));

  gl_FragColor = vec4(rgb, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/**
 * Material da chama de uma nave. Duas faces: olhando de trás (a câmera da escolta), a face de dentro perto do bocal é
 * o que mostra o núcleo quente através do penacho; aditivo, então a ordem das faces não importa.
 */
export function createThrusterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uFlicker: { value: 1 },
      uIntensity: { value: 0 },
      uTurbulence: { value: 0 },
      uDiamonds: { value: 0 },
      uCore: { value: new THREE.Color(THRUSTER_COLORS.core) },
      uMid: { value: new THREE.Color(THRUSTER_COLORS.mid) },
      uEdge: { value: new THREE.Color(THRUSTER_COLORS.edge) },
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
 * Passa os parâmetros do quadro para os uniforms, sem alocar. `uTime` é o relógio da chama: anda `delta × speed`
 * (integrado, para a troca de nível não dar salto no ruído); com delta 0 (movimento reduzido) a chama fica parada.
 */
export function updateThrusterMaterial(material: THREE.ShaderMaterial, params: ThrusterParams, delta: number): void {
  const u = material.uniforms
  u.uTime.value += delta * params.speed
  u.uLevel.value = params.level
  u.uFlicker.value = params.flicker
  u.uIntensity.value = params.intensity
  u.uTurbulence.value = params.turbulence
  u.uDiamonds.value = params.diamonds
}
