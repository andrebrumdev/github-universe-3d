/**
 * Faixa do rastro da nave em coordenadas do mundo: um histórico das posições do bocal (anel de capacidade fixa) e uma
 * tira virada para a câmera, refeita no lugar a cada quadro — nenhum buffer novo por quadro.
 *
 * Por ponto, o atributo `aTrail` (vec4) leva: x = idade (0 no bocal → 1 na cauda, pelo tempo), y = lado (−1/+1),
 * z = odômetro (distância percorrida até o ponto: as brasas do shader ficam presas no espaço) e w = meia largura.
 * O primeiro ponto é sempre o bocal agora; o histórico cobre TRAIL_SECONDS (mais o primeiro ponto passado dele, com
 * idade 1, para a cauda não cortar seco).
 */
import * as THREE from 'three'
import { trailHalfWidth } from './trailMaterial'

/** Quanto tempo de voo o rastro mostra (s). O Trail do drei (length 6) dava ~1 s a 60 fps. */
export const TRAIL_SECONDS = 1
/** Intervalo mínimo entre amostras (s): a 60 fps, uma por quadro; acima de 90 fps, pula quadros. */
export const TRAIL_SAMPLE_INTERVAL = 1 / 90
/** Amostras guardadas: 90/s × TRAIL_SECONDS, com folga para o ponto de idade 1. */
export const TRAIL_CAPACITY = 96

const STRIDE = 5 // x, y, z, tempo, odômetro
const POINTS = TRAIL_CAPACITY + 1 // + o bocal

export class TrailRibbon {
  readonly geometry = new THREE.BufferGeometry()
  private readonly samples = new Float32Array(TRAIL_CAPACITY * STRIDE)
  private newest = -1
  private count = 0
  private lastSample = -Infinity
  private odometer = 0
  private readonly last = new THREE.Vector3()
  private hasLast = false
  // rascunhos do quadro
  private readonly pts = new Float32Array(POINTS * 3)
  private readonly ages = new Float32Array(POINTS)
  private readonly odos = new Float32Array(POINTS)
  private readonly position: THREE.BufferAttribute
  private readonly data: THREE.BufferAttribute
  /** Último lado válido: parada (sem tangente) ou olhando ao longo do rastro, a faixa reaproveita. */
  private readonly side = new THREE.Vector3(0, 1, 0)
  private readonly tangent = new THREE.Vector3()
  private readonly view = new THREE.Vector3()
  private readonly cross = new THREE.Vector3()

  constructor() {
    this.position = new THREE.BufferAttribute(new Float32Array(POINTS * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.data = new THREE.BufferAttribute(new Float32Array(POINTS * 2 * 4), 4).setUsage(THREE.DynamicDrawUsage)
    for (let i = 0; i < POINTS; i++) {
      this.data.setY(2 * i, -1)
      this.data.setY(2 * i + 1, 1)
    }
    const index = new Uint16Array(TRAIL_CAPACITY * 6)
    for (let i = 0; i < TRAIL_CAPACITY; i++) {
      const v = 2 * i
      index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6)
    }
    this.geometry.setAttribute('position', this.position)
    this.geometry.setAttribute('aTrail', this.data)
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1))
    this.geometry.setDrawRange(0, 0)
  }

  /**
   * Registra o bocal em `head` (mundo) no instante `time` (s) e refaz a faixa virada para `eye` (posição da câmera),
   * com a largura de `trailHalfWidth(idade, heat)`.
   */
  update(head: THREE.Vector3, time: number, eye: THREE.Vector3, heat: number): void {
    if (this.hasLast) this.odometer += head.distanceTo(this.last)
    this.last.copy(head)
    this.hasLast = true
    if (this.count === 0 || time - this.lastSample >= TRAIL_SAMPLE_INTERVAL - 1e-6) {
      this.newest = (this.newest + 1) % TRAIL_CAPACITY
      const o = this.newest * STRIDE
      this.samples[o] = head.x
      this.samples[o + 1] = head.y
      this.samples[o + 2] = head.z
      this.samples[o + 3] = time
      this.samples[o + 4] = this.odometer
      this.count = Math.min(this.count + 1, TRAIL_CAPACITY)
      this.lastSample = time
    }

    // pontos do bocal para a cauda
    const { pts, ages, odos, samples } = this
    pts[0] = head.x
    pts[1] = head.y
    pts[2] = head.z
    ages[0] = 0
    odos[0] = this.odometer
    let n = 1
    for (let k = 0; k < this.count; k++) {
      const o = ((this.newest - k + TRAIL_CAPACITY) % TRAIL_CAPACITY) * STRIDE
      const t = samples[o + 3]
      if (t >= time) continue // amostrada neste quadro: é o próprio bocal
      const age = (time - t) / TRAIL_SECONDS
      pts[n * 3] = samples[o]
      pts[n * 3 + 1] = samples[o + 1]
      pts[n * 3 + 2] = samples[o + 2]
      ages[n] = Math.min(1, age)
      odos[n] = samples[o + 4]
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
      const w = trailHalfWidth(ages[i], heat)
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

  dispose(): void {
    this.geometry.dispose()
  }
}
