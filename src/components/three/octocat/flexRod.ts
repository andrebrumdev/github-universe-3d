/**
 * Peças que balançam (tentáculos do piloto, antena da nave): uma cadeia de Verlet (src/lib/ship/verlet.ts)
 * dobra uma malha já pronta, sem refazer a varredura.
 *
 * A malha de descanso (a aprovada, feita com `sweep`) fica amarrada a uma "espinha": amostras de uma
 * Catmull-Rom que passa pelos nós da cadeia, cada uma com um referencial (tangente, normal, binormal) por
 * transporte paralelo. Cada vértice guarda a amostra mais próxima e o deslocamento nesse referencial; a cada
 * quadro a espinha segue os nós e os vértices são remontados no lugar. Na pose de descanso o resultado é
 * exatamente a malha original (mesmo perfil, afinamento, cores por vértice, ventosas e ponta).
 *
 * Os materiais são `flatShading`: a normal sai das derivadas da tela, então não é preciso recalcular normais.
 */
import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ESCORT_FOLLOW } from '@/lib/ship/escort'
import { MAX_FRAME_DT } from '@/lib/ship/motion'
import type { ShipMode } from '@/lib/ship/shipMachine'
import { createChain, stepChain, type VerletChain, type VerletInput, type VerletOptions } from '@/lib/ship/verlet'
import { shipPose } from '@/store/shipPose'

type Vec3 = readonly [number, number, number]

/** Espinha: amostras da curva pelos nós (parâmetros fixos) com referencial ortonormal por amostra. */
export class FlexSpine {
  readonly count: number
  readonly positions: Float32Array
  readonly tangents: Float32Array
  readonly normals: Float32Array
  readonly binormals: Float32Array
  private readonly points: THREE.Vector3[]
  private readonly curve: THREE.CatmullRomCurve3
  private readonly restTangent = new THREE.Vector3()
  private readonly restNormal = new THREE.Vector3()
  /** Giro deliberado da pose de descanso (o aceno do braço livre), levado para o referencial da raiz. */
  private readonly rootTurn = new THREE.Quaternion()
  private readonly rootTangent = new THREE.Vector3()
  private readonly rootNormal = new THREE.Vector3()
  private readonly turn = new THREE.Quaternion()
  private readonly p = new THREE.Vector3()
  private readonly t = new THREE.Vector3()
  private readonly n = new THREE.Vector3()
  private readonly ts: readonly number[]

  /**
   * `nodes`: nós de descanso (x, y, z seguidos); `ts`: parâmetro da curva de cada amostra (0 a 1);
   * `seed`: direção de referência da normal na primeira amostra.
   */
  constructor(nodes: Float32Array, ts: readonly number[], seed: Vec3 = [0, 0, 1]) {
    this.ts = ts
    this.points = Array.from({ length: nodes.length / 3 }, (_, i) => new THREE.Vector3().fromArray(nodes, i * 3))
    this.curve = new THREE.CatmullRomCurve3(this.points, false, 'centripetal')
    this.count = ts.length
    this.positions = new Float32Array(this.count * 3)
    this.tangents = new Float32Array(this.count * 3)
    this.normals = new Float32Array(this.count * 3)
    this.binormals = new Float32Array(this.count * 3)
    this.sample()
    this.restTangent.fromArray(this.tangents, 0)
    const reference = new THREE.Vector3(...seed)
    this.restNormal.copy(reference).addScaledVector(this.restTangent, -reference.dot(this.restTangent))
    if (this.restNormal.lengthSq() < 1e-8) this.restNormal.set(1, 0, 0).addScaledVector(this.restTangent, -this.restTangent.x)
    this.restNormal.normalize()
    this.frames()
  }

  /**
   * Segue os nós da cadeia. `rootTurn`: o quanto a pose de descanso foi girada de propósito (o braço livre
   * acenando gira em torno do ombro); a seção gira junto em vez de rolar em volta do braço.
   */
  update(nodes: Float32Array, rootTurn?: THREE.Quaternion): void {
    for (let i = 0; i < this.points.length; i++) this.points[i].fromArray(nodes, i * 3)
    if (rootTurn) this.rootTurn.copy(rootTurn)
    else this.rootTurn.identity()
    this.sample()
    this.frames()
  }

