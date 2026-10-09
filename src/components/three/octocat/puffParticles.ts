/**
 * Puff de ré da frenagem: um pool fixo de partículas (nuvens de vapor e o clarão no bico) desenhadas como
 * quadrados virados para a câmera numa só malha instanciada, com material compartilhado. Tudo no lugar: nada é alocado
 * por quadro; as vivas ficam no começo do pool e `instanceCount` diz quantas desenhar.
 *
 * O puff: em cada bico, um clarão curto e branco e nuvens branco-ciano que saem para a frente (no sentido da viagem,
 * mais a velocidade da nave) em velocidades escalonadas — juntas, uma nuvem só —, crescem, perdem velocidade (arrasto)
 * e somem em ~PUFF_LIFE s. A nave, freando, entra nela.
 */
import * as THREE from 'three'
import { COLORS } from '@/lib/ship/geometry'

/** Partículas no pool (2 bicos × (clarão + nuvens), com folga para um puff novo antes do anterior sumir). */
export const PUFF_POOL = 48
/** Vida média de uma nuvem (s; cada uma varia ±10%) e do clarão. */
export const PUFF_LIFE = 1.15
export const FLASH_LIFE = 0.12
/** Nuvenzinhas por bico em cada puff. */
export const CLOUDS_PER_NOZZLE = 5
/** Velocidade de saída (unidades/s) à frente da nave, num puff de força média, e o arrasto (1/s). */
export const PUFF_SPEED = 7
export const PUFF_DRAG = 2.8
/** Tamanho (meia largura, unidades do mundo) ao nascer e no fim; o clarão. */
export const PUFF_SIZE = { start: 0.08, end: 0.6, flash: 0.13 } as const
/** Brilho no visual sem bloom. */
export const PUFF_BRIGHTNESS = 0.8

const STRIDE = 12 // x y z, vx vy vz, idade, vida, tamanho inicial, final, força, tipo

/** Gerador com semente (mulberry32): o espalhamento das nuvens é o mesmo a cada visita. */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Raio relativo (0 no nascimento → 1 no fim) de uma nuvem: cresce rápido e assenta. */
export function puffGrowth(age: number): number {
  const a = Math.min(1, Math.max(0, age))
  return 1 - (1 - a) * (1 - a)
}

/** Opacidade relativa de uma nuvem pela idade 0..1: acende num instante e some até o fim da vida. */
export function puffFade(age: number): number {
  const a = Math.min(1, Math.max(0, age))
  return Math.min(1, a / 0.08) * (1 - a) * (1 - a)
}

export class PuffPool {
  readonly geometry = new THREE.InstancedBufferGeometry()
  private readonly state = new Float32Array(PUFF_POOL * STRIDE)
  private alive = 0
  private readonly random = seeded(20261009)
  private readonly center: THREE.InstancedBufferAttribute
  private readonly data: THREE.InstancedBufferAttribute

