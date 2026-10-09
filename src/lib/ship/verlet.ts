/**
 * Movimento secundário por integração de Verlet (posição), para os tentáculos do piloto e a antena da nave.
 *
 * Uma cadeia de nós ligados por restrições de distância, com alguns nós presos (a raiz, e no braço do
 * manche também a ponta) e uma mola que puxa cada nó de volta à pose de descanso: a forma desenhada se
 * mantém e o movimento só balança em volta dela. Tudo no referencial do pai (o do piloto ou o da nave);
 * a inércia entra como aceleração de fora (−a do referencial) e aceleração angular (força de Euler).
 *
 * Passo fixo com acumulador (o resultado não depende da taxa de quadros) e dt de quadro limitado (uma aba
 * que volta do segundo plano não explode a simulação). Estado em Float32Array, sem alocar por passo.
 * Puro (sem Three.js), imports relativos.
 */

export type Vec3Tuple = readonly [number, number, number]

export interface VerletOptions {
  /** Passo fixo da integração (s). */
  step?: number
  /** Maior dt de quadro aceito (s): o que passar disso é descartado. */
  maxFrame?: number
  /** Amortecimento (1/s): a velocidade cai por exp(−damping·h) a cada passo. */
  damping?: number
  /** Rigidez da mola de descanso (1/s², ω² do nó) na raiz… */
  stiffness?: number
  /** …e na ponta (interpolada ao longo da cadeia). Padrão: igual à da raiz. */
  tipStiffness?: number
  /** Iterações das restrições de distância por passo. */
  iterations?: number
  /** Gravidade opcional, no referencial da cadeia. */
  gravity?: Vec3Tuple
  /** Nós presos na pose de descanso. Padrão: só a raiz. */
  pinned?: readonly number[]
}

export interface VerletChain {
  readonly count: number
  /** Posições atuais, anteriores e de descanso (x, y, z por nó). */
  readonly pos: Float32Array
  readonly prev: Float32Array
  readonly rest: Float32Array
  /** Comprimento de descanso de cada segmento (count − 1). */
  readonly lengths: Float32Array
  /** 1 nos nós presos. */
  readonly pinned: Uint8Array
  /** Rigidez da mola de descanso por nó (1/s²). */
  readonly stiffness: Float32Array
  readonly gravity: Float32Array
  readonly step: number
  readonly maxFrame: number
  readonly maxSubsteps: number
  readonly iterations: number
  /** Fator de velocidade por passo: exp(−damping·step). */
  readonly keep: number
  /** Tempo acumulado ainda não simulado (s). */
  accumulator: number
}

/** Entrada de inércia de um quadro, no referencial da cadeia. */
export interface VerletInput {
  /** Aceleração uniforme de fora (ex.: −a do referencial), em unidades/s². */
  linear: Vec3Tuple
  /** Aceleração angular do referencial (rad/s²): cada nó sente −α × p (força de Euler, em torno da origem). */
  angular: Vec3Tuple
}

export const VERLET_DEFAULTS = {
  step: 1 / 120,
  maxFrame: 0.1,
  damping: 4,
  stiffness: 120,
  iterations: 6,
} as const

/** Folga para o acumulador: 1/30 tem que dar exatamente 4 passos de 1/120, mesmo com arredondamento. */
const EPSILON = 1e-9

export function createChain(points: readonly Vec3Tuple[], options: VerletOptions = {}): VerletChain {
  const count = points.length
  if (count < 2) throw new Error('a cadeia precisa de pelo menos 2 nós')
  const step = options.step ?? VERLET_DEFAULTS.step
  const maxFrame = options.maxFrame ?? VERLET_DEFAULTS.maxFrame
  const rootK = options.stiffness ?? VERLET_DEFAULTS.stiffness
  const tipK = options.tipStiffness ?? rootK
  const rest = new Float32Array(count * 3)
  points.forEach(([x, y, z], i) => rest.set([x, y, z], i * 3))
  const lengths = new Float32Array(count - 1)
  for (let i = 0; i < count - 1; i++) lengths[i] = distance(rest, i, rest, i + 1)
  const pinned = new Uint8Array(count)
  for (const i of options.pinned ?? [0]) pinned[i] = 1
  const stiffness = new Float32Array(count)
  for (let i = 0; i < count; i++) stiffness[i] = rootK + (tipK - rootK) * (i / (count - 1))
  return {
    count,
    pos: rest.slice(),
    prev: rest.slice(),
    rest,
    lengths,
    pinned,
    stiffness,
    gravity: new Float32Array(options.gravity ?? [0, 0, 0]),
    step,
    maxFrame,
    maxSubsteps: Math.ceil(maxFrame / step - EPSILON),
    iterations: options.iterations ?? VERLET_DEFAULTS.iterations,
    keep: Math.exp(-(options.damping ?? VERLET_DEFAULTS.damping) * step),
    accumulator: 0,
  }
}

/** Move a pose de descanso de um nó (o aceno do braço livre). Um nó preso vai junto no próximo passo. */
export function setRest(chain: VerletChain, i: number, x: number, y: number, z: number): void {
  chain.rest[i * 3] = x
  chain.rest[i * 3 + 1] = y
  chain.rest[i * 3 + 2] = z
}

/** Volta à pose de descanso, parada. */
export function resetChain(chain: VerletChain): void {
  chain.pos.set(chain.rest)
  chain.prev.set(chain.rest)
  chain.accumulator = 0
}