  private sample(): void {
    const { positions, tangents, count } = this
    for (let s = 0; s < count; s++) this.curve.getPoint(this.ts[s], this.p).toArray(positions, s * 3)
    // tangente por diferenças (central no meio, de um lado nas pontas)
    for (let s = 0; s < count; s++) {
      const a = Math.max(s - 1, 0) * 3
      const b = Math.min(s + 1, count - 1) * 3
      this.t.set(positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]).normalize()
      this.t.toArray(tangents, s * 3)
    }
  }

  /**
   * Normal da 1ª amostra: a de descanso girada pelo giro deliberado da raiz e, depois, pelo menor giro que
   * leva essa tangente à atual (sem torção extra); daí em diante, transporte paralelo (projeta a normal
   * anterior no plano da tangente). Só o menor giro não basta: num giro em z de uma raiz inclinada para fora
   * do plano ele não coincide com o giro em z, e a diferença vira uma torção em volta do braço.
   */
  private frames(): void {
    const { tangents, normals, binormals, count } = this
    this.rootTangent.copy(this.restTangent).applyQuaternion(this.rootTurn)
    this.rootNormal.copy(this.restNormal).applyQuaternion(this.rootTurn)
    this.t.fromArray(tangents, 0)
    this.n.copy(this.rootNormal).applyQuaternion(this.turn.setFromUnitVectors(this.rootTangent, this.t))
    for (let s = 0; s < count; s++) {
      this.t.fromArray(tangents, s * 3)
      this.n.addScaledVector(this.t, -this.n.dot(this.t)).normalize()
      this.n.toArray(normals, s * 3)
      this.p.crossVectors(this.t, this.n).toArray(binormals, s * 3)
    }
  }

  /** Posição da amostra `s` (a última é a ponta). */
  pointAt(s: number, target: THREE.Vector3): THREE.Vector3 {
    return target.fromArray(this.positions, s * 3)
  }
}

/** Amarração de uma malha à espinha: amostra mais próxima e deslocamento (t, n, b) de cada vértice. */
export interface SpineBinding {
  station: Uint16Array
  offsets: Float32Array
}

export function bindToSpine(positions: ArrayLike<number>, spine: FlexSpine): SpineBinding {
  const count = positions.length / 3
  const station = new Uint16Array(count)
  const offsets = new Float32Array(count * 3)
  const { positions: sp, tangents: st, normals: sn, binormals: sb } = spine
  for (let v = 0; v < count; v++) {
    const [x, y, z] = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]
    let best = 0
    let bestD = Infinity
    for (let s = 0; s < spine.count; s++) {
      const d = (x - sp[s * 3]) ** 2 + (y - sp[s * 3 + 1]) ** 2 + (z - sp[s * 3 + 2]) ** 2
      if (d < bestD) [best, bestD] = [s, d]
    }
    const o = best * 3
    const [dx, dy, dz] = [x - sp[o], y - sp[o + 1], z - sp[o + 2]]
    station[v] = best
    offsets[v * 3] = dx * st[o] + dy * st[o + 1] + dz * st[o + 2]
    offsets[v * 3 + 1] = dx * sn[o] + dy * sn[o + 1] + dz * sn[o + 2]
    offsets[v * 3 + 2] = dx * sb[o] + dy * sb[o + 1] + dz * sb[o + 2]
  }
  return { station, offsets }
}

/** Remonta os vértices amarrados no referencial atual da espinha (em `out`, x, y, z seguidos). */
export function deformAlongSpine({ station, offsets }: SpineBinding, spine: FlexSpine, out: Float32Array): void {
  const { positions: sp, tangents: st, normals: sn, binormals: sb } = spine
  for (let v = 0; v < station.length; v++) {
    const o = station[v] * 3
    const a = offsets[v * 3]
    const b = offsets[v * 3 + 1]
    const c = offsets[v * 3 + 2]
    out[v * 3] = sp[o] + a * st[o] + b * sn[o] + c * sb[o]
    out[v * 3 + 1] = sp[o + 1] + a * st[o + 1] + b * sn[o + 1] + c * sb[o + 1]
    out[v * 3 + 2] = sp[o + 2] + a * st[o + 2] + b * sn[o + 2] + c * sb[o + 2]
  }
}

/** Folga da esfera envolvente sobre o comprimento da cadeia (a Catmull-Rom pode passar um pouco dos nós). */
const BOUNDS_SLACK = 1.1

/**
 * Cadeia + espinha + malhas amarradas. As geometrias são da instância (clones): as posições mudam no lugar.
 * `step` simula e remonta; `pose` pula a física e põe a cadeia no descanso (movimento reduzido).
 */
