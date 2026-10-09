/**
 * Chuva de estrelas do modo disco: pool fixo de meteoros (arrays tipados, nada alocado por quadro). As posições são no
 * céu visto pela câmera, em unidades da tela: x e y de −1 a 1 na altura (x vai até ±aspecto), y para cima. O componente
 * (MeteorRain) leva cada meteoro para o mundo a uma distância fixa da câmera: cruzam o céu de onde quer que se olhe.
 */

/** Teto de meteoros acesos ao mesmo tempo. */
export const METEOR_CAP = 60
/** Maior passo aceito (s): um quadro longo não despeja uma rajada. */
const MAX_STEP = 0.1

export interface MeteorPool {
  cap: number
  /** 1 = aceso. */
  active: Uint8Array
  age: Float32Array
  life: Float32Array
  /** Cabeça no nascimento e velocidade (unidades da tela por s). */
  x: Float32Array
  y: Float32Array
  vx: Float32Array
  vy: Float32Array
  /** Comprimento do rastro (unidades da tela). */
  length: Float32Array
  /** 0 (longe, fino e fraco) a 1 (perto, grosso e claro). */
  depth: Float32Array
  /** Acesos agora. */
  count: number
  /** Fração de meteoro acumulada para o próximo nascimento. */
  budget: number
  /** Nascidos desde o começo. */
  spawned: number
}

export function newMeteorPool(cap = METEOR_CAP): MeteorPool {
  return {
    cap,
    active: new Uint8Array(cap),
    age: new Float32Array(cap),
    life: new Float32Array(cap),
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    vx: new Float32Array(cap),
    vy: new Float32Array(cap),
    length: new Float32Array(cap),
    depth: new Float32Array(cap),
    count: 0,
    budget: 0,
    spawned: 0,
  }
}

/** Direção da chuva: de cima à direita para baixo à esquerda (rad, a partir de +x), com um pouco de variação. */
const HEADING = (-145 * Math.PI) / 180
const HEADING_JITTER = (12 * Math.PI) / 180

/**
 * Acende um meteoro numa vaga livre; devolve o índice, ou −1 com o pool cheio. `aspect` (largura/altura da tela)
 * espalha os nascimentos pela largura que se vê (no celular em pé ela é estreita).
 */
export function spawnMeteor(pool: MeteorPool, rng: () => number, aspect = 1.6): number {
  if (pool.count >= pool.cap) return -1
  let k = 0
  while (k < pool.cap && pool.active[k]) k++
  if (k === pool.cap) return -1
  const depth = rng()
  const angle = HEADING + (rng() * 2 - 1) * HEADING_JITTER
  const speed = 1.3 + rng() * 1.1
  pool.active[k] = 1
  pool.age[k] = 0
  pool.life[k] = 0.6 + rng() * 0.6
  // nasce na metade de cima e mais para a direita (vem caindo para baixo e para a esquerda)
  pool.x[k] = aspect * (-0.4 + rng() * 1.5)
  pool.y[k] = 0.1 + rng() * 1.1
  pool.vx[k] = Math.cos(angle) * speed
  pool.vy[k] = Math.sin(angle) * speed
  pool.length[k] = 0.18 + 0.22 * depth + rng() * 0.08
  pool.depth[k] = depth
  pool.count++
  pool.spawned++
  return k
}

/** Envelhece, apaga quem passou da vida e acende `rate` meteoros por segundo (a vaga apagada volta para o pool). */
export function stepMeteors(pool: MeteorPool, dt: number, rate: number, rng: () => number, aspect = 1.6): void {
  const step = Math.min(Math.max(dt, 0), MAX_STEP)
  for (let k = 0; k < pool.cap; k++) {
    if (!pool.active[k]) continue
    pool.age[k] += step
    if (pool.age[k] >= pool.life[k]) {
      pool.active[k] = 0
      pool.count--
    }
  }
  pool.budget += Math.max(0, rate) * step
  while (pool.budget >= 1) {
    pool.budget -= 1
    if (spawnMeteor(pool, rng, aspect) < 0) {
      // cheio: o que sobrou do orçamento não vira fila
      pool.budget = 0
      break
    }
  }
}

/** Brilho ao longo da vida: acende rápido (10% da vida), fica e apaga no último terço. */
export function meteorFade(age: number, life: number): number {
  if (!(life > 0) || age <= 0 || age >= life) return 0
  const u = age / life
  if (u < 0.1) return Math.sin((u / 0.1) * (Math.PI / 2))
  if (u > 2 / 3) return (1 - u) * 3
  return 1
}
