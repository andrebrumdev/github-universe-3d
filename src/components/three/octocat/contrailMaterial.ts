/**
 * Rastro de vapor das pontas das asas na planagem (chama-piloto): duas faixas finas (`Ribbon` de trailRibbon.ts),
 * brancas puxando para o lilás da nave com a idade, que alargam um pouco e somem em CONTRAIL_SECONDS. Sem fogo: nada
 * de ruído nem brasas, só um vapor suave nas bordas.
 *
 * Aditivo (como o rastro de fogo), com `uOpacity` = brilho × `bloomLook(active).contrail`.
 */
import * as THREE from 'three'
import { COLORS } from '@/lib/ship/geometry'

/** Quanto tempo o vapor dura (s). */
export const CONTRAIL_SECONDS = 1.8
/** Amostras guardadas: 60/s × CONTRAIL_SECONDS, com folga para o ponto de idade 1. */
export const CONTRAIL_CAPACITY = 116
export const CONTRAIL_SAMPLE_INTERVAL = 1 / 60
/** Meia largura ao nascer (unidades do mundo: ~1/40 da envergadura da nave em cena) e quanto ela cresce até a cauda. */
export const CONTRAIL_HALF_WIDTH = 0.012
export const CONTRAIL_SPREAD = 1.6
/** Brilho do vapor no visual sem bloom: leve, não compete com o fogo. */
export const CONTRAIL_BRIGHTNESS = 0.32
/** Ritmos (1/s) da emissão: acende devagar no começo da planagem e corta rápido quando a queima de chegada começa. */
const EMIT_RISE = 4
const EMIT_FALL = 18

export const CONTRAIL_COLORS = { fresh: '#FFFFFF', old: COLORS.ship } as const

/** Meia largura na idade 0..1: fina na asa, alargando um pouco enquanto se espalha. */
export function contrailHalfWidth(age: number): number {
  const a = Number.isNaN(age) ? 0 : Math.min(1, Math.max(0, age))
  return CONTRAIL_HALF_WIDTH * (1 + CONTRAIL_SPREAD * a)
}

/** Emissão suavizada em direção a `on` (0..1): sobe em ~0,5 s, cai em ~0,1 s. `dt` 0 não muda nada. */
export function easeContrail(current: number, on: boolean, dt: number): number {
  const rate = on ? EMIT_RISE : EMIT_FALL
  const next = current + ((on ? 1 : 0) - current) * (1 - Math.exp(-rate * dt))
  // perto do alvo, assenta nele (sem cauda infinitesimal de emissão)
  return Math.abs(next - (on ? 1 : 0)) < 1e-3 ? (on ? 1 : 0) : next
}

const VERTEX = /* glsl */ `
attribute vec4 aTrail;
varying float vAge;
varying float vSide;
varying float vNear;

void main() {
  vAge = aTrail.x;
  vSide = aTrail.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // colado na lente (a câmera persegue a nave) some em vez de virar uma faixa na tela
  vNear = smoothstep(0.25, 1.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`

const FRAGMENT = /* glsl */ `
uniform float uOpacity;
uniform vec3 uFresh;
uniform vec3 uOld;
varying float vAge;
varying float vSide;
varying float vNear;

void main() {
  float age = clamp(vAge, 0.0, 1.0);
  // vapor: borda macia através, mais denso na asa e sumindo com a idade
  float across = exp(-3.0 * vSide * vSide);
  float fade = pow(1.0 - age, 1.6) * smoothstep(0.0, 0.04, age + 0.02);
  vec3 color = mix(uFresh, uOld, smoothstep(0.0, 0.7, age));
  gl_FragColor = vec4(color * (across * fade * vNear * uOpacity), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/** Material do vapor (um para as duas asas: mesma opacidade). */
export function createContrailMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0 },
      uFresh: { value: new THREE.Color(CONTRAIL_COLORS.fresh) },
      uOld: { value: new THREE.Color(CONTRAIL_COLORS.old) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

/** Opacidade do quadro (brilho × fator do bloom), sem alocar. */
export function setContrailOpacity(material: THREE.ShaderMaterial, opacity: number): void {
  material.uniforms.uOpacity.value = opacity
}