export class FlexRod {
  readonly chain: VerletChain
  readonly spine: FlexSpine
  /** Giro deliberado da pose de descanso (ver FlexSpine.update); identidade nas peças que não acenam. */
  readonly rootTurn = new THREE.Quaternion()
  private readonly parts: { geometry: THREE.BufferGeometry; binding: SpineBinding }[]
  /** Nós e giro da raiz da última remontagem: se nada mexeu, não reenvia as malhas para a GPU. */
  private readonly synced: Float32Array
  private readonly syncedTurn = new THREE.Quaternion()

  constructor(points: readonly Vec3[], ts: readonly number[], geometries: THREE.BufferGeometry[], options: VerletOptions = {}) {
    this.chain = createChain(points, options)
    this.spine = new FlexSpine(this.chain.rest, ts)
    this.synced = this.chain.pos.slice()
    // Esfera envolvente garantida: a cadeia tem comprimento fixo e a raiz fica presa, então nada passa do
    // comprimento total (com folga para a curva) mais o maior afastamento de um vértice da espinha.
    const length = this.chain.lengths.reduce((sum, l) => sum + l, 0)
    const root = new THREE.Vector3().fromArray(this.chain.rest, 0)
    this.parts = geometries.map((geometry) => {
      const position = geometry.attributes.position as THREE.BufferAttribute
      position.setUsage(THREE.DynamicDrawUsage)
      const binding = bindToSpine(position.array, this.spine)
      let reach = 0
      for (let v = 0; v < binding.station.length; v++) {
        reach = Math.max(reach, Math.hypot(binding.offsets[v * 3], binding.offsets[v * 3 + 1], binding.offsets[v * 3 + 2]))
      }
      geometry.boundingSphere = new THREE.Sphere(root.clone(), length * BOUNDS_SLACK + reach)
      return { geometry, binding }
    })
  }

  step(dt: number, input: VerletInput): void {
    stepChain(this.chain, dt, input)
    this.sync()
  }

  /** Cadeia parada na pose de descanso (que pode ter andado, como no aceno). */
  pose(): void {
    this.chain.pos.set(this.chain.rest)
    this.chain.prev.set(this.chain.rest)
    this.sync()
  }

  /** Remonta as malhas a partir dos nós (só se algum nó mexeu desde a última vez). */
  sync(): void {
    const { pos } = this.chain
    let moved = Math.abs(this.rootTurn.dot(this.syncedTurn)) < 1 - 1e-9
    for (let i = 0; i < pos.length && !moved; i++) moved = Math.abs(pos[i] - this.synced[i]) > 1e-6
    if (!moved) return
    this.synced.set(pos)
    this.syncedTurn.copy(this.rootTurn)
    this.spine.update(pos, this.rootTurn)
    for (const { geometry, binding } of this.parts) {
      const position = geometry.attributes.position as THREE.BufferAttribute
      deformAlongSpine(binding, this.spine, position.array as Float32Array)
      position.needsUpdate = true
    }
  }

  /** Ponta (última amostra da espinha). */
  tip(target: THREE.Vector3): THREE.Vector3 {
    return this.spine.pointAt(this.spine.count - 1, target)
  }

  dispose(): void {
    for (const { geometry } of this.parts) geometry.dispose()
  }
}

export interface InertiaOptions {
  /** Multiplica a aceleração (em unidades locais/s²) antes da saturação. */
  gain: number
  /** Teto suave da aceleração linear (unidades locais/s²). */
  maxLinear: number
  /** Ganho e teto da aceleração angular (rad/s²). */
  angularGain: number
  maxAngular: number
  /** Constante de tempo do filtro (s): a derivada segunda de quadro a quadro é ruidosa. */
  smoothing?: number
  /**
   * Taxa (1/s) com que a orientação do referencial da câmera é seguida, como o ShipRig faz na escolta
   * (ESCORT_FOLLOW): a nave vive nesse referencial atrasado, então girar a câmera não a sacode.
   */
  follow?: number
  /**
   * Salto (teletransporte, troca de modo): deslocamento num quadro (unidades locais) acima disto E muito maior
   * que o do quadro anterior. Só o tamanho não serve: na viagem longa a nave anda dezenas de unidades por quadro.
   */
  jump?: number
}