  constructor() {
    const corner = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3))
    this.geometry.setAttribute('corner', new THREE.BufferAttribute(corner, 2))
    this.geometry.setIndex([0, 1, 2, 2, 1, 3])
    this.center = new THREE.InstancedBufferAttribute(new Float32Array(PUFF_POOL * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.data = new THREE.InstancedBufferAttribute(new Float32Array(PUFF_POOL * 4), 4).setUsage(THREE.DynamicDrawUsage)
    this.geometry.setAttribute('iCenter', this.center)
    this.geometry.setAttribute('iData', this.data)
    this.geometry.instanceCount = 0
  }

  get count(): number {
    return this.alive
  }

  private spawn(p: THREE.Vector3, v: THREE.Vector3, life: number, size0: number, size1: number, strength: number, kind: number): void {
    if (this.alive >= PUFF_POOL) return
    const o = this.alive * STRIDE
    const st = this.state
    st[o] = p.x
    st[o + 1] = p.y
    st[o + 2] = p.z
    st[o + 3] = v.x
    st[o + 4] = v.y
    st[o + 5] = v.z
    st[o + 6] = 0
    st[o + 7] = life
    st[o + 8] = size0
    st[o + 9] = size1
    st[o + 10] = strength
    st[o + 11] = kind
    this.alive++
  }

  private readonly vel = new THREE.Vector3()
  private readonly side = new THREE.Vector3()
  private readonly up = new THREE.Vector3()

  /**
   * Um puff no bico `nozzle` (mundo): clarão parado no bico (anda com a nave) e CLOUDS_PER_NOZZLE nuvens saindo para
   * a frente (`forward`, unitário) a PUFF_SPEED × força, mais a velocidade da nave (`shipVelocity`), com um leque leve.
   * `scale` encolhe tamanho e velocidade (perto da lente, na volta para a escolta).
   */
  burst(nozzle: THREE.Vector3, forward: THREE.Vector3, shipVelocity: THREE.Vector3, strength: number, scale = 1): void {
    const k = Math.min(1.6, Math.max(0.3, strength))
    this.spawn(nozzle, shipVelocity, FLASH_LIFE, PUFF_SIZE.flash * scale, PUFF_SIZE.flash * 1.6 * scale, k, 1)
    this.side.set(forward.z, 0, -forward.x)
    if (this.side.lengthSq() < 1e-6) this.side.set(1, 0, 0)
    this.side.normalize()
    this.up.crossVectors(this.side, forward).normalize()
    for (let i = 0; i < CLOUDS_PER_NOZZLE; i++) {
      // velocidades escalonadas: as nuvens se espalham ao longo do jato e formam uma nuvem só
      const speed = PUFF_SPEED * scale * k * (0.45 + (0.7 * i) / (CLOUDS_PER_NOZZLE - 1) + 0.15 * this.random())
      this.vel
        .copy(forward)
        .multiplyScalar(speed)
        .addScaledVector(this.side, (this.random() - 0.5) * 0.35 * speed)
        .addScaledVector(this.up, (this.random() - 0.5) * 0.35 * speed)
        .add(shipVelocity)
      const life = PUFF_LIFE * (0.9 + 0.2 * this.random())
      this.spawn(nozzle, this.vel, life, PUFF_SIZE.start * scale, PUFF_SIZE.end * scale * (0.7 + 0.3 * k), k, 0)
    }
  }

  /** Avança `dt` s (arrasto, idade), descarta as mortas e reescreve os atributos no lugar. */
  update(dt: number): void {
    const st = this.state
    const drag = Math.exp(-PUFF_DRAG * dt)
    let n = 0
    for (let i = 0; i < this.alive; i++) {
      const o = i * STRIDE
      const age = st[o + 6] + dt
      if (age >= st[o + 7]) continue
      // compacta: a viva vai para a posição n
      const d = n * STRIDE
      if (d !== o) st.copyWithin(d, o, o + STRIDE)
      st[d + 6] = age
      // o clarão segue com a nave (sem arrasto); a nuvem freia
      const k = st[d + 11] === 1 ? 1 : drag
      st[d + 3] *= k
      st[d + 4] *= k
      st[d + 5] *= k
      st[d] += st[d + 3] * dt
      st[d + 1] += st[d + 4] * dt
      st[d + 2] += st[d + 5] * dt
      const a = age / st[d + 7]
      const flash = st[d + 11] === 1
      const size = flash ? st[d + 8] + (st[d + 9] - st[d + 8]) * a : st[d + 8] + (st[d + 9] - st[d + 8]) * puffGrowth(a)
      const alpha = flash ? (1 - a) * (1 - a) : puffFade(a)
      this.center.setXYZ(n, st[d], st[d + 1], st[d + 2])
      this.data.setXYZW(n, a, size, alpha * Math.min(1, st[d + 10]), flash ? 1 : 0)
      n++
    }
    this.alive = n
    this.geometry.instanceCount = n
    if (n > 0) {
      this.center.clearUpdateRanges()
      this.center.addUpdateRange(0, n * 3)
      this.center.needsUpdate = true
      this.data.clearUpdateRanges()
      this.data.addUpdateRange(0, n * 4)
      this.data.needsUpdate = true
    }
  }

  clear(): void {
    this.alive = 0
    this.geometry.instanceCount = 0
  }

  dispose(): void {
    this.geometry.dispose()
  }
}

const VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec3 iCenter;
attribute vec4 iData;
varying vec2 vCorner;
varying vec4 vData;
varying float vNear;

void main() {
  vCorner = corner;
  vData = iData;
  vec4 mv = modelViewMatrix * vec4(iCenter, 1.0);
  mv.xy += corner * iData.y;
  // colada na lente some (a câmera de perseguição pode passar pelas nuvens)
  vNear = smoothstep(0.3, 1.2, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`

const FRAGMENT = /* glsl */ `
uniform float uOpacity;
uniform vec3 uWhite;
uniform vec3 uCyan;
varying vec2 vCorner;
varying vec4 vData;
varying float vNear;

void main() {
  float d = length(vCorner);
  if (d > 1.0) discard;
  float age = vData.x;
  float alpha = vData.z;
  vec3 color;
  float shape;
  if (vData.w > 0.5) {
    // clarão: núcleo branco pequeno e quente
    shape = pow(1.0 - d, 3.0);
    color = uWhite * 1.6;
  } else {
    // nuvenzinha: borda macia, mais densa no meio, branca puxando para o ciano com a idade
    shape = (1.0 - smoothstep(0.15, 1.0, d)) * (0.6 + 0.4 * (1.0 - d));
    color = mix(uWhite, uCyan, smoothstep(0.1, 0.8, age));
  }
  gl_FragColor = vec4(color * (shape * alpha * vNear * uOpacity), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/** Material dos puffs (um para o pool todo). Aditivo, sem escrever profundidade. */
export function createPuffMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0 },
      uWhite: { value: new THREE.Color('#FFFFFF') },
      uCyan: { value: new THREE.Color(COLORS.dome) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
}

/** Opacidade do quadro (brilho × fator do bloom), sem alocar. */
export function setPuffOpacity(material: THREE.ShaderMaterial, opacity: number): void {
  material.uniforms.uOpacity.value = opacity
}