/** Soma uma velocidade (unidades/s) aos nós soltos: um tranco. */
export function applyImpulse(chain: VerletChain, vx: number, vy: number, vz: number): void {
  const { prev, pinned, step } = chain
  for (let i = 0; i < chain.count; i++) {
    if (pinned[i]) continue
    // Verlet guarda a velocidade como (pos − prev)/h: recuar o anterior acelera o nó
    prev[i * 3] -= vx * step
    prev[i * 3 + 1] -= vy * step
    prev[i * 3 + 2] -= vz * step
  }
}

/**
 * Gira os nós soltos (posição atual e anterior) pela matriz 3×3 `m` (coluna a coluna, como Matrix3.elements):
 * o referencial girou e os nós, por inércia, ficaram onde estavam no mundo.
 */
export function rotateChain(chain: VerletChain, m: ArrayLike<number>): void {
  rotateBuffer(chain, chain.pos, m)
  rotateBuffer(chain, chain.prev, m)
}

function rotateBuffer(chain: VerletChain, buffer: Float32Array, m: ArrayLike<number>): void {
  for (let i = 0; i < chain.count; i++) {
    if (chain.pinned[i]) continue
    const o = i * 3
    const x = buffer[o]
    const y = buffer[o + 1]
    const z = buffer[o + 2]
    buffer[o] = m[0] * x + m[3] * y + m[6] * z
    buffer[o + 1] = m[1] * x + m[4] * y + m[7] * z
    buffer[o + 2] = m[2] * x + m[5] * y + m[8] * z
  }
}

/**
 * Avança a simulação `dt` segundos (limitado a maxFrame) em passos fixos. A entrada vale para o quadro todo.
 * Devolve quantos passos deu; o que sobrar fica no acumulador para o próximo quadro.
 */
export function stepChain(chain: VerletChain, dt: number, input: VerletInput): number {
  chain.accumulator += Math.min(Math.max(dt, 0), chain.maxFrame)
  let steps = 0
  while (chain.accumulator >= chain.step - EPSILON && steps < chain.maxSubsteps) {
    chain.accumulator -= chain.step
    integrate(chain, input)
    solveConstraints(chain)
    steps++
  }
  if (steps === chain.maxSubsteps) chain.accumulator = Math.min(chain.accumulator, chain.step)
  return steps
}

function integrate(chain: VerletChain, { linear, angular }: VerletInput): void {
  const { pos, prev, rest, pinned, stiffness, gravity, keep, step } = chain
  const h2 = step * step
  const ax = linear[0]
  const ay = linear[1]
  const az = linear[2]
  const wx = angular[0]
  const wy = angular[1]
  const wz = angular[2]
  for (let i = 0; i < chain.count; i++) {
    const o = i * 3
    if (pinned[i]) {
      pos[o] = prev[o] = rest[o]
      pos[o + 1] = prev[o + 1] = rest[o + 1]
      pos[o + 2] = prev[o + 2] = rest[o + 2]
      continue
    }
    const x = pos[o]
    const y = pos[o + 1]
    const z = pos[o + 2]
    const k = stiffness[i]
    // mola de descanso + gravidade + inércia linear − α × p
    const fx = k * (rest[o] - x) + gravity[0] + ax - (wy * z - wz * y)
    const fy = k * (rest[o + 1] - y) + gravity[1] + ay - (wz * x - wx * z)
    const fz = k * (rest[o + 2] - z) + gravity[2] + az - (wx * y - wy * x)
    pos[o] = x + (x - prev[o]) * keep + fx * h2
    pos[o + 1] = y + (y - prev[o + 1]) * keep + fy * h2
    pos[o + 2] = z + (z - prev[o + 2]) * keep + fz * h2
    prev[o] = x
    prev[o + 1] = y
    prev[o + 2] = z
  }
}

function solveConstraints(chain: VerletChain): void {
  const { pos, pinned, lengths } = chain
  for (let it = 0; it < chain.iterations; it++) {
    for (let i = 0; i < chain.count - 1; i++) {
      const wa = pinned[i] ? 0 : 1
      const wb = pinned[i + 1] ? 0 : 1
      if (wa + wb === 0) continue
      const a = i * 3
      const b = a + 3
      const dx = pos[b] - pos[a]
      const dy = pos[b + 1] - pos[a + 1]
      const dz = pos[b + 2] - pos[a + 2]
      const d = Math.hypot(dx, dy, dz)
      if (d < 1e-9) continue
      const k = (d - lengths[i]) / d / (wa + wb)
      pos[a] += dx * k * wa
      pos[a + 1] += dy * k * wa
      pos[a + 2] += dz * k * wa
      pos[b] -= dx * k * wb
      pos[b + 1] -= dy * k * wb
      pos[b + 2] -= dz * k * wb
    }
  }
}

function distance(a: Float32Array, i: number, b: Float32Array, j: number): number {
  return Math.hypot(a[i * 3] - b[j * 3], a[i * 3 + 1] - b[j * 3 + 1], a[i * 3 + 2] - b[j * 3 + 2])
}

/** Comprimento atual do segmento i (de `buffer`, por padrão a posição atual). */
export function segmentLength(chain: VerletChain, i: number, buffer: Float32Array = chain.pos): number {
  return distance(buffer, i, buffer, i + 1)
}

/** Maior distância de um nó à sua pose de descanso. */
export function maxRestDistance(chain: VerletChain): number {
  let max = 0
  for (let i = 0; i < chain.count; i++) max = Math.max(max, distance(chain.pos, i, chain.rest, i))
  return max
}
