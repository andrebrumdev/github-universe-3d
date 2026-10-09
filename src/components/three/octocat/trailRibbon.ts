/**
 * Faixa de rastro em coordenadas do mundo (`Ribbon`): um histórico das posições de uma ponta (anel de capacidade fixa)
 * e uma tira virada para a câmera, refeita no lugar a cada quadro — nenhum buffer novo por quadro. O rastro de fogo
 * (`TrailRibbon`, no bocal) e o de vapor das pontas das asas (`Contrails`) usam a mesma faixa com duração e largura
 * próprias.
 *
 * Por ponto, o atributo `aTrail` (vec4) leva: x = idade (0 na ponta → 1 na cauda, pelo tempo), y = lado (−1/+1),
 * z = odômetro (distância percorrida até o ponto: o ruído do shader fica preso no espaço) e w = meia largura.
 * O primeiro ponto é sempre a ponta agora; o histórico cobre `seconds` (mais o primeiro ponto passado dele, com
 * idade 1, para a cauda não cortar seco).
 *
 * Emissão (0..1, por amostra): multiplica a largura. Com 0 a ponta segue a nave sem soltar nada (largura 0) e o que já
 * saiu envelhece e some — é assim que o rastro "para de emitir" sem cortar o que ficou para trás.
 */
import * as THREE from 'three'
import { trailHalfWidth } from './trailMaterial'

/** Quanto tempo de voo o rastro mostra (s). O Trail do drei (length 6) dava ~1 s a 60 fps. */
export const TRAIL_SECONDS = 1
/** Intervalo mínimo entre amostras (s): a 60 fps, uma por quadro; acima de 90 fps, pula quadros. */
export const TRAIL_SAMPLE_INTERVAL = 1 / 90
/** Amostras guardadas: 90/s × TRAIL_SECONDS, com folga para o ponto de idade 1. */
export const TRAIL_CAPACITY = 96

const STRIDE = 6 // x, y, z, tempo, odômetro, emissão

export interface RibbonOptions {
  /** Quanto tempo de voo a faixa mostra (s): a idade 1 da cauda. */
  seconds: number
  /** Amostras guardadas (a ponta é um ponto a mais). */
  capacity: number
  /** Intervalo mínimo entre amostras (s). */
  sampleInterval: number
  /** Meia largura (unidades do mundo) na idade 0..1 com o calor pedido, antes da emissão. */
  halfWidth: (age: number, heat: number) => number
}

export class Ribbon {
  readonly geometry = new THREE.BufferGeometry()
  private readonly seconds: number
  private readonly capacity: number
  private readonly sampleInterval: number
  private readonly halfWidth: (age: number, heat: number) => number
  // Float64: o instante guardado tem de bater com o do quadro (a amostra de agora é a própria ponta)
  private readonly samples: Float64Array
  private newest = -1
  private count = 0
  private lastSample = -Infinity
  private odometer = 0
  private readonly last = new THREE.Vector3()
  private hasLast = false
  // rascunhos do quadro
  private readonly pts: Float32Array
  private readonly ages: Float32Array
  private readonly odos: Float32Array
  private readonly emits: Float32Array
  private readonly position: THREE.BufferAttribute
  private readonly data: THREE.BufferAttribute
  /** Último lado válido: parada (sem tangente) ou olhando ao longo do rastro, a faixa reaproveita. */
  private readonly side = new THREE.Vector3(0, 1, 0)
  private readonly tangent = new THREE.Vector3()
  private readonly view = new THREE.Vector3()
  private readonly cross = new THREE.Vector3()