/**
 * Sonda de inércia: lê a matriz de mundo de um objeto a cada quadro e devolve, no referencial LOCAL dele,
 * o que a cadeia sente: −a do referencial (linear) e a aceleração angular (para a força de Euler).
 *
 * Mede contra um referencial: o mundo (viagem, visita, volta: curva, freada, inclinação) ou, com `reference`,
 * a câmera com a orientação atrasada como a escolta a segue. Na escolta a nave é colocada em relação à
 * câmera: medir contra o mundo faria cada giro ou zoom da câmera sacudir os tentáculos como uma viagem.
 * Contra a câmera sobra só o que foi desenhado: flutuação, batida no vidro e a nave assentando no canto.
 * Trocar de referencial (ou um dt de quadro grande demais: aba em segundo plano) zera o histórico, sem tranco.
 *
 * O ganho exagera os movimentos pequenos (a flutuação) e a saturação suave segura os grandes (a viagem
 * cruza a galáxia em segundos: sem limite, os tentáculos se esticariam inteiros). A saturação é a garantia
 * de fato contra trancos; a detecção de salto (teletransporte) só evita gastá-la à toa.
 */
export class InertiaProbe {
  readonly input: { linear: [number, number, number]; angular: [number, number, number] } = {
    linear: [0, 0, 0],
    angular: [0, 0, 0],
  }
  private readonly position = new THREE.Vector3()
  private readonly lastPosition = new THREE.Vector3()
  private readonly velocity = new THREE.Vector3()
  private readonly lastVelocity = new THREE.Vector3()
  private readonly accel = new THREE.Vector3()
  private readonly quaternion = new THREE.Quaternion()
  private readonly lastQuaternion = new THREE.Quaternion()
  private readonly delta = new THREE.Quaternion()
  private readonly omega = new THREE.Vector3()
  private readonly lastOmega = new THREE.Vector3()
  private readonly alpha = new THREE.Vector3()
  private readonly scale = new THREE.Vector3()
  private readonly scratch = new THREE.Vector3()
  /** Referencial da câmera: posição dela e orientação atrasada (como a escolta). */
  private readonly refPosition = new THREE.Vector3()
  private readonly refQuaternion = new THREE.Quaternion()
  private readonly lagQuaternion = new THREE.Quaternion()
  private readonly relative = new THREE.Matrix4()
  /** Quadros seguidos com amostra válida (precisa de 2 para velocidade, 3 para aceleração). */
  private primed = 0
  /** Deslocamento do último quadro (unidades locais), para reconhecer um salto. */
  private lastMoved = 0
  /** Referencial da última amostra (mundo ou câmera): a troca zera o histórico. */
  private lastReference: 'world' | 'camera' = 'world'
  private readonly options: InertiaOptions

  constructor(options: InertiaOptions) {
    this.options = options
  }

  /** `reference`: a câmera (escolta) ou null (mundo). */
  sample(object: THREE.Object3D, rawDt: number, reference: THREE.Object3D | null = null): VerletInput {
    const { gain, maxLinear, angularGain, maxAngular, smoothing = 0.05, jump = 2, follow = ESCORT_FOLLOW } = this.options
    if (rawDt <= 0) return this.input
    const kind = reference ? 'camera' : 'world'
    // troca de referencial ou quadro longo demais: o que veio antes não serve para derivar nada
    if (kind !== this.lastReference || rawDt > MAX_FRAME_DT) this.reset()
    this.lastReference = kind
    const dt = Math.min(rawDt, MAX_FRAME_DT)

    if (reference) {
      reference.matrixWorld.decompose(this.refPosition, this.refQuaternion, this.scale)
      if (this.primed === 0) this.lagQuaternion.copy(this.refQuaternion)
      else this.lagQuaternion.slerp(this.refQuaternion, 1 - Math.exp(-follow * dt))
      this.scale.set(1, 1, 1)
      this.relative.compose(this.refPosition, this.lagQuaternion, this.scale).invert().multiply(object.matrixWorld)
      this.relative.decompose(this.position, this.quaternion, this.scale)
    } else {
      object.matrixWorld.decompose(this.position, this.quaternion, this.scale)
    }
    const unit = Math.abs(this.scale.x) || 1
    // salto: recomeça a estimativa daqui (o deslocamento dele vira a referência, para o quadro seguinte não ser outro)
    const moved = this.primed > 0 ? this.position.distanceTo(this.lastPosition) / unit : 0
    if (moved > jump && moved > JUMP_RATIO * this.lastMoved) this.primed = 0
    this.lastMoved = moved
    if (this.primed > 0) {
      this.velocity.subVectors(this.position, this.lastPosition).divideScalar(dt)
      // giro do quadro no referencial do corpo: q_antes⁻¹ · q_agora → ω local
      this.delta.copy(this.lastQuaternion).invert().multiply(this.quaternion)
      if (this.delta.w < 0) this.delta.set(-this.delta.x, -this.delta.y, -this.delta.z, -this.delta.w)
      const angle = 2 * Math.acos(Math.min(1, this.delta.w))
      const sin = Math.sqrt(Math.max(0, 1 - this.delta.w * this.delta.w))
      if (sin > 1e-6) this.omega.set(this.delta.x, this.delta.y, this.delta.z).multiplyScalar(angle / sin / dt)
      else this.omega.set(0, 0, 0)
    }
    const k = 1 - Math.exp(-dt / smoothing)
    if (this.primed > 1) {
      this.scratch.subVectors(this.velocity, this.lastVelocity).divideScalar(dt)
      this.accel.lerp(this.scratch, k)
      this.scratch.subVectors(this.omega, this.lastOmega).divideScalar(dt)
      this.alpha.lerp(this.scratch, k)
    } else {
      this.accel.set(0, 0, 0)
      this.alpha.set(0, 0, 0)
    }
    this.lastPosition.copy(this.position)
    this.lastQuaternion.copy(this.quaternion)
    this.lastVelocity.copy(this.velocity)
    this.lastOmega.copy(this.omega)
    this.primed = Math.min(this.primed + 1, 2)

    // linear: −a no referencial local (sem a escala do referencial), com ganho e saturação suave
    this.scratch.copy(this.accel).applyQuaternion(this.delta.copy(this.quaternion).invert()).multiplyScalar(-gain / unit)
    saturate(this.scratch, maxLinear).toArray(this.input.linear)
    saturate(this.scratch.copy(this.alpha).multiplyScalar(angularGain), maxAngular).toArray(this.input.angular)
    return this.input
  }

  /** Esquece o histórico (troca de referencial, quadro longo, volta do movimento reduzido). */
  reset(): void {
    this.primed = 0
    this.lastMoved = 0
    this.velocity.set(0, 0, 0)
    this.omega.set(0, 0, 0)
    this.accel.set(0, 0, 0)
    this.alpha.set(0, 0, 0)
    this.input.linear.fill(0)
    this.input.angular.fill(0)
  }
}

/**
 * Inércia no referencial do piloto: o ganho deixa a flutuação visível e a saturação segura a viagem
 * (unidades do piloto/s² e rad/s²).
 */
export const PILOT_INERTIA: InertiaOptions = { gain: 15, maxLinear: 16, angularGain: 3, maxAngular: 5 }

/**
 * Modos em que o ShipRig põe a nave em relação à câmera: descendo até o canto, escolta, batida no vidro e a visita em
 * primeiro plano (presa à câmera atrasada; girar a câmera em volta do planeta não pode sacudir os tentáculos).
 */
const CAMERA_ANCHORED: ReadonlySet<ShipMode> = new Set(['entering', 'escort', 'visiting'])

/** Contra o que a inércia é medida em cada modo (a troca recomeça a sonda, sem tranco). */
export function inertiaFrameFor(mode: ShipMode): 'camera' | 'world' {
  return CAMERA_ANCHORED.has(mode) ? 'camera' : 'world'
}

/** Referencial da inércia: `auto` segue o modo da nave (shipPose); `world` sempre o mundo (preview). */
export type InertiaFrame = 'auto' | 'world'

/**
 * Sonda de inércia ligada à cena: em `auto`, mede contra a câmera quando o ShipRig ancora a nave nela
 * (escolta, entrada, visita) e contra o mundo no resto. Zera o histórico quando o referencial troca (na sonda), quando
 * o destino muda (a viagem recomeça de outro jeito) e quando a tela muda de tamanho (a escolta muda de canto).
 * O objeto devolvido é estável enquanto câmera, modo e sonda não mudam.
 */
export function useInertiaProbe(options: InertiaOptions, frame: InertiaFrame = 'auto') {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const probe = useMemo(() => new InertiaProbe(options), [options])
  useEffect(() => probe.reset(), [probe, size])
  return useMemo(() => {
    const last = { target: shipPose.target }
    return {
      sample: (object: THREE.Object3D, dt: number) => {
        if (shipPose.target !== last.target) {
          last.target = shipPose.target
          probe.reset()
        }
        return probe.sample(object, dt, frame === 'auto' && inertiaFrameFor(shipPose.mode) === 'camera' ? camera : null)
      },
      reset: () => probe.reset(),
    }
  }, [probe, camera, frame])
}

/** Quantas vezes o deslocamento do quadro anterior conta como salto. */
const JUMP_RATIO = 8

/** m ↦ max·m/(max + m): linear para valores pequenos, tende a `max` nos grandes. */
function saturate(v: THREE.Vector3, max: number): THREE.Vector3 {
  const m = v.length()
  return m > 0 ? v.multiplyScalar(max / (max + m)) : v
}