  constructor(options: RibbonOptions) {
    this.seconds = options.seconds
    this.capacity = options.capacity
    this.sampleInterval = options.sampleInterval
    this.halfWidth = options.halfWidth
    const POINTS = options.capacity + 1
    this.samples = new Float64Array(options.capacity * STRIDE)
    this.pts = new Float32Array(POINTS * 3)
    this.ages = new Float32Array(POINTS)
    this.odos = new Float32Array(POINTS)
    this.emits = new Float32Array(POINTS)
    this.position = new THREE.BufferAttribute(new Float32Array(POINTS * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.data = new THREE.BufferAttribute(new Float32Array(POINTS * 2 * 4), 4).setUsage(THREE.DynamicDrawUsage)
    for (let i = 0; i < POINTS; i++) {
      this.data.setY(2 * i, -1)
      this.data.setY(2 * i + 1, 1)
    }
    const index = new Uint16Array(options.capacity * 6)
    for (let i = 0; i < options.capacity; i++) {
      const v = 2 * i
      index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6)
    }
    this.geometry.setAttribute('position', this.position)
    this.geometry.setAttribute('aTrail', this.data)
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1))
    this.geometry.setDrawRange(0, 0)
  }

  /**
   * Registra a ponta em `head` (mundo) no instante `time` (s) e refaz a faixa virada para `eye` (posição da câmera),
   * com a largura de `halfWidth(idade, heat)` × a emissão de cada amostra (`emit`, 0..1, a de agora).
   */
  update(head: THREE.Vector3, time: number, eye: THREE.Vector3, heat: number, emit = 1): void {
    const cap = this.capacity
    if (this.hasLast) this.odometer += head.distanceTo(this.last)
    this.last.copy(head)
    this.hasLast = true
    if (this.count === 0 || time - this.lastSample >= this.sampleInterval - 1e-6) {
      this.newest = (this.newest + 1) % cap
      const o = this.newest * STRIDE
      this.samples[o] = head.x
      this.samples[o + 1] = head.y
      this.samples[o + 2] = head.z
      this.samples[o + 3] = time
      this.samples[o + 4] = this.odometer
      this.samples[o + 5] = emit
      this.count = Math.min(this.count + 1, cap)
      this.lastSample = time
    }

    // pontos da ponta para a cauda
    const { pts, ages, odos, emits, samples } = this
    pts[0] = head.x
    pts[1] = head.y
    pts[2] = head.z
    ages[0] = 0
    odos[0] = this.odometer
    emits[0] = emit
    let n = 1
    for (let k = 0; k < this.count; k++) {
      const o = ((this.newest - k + cap) % cap) * STRIDE
      const t = samples[o + 3]
      if (t >= time) continue // amostrada neste quadro: é a própria ponta
      const age = (time - t) / this.seconds
      pts[n * 3] = samples[o]
      pts[n * 3 + 1] = samples[o + 1]
      pts[n * 3 + 2] = samples[o + 2]
      ages[n] = Math.min(1, age)
      odos[n] = samples[o + 4]
      emits[n] = samples[o + 5]
      n++
      if (age >= 1) break
    }

    const { position, data, side, tangent, view, cross } = this
    for (let i = 0; i < n; i++) {
      const prev = (i > 0 ? i - 1 : i) * 3
      const next = (i < n - 1 ? i + 1 : i) * 3
      const p = i * 3
      tangent.set(pts[prev] - pts[next], pts[prev + 1] - pts[next + 1], pts[prev + 2] - pts[next + 2])
      view.set(eye.x - pts[p], eye.y - pts[p + 1], eye.z - pts[p + 2])
      cross.crossVectors(tangent, view)
      if (cross.lengthSq() > 1e-12) side.copy(cross).normalize()
      const w = this.halfWidth(ages[i], heat) * emits[i]
      position.setXYZ(2 * i, pts[p] - side.x * w, pts[p + 1] - side.y * w, pts[p + 2] - side.z * w)
      position.setXYZ(2 * i + 1, pts[p] + side.x * w, pts[p + 1] + side.y * w, pts[p + 2] + side.z * w)
      data.setX(2 * i, ages[i])
      data.setX(2 * i + 1, ages[i])
      data.setZ(2 * i, odos[i])
      data.setZ(2 * i + 1, odos[i])
      data.setW(2 * i, w)
      data.setW(2 * i + 1, w)
    }
    position.clearUpdateRanges()
    position.addUpdateRange(0, n * 2 * 3)
    position.needsUpdate = true
    data.clearUpdateRanges()
    data.addUpdateRange(0, n * 2 * 4)
    data.needsUpdate = true
    this.geometry.setDrawRange(0, n >= 2 ? (n - 1) * 6 : 0)
  }

  /** Esvazia a faixa (entre viagens): a próxima começa do zero, sem ligar no último ponto. */
  clear(): void {
    this.count = 0
    this.newest = -1
    this.lastSample = -Infinity
    this.odometer = 0
    this.hasLast = false
    this.geometry.setDrawRange(0, 0)
  }

  dispose(): void {
    this.geometry.dispose()
  }
}

/** Rastro de fogo do bocal: TRAIL_SECONDS de histórico, largura de `trailHalfWidth`. */
export class TrailRibbon extends Ribbon {
  constructor() {
    super({ seconds: TRAIL_SECONDS, capacity: TRAIL_CAPACITY, sampleInterval: TRAIL_SAMPLE_INTERVAL, halfWidth: trailHalfWidth })
  }
}
