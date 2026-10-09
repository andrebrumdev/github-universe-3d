import type { Language, RepoBase } from '../types'
import { orbitPosition, type Vec3 } from './orbits'
import { seededRandom } from './random'

export const MIN_PLANET_RADIUS = 0.45
export const MAX_PLANET_RADIUS = 3.0
/**
 * Peso de referência quando o maior peso do perfil não é informado (escala absoluta).
 * Com `maxWeight` do próprio perfil, o maior repo sempre ganha MAX_PLANET_RADIUS.
 */
export const REFERENCE_PLANET_WEIGHT = 1000
/** Expoente da curva sobre a escala log: >1 abre a diferença entre os repos do topo. */
const RADIUS_CURVE = 2
export const MAX_MOONS = 6
const DAY_MS = 86_400_000

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Popularidade de um repo: stars + 2·forks. */
export function planetWeight(stars: number, forks: number): number {
  return Math.max(0, stars + 2 * forks)
}

/** Maior peso do perfil; é o que vira o planeta de raio máximo. */
export function maxPlanetWeight(repos: { stars: number; forks: number }[]): number {
  return repos.reduce((max, r) => Math.max(max, planetWeight(r.stars, r.forks)), 0)
}

/**
 * Raio relativo ao próprio perfil: escala log normalizada pelo maior repo (0..1), elevada a RADIUS_CURVE.
 * O maior repo ganha MAX_PLANET_RADIUS; repos sem atividade ganham MIN_PLANET_RADIUS.
 */
export function planetRadius(stars: number, forks: number, maxWeight: number = REFERENCE_PLANET_WEIGHT): number {
  if (maxWeight <= 0) return MIN_PLANET_RADIUS
  const x = clamp(Math.log1p(planetWeight(stars, forks)) / Math.log1p(maxWeight), 0, 1)
  return MIN_PLANET_RADIUS + (MAX_PLANET_RADIUS - MIN_PLANET_RADIUS) * Math.pow(x, RADIUS_CURVE)
}

export function planetScore(repo: Pick<RepoBase, 'stars' | 'pushedAt'>, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - new Date(repo.pushedAt).getTime()) / DAY_MS)
  return Math.log10(1 + repo.stars) + 1.5 * Math.exp(-ageDays / 180)
}

export function rankRepos<T extends Pick<RepoBase, 'name' | 'stars' | 'pushedAt'>>(repos: T[], now: Date): T[] {
  return [...repos].sort((a, b) => planetScore(b, now) - planetScore(a, now) || a.name.localeCompare(b.name))
}

export interface MoonSpec {
  language: string
  color: string
  radius: number
  /** semieixo maior em volta do planeta */
  a: number
  /** excentricidade (MIN_MOON_ECCENTRICITY..MAX_MOON_ECCENTRICITY) */
  e: number
  /** inclinação sobre o equador do planeta */
  inclination: number
  /** longitude do nó ascendente Ω */
  node: number
  /** argumento do periapse ω */
  periapsis: number
  /** segundos de simulação por volta (3ª lei de Kepler em volta do planeta) */
  period: number
  /** anomalia média em t = 0 */
  phase: number
}

export const MIN_MOON_RADIUS = 0.12
export const MAX_MOON_RADIUS = 0.35
export const MIN_MOON_ECCENTRICITY = 0.02
export const MAX_MOON_ECCENTRICITY = 0.12
/**
 * Maior afastamento radial (a·e) pedido a uma lua: as internas, de semieixo pequeno, chegam a e = 0,12; as de fora,
 * de semieixo grande, ficam perto de e = 0,02. Assim a folga entre as cascas não explode o alcance do planeta.
 */
const MOON_EXCURSION = 0.1
/**
 * Periapse da 1ª lua: MOON_ORBIT_SCALE·r + MOON_ORBIT_OFFSET (a superfície da maior lua fica ≥ 0,05 do planeta). Era
 * 1,1·r + 0,4; com a ressonância 1:2:3… as luas de fora saem da 3ª lei, e a interna mais perto compacta o sistema.
 */
const MOON_ORBIT_SCALE = 1.0
const MOON_ORBIT_OFFSET = 0.5
/** Folga entre a apoapse de uma lua e a periapse da seguinte, além dos dois raios máximos de lua. */
const MOON_GAP = 0.05
/** T = MOON_PERIOD_SCALE·(a/r)^1,5: massa do planeta ∝ r³; a lua interna de um planeta médio leva ~11 s. */
const MOON_PERIOD_SCALE = 7
const MOON_MIN_INCLINATION = 2 * (Math.PI / 180)
const MOON_MAX_INCLINATION = 8 * (Math.PI / 180)

/** Maior excentricidade permitida a uma lua de semieixo a. */
function moonEccentricityCap(a: number): number {
  return clamp(MOON_EXCURSION / a, MIN_MOON_ECCENTRICITY, MAX_MOON_ECCENTRICITY)
}

/** Menor a cuja periapse, com a excentricidade máxima permitida, fica em `peri` (a − a·e é crescente em a). */
function semiMajorForPeriapsis(peri: number): number {
  const steep = peri / (1 - MAX_MOON_ECCENTRICITY)
  if (steep <= MOON_EXCURSION / MAX_MOON_ECCENTRICITY) return steep
  const mid = peri + MOON_EXCURSION
  if (mid <= MOON_EXCURSION / MIN_MOON_ECCENTRICITY) return mid
  return peri / (1 - MIN_MOON_ECCENTRICITY)
}

/**
 * Ressonância orbital das luas: o período de cada lua é um múltiplo inteiro do da lua interna, em razões consecutivas
 * 1:2:3:4:5:6 — cada par de vizinhas fica em (p+1):p (2:1, 3:2, 4:3…), como os exemplos do usuário. A cadeia de Laplace
 * pura (1:2:4:8…) foi descartada: a 3ª lei põe a última lua a N^(2/3) da interna (24^(2/3) ≈ 8,3 contra 6^(2/3) ≈ 3,3)
 * e o sistema inteiro crescia demais. O desenho todo se repete a cada MMC(razões)·T₀ (60·T₀ com 6 luas); cada par de
 * vizinhas se encontra a cada período sinódico p(p+1)·T₀, sempre no mesmo lugar.
 */
/** Razões dos períodos das `n` luas de um planeta ao da lua interna: 1, 2, …, n. */
export function moonResonance(n: number): number[] {
  return Array.from({ length: Math.min(MAX_MOONS, Math.max(0, Math.floor(n))) }, (_, k) => k + 1)
}

/** As cascas com a lua interna em a0: aₖ = a0·Nₖ^(2/3) (3ª lei de Kepler, T ∝ a^1,5) e a excentricidade máxima de cada. */
function resonantShells(a0: number, chain: number[]): { a: number; eMax: number }[] {
  return chain.map((ratio) => {
    const a = a0 * Math.pow(ratio, 2 / 3)
    return { a, eMax: moonEccentricityCap(a) }
  })
}

/** A periapse de cada lua fica além da apoapse da anterior, com dois raios máximos de lua e folga. */
function shellsApart(shells: { a: number; eMax: number }[]): boolean {
  for (let i = 1; i < shells.length; i++) {
    const prev = shells[i - 1]
    const cur = shells[i]
    if (cur.a * (1 - cur.eMax) < prev.a * (1 + prev.eMax) + 2 * MAX_MOON_RADIUS + MOON_GAP) return false
  }
  return true
}

/**
 * Cascas das luas, em ressonância: a lua interna fica o mais perto que a superfície do planeta deixa, e as outras saem
 * da 3ª lei com as razões de `moonResonance`. Cada periapse fica além da apoapse anterior com dois raios máximos de
 * lua e folga (cascas radiais disjuntas: nenhuma lua encosta noutra, em qualquer inclinação ou fase). Num planeta
 * pequeno os passos de fora (6:5 é o mais apertado) ficariam justos demais: em vez de quebrar a cadeia, a lua interna se
 * afasta (a folga cresce com a0) até caber, por bissecção. Depende só do raio do planeta (o alcance não precisa do nome).
 */
function moonShells(planetR: number, n: number): { a: number; eMax: number }[] {
  const chain = moonResonance(n)
  if (chain.length === 0) return []
  let lo = semiMajorForPeriapsis(MOON_ORBIT_SCALE * planetR + MOON_ORBIT_OFFSET)
  if (shellsApart(resonantShells(lo, chain))) return resonantShells(lo, chain)
  let hi = lo * 2
  while (!shellsApart(resonantShells(hi, chain))) hi *= 2
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (shellsApart(resonantShells(mid, chain))) hi = mid
    else lo = mid
  }
  return resonantShells(hi, chain)
}

/** Período (s de simulação) pela 3ª lei de Kepler em volta de um planeta de raio r (massa ∝ r³). */
export function moonPeriod(a: number, planetR: number): number {
  return MOON_PERIOD_SCALE * Math.pow(a / planetR, 1.5)
}

/**
 * Alcance do planeta com as luas (distância máxima ao centro do planeta): a apoapse mais externa possível mais o
 * maior raio de lua; sem luas, o próprio raio. É o que o espaçamento das órbitas reserva para cada corpo.
 */
export function bodyExtent(planetR: number, moonCount: number): number {
  const n = Math.min(MAX_MOONS, Math.max(0, Math.floor(moonCount)))
  if (n === 0) return planetR
  const last = moonShells(planetR, n)[n - 1]
  return last.a * (1 + last.eMax) + MAX_MOON_RADIUS
}

/**
 * `languages` deve vir ordenado por bytes (decrescente), como sai do normalize. `seed` (o nome do repo) varia a órbita.
 * Períodos em ressonância (ver `moonResonance`): Tₖ = Nₖ·T₀ exatamente, com T₀ o da lua interna pela 3ª lei.
 * Fases travadas pela longitude média λ = Ω + ω + M: em t = 0 todas as luas ficam alinhadas num lado λ* (sorteado por
 * planeta). Como Nᵢ·λᵢ − Nⱼ·λⱼ não muda no tempo, o alinhamento total volta a cada MMC·T₀ e cada par de vizinhas se
 * encontra de novo em λ* a cada período sinódico p(p+1)·T₀.
 */
export function moonOrbits(planetR: number, languages: Language[], seed = ''): MoonSpec[] {
  const langs = languages.slice(0, MAX_MOONS)
  if (langs.length === 0) return []
  const maxBytes = Math.max(...langs.map((l) => l.bytes), 1)
  const n = langs.length
  const shells = moonShells(planetR, n)
  const chain = moonResonance(n)
  const innerPeriod = moonPeriod(shells[0].a, planetR)
  const side = seededRandom(`moons-${seed}`)() * Math.PI * 2
  return langs.map((l, i) => {
    const rng = seededRandom(`moon-${seed}-${i}`)
    const { a, eMax } = shells[i]
    const e = MIN_MOON_ECCENTRICITY + rng() * (eMax - MIN_MOON_ECCENTRICITY)
    const inclination = (rng() < 0.5 ? -1 : 1) * (MOON_MIN_INCLINATION + rng() * (MOON_MAX_INCLINATION - MOON_MIN_INCLINATION))
    const node = rng() * Math.PI * 2
    const periapsis = rng() * Math.PI * 2
    return {
      language: l.name,
      color: l.color,
      radius: MIN_MOON_RADIUS + (MAX_MOON_RADIUS - MIN_MOON_RADIUS) * Math.sqrt(l.bytes / maxBytes),
      a,
      e,
      inclination,
      node,
      periapsis,
      period: innerPeriod * chain[i],
      // M em t = 0 que põe a lua na longitude média do alinhamento
      phase: side - node - periapsis,
    }
  })
}

/** Longitude média λ = Ω + ω + M da lua no instante t (rad, sem levar a [0, 2π)): o ângulo que as ressonâncias travam. */
export function moonLongitude(m: MoonSpec, t: number): number {
  return m.node + m.periapsis + m.phase + (2 * Math.PI * t) / m.period
}

/**
 * Posição da lua no referencial do planeta (y = eixo de rotação) no instante t, pelo solver de Kepler: rápida perto
 * do periapse, lenta perto da apoapse. Com `out`, escreve nele em vez de alocar.
 */
export function moonPosition(m: MoonSpec, t: number, out?: Vec3): Vec3 {
  return orbitPosition(m, m.phase + (2 * Math.PI * t) / m.period, out)
}

export function languageShares(langs: Language[]): (Language & { share: number })[] {
  const total = langs.reduce((sum, l) => sum + l.bytes, 0)
  if (total === 0) return []
  return langs.map((l) => ({ ...l, share: (l.bytes / total) * 100 }))
}

/**
 * Orientação do planeta por ângulos de Euler, aplicados nesta ordem (grupos aninhados no Planet):
 * 1. precessão ψ(t) em torno do y do sistema (normal da eclíptica);
 * 2. obliquidade θ(t) em torno de z, com nutação: θ(t) = θ₀ + Δθ·sin(ν·t + δ);
 * 3. rotação própria φ(t) em torno do y local (o eixo de rotação).
 */
export interface PlanetSpin {
  /** Obliquidade média θ₀ (inclinação do eixo), rad. */
  obliquity: number
  /** Rotação própria, rad por segundo de simulação (negativa = retrógrada). */
  spinSpeed: number
  /** Precessão do eixo em torno de y, rad por segundo de simulação; sentido oposto ao da rotação própria. */
  precessionSpeed: number
  /** Ângulo de precessão em t = 0, rad. */
  precessionPhase: number
  /** Amplitude da nutação Δθ, rad. */
  nutationAmplitude: number
  /** Frequência da nutação ν (3–5× |precessão|), rad por segundo de simulação. */
  nutationSpeed: number
  /** Fase da nutação δ em t = 0, rad. */
  nutationPhase: number
}

const DEG = Math.PI / 180

export function planetSpin(name: string): PlanetSpin {
  const rng = seededRandom(`spin-${name}`)
  const spinSpeed = (0.25 + rng() * 0.35) * (rng() < 0.15 ? -1 : 1)
  const precession = 0.12 + rng() * 0.18
  return {
    obliquity: (10 + rng() * 35) * DEG,
    spinSpeed,
    // Precessão por torque é retrógrada em relação ao giro (como a da Terra).
    precessionSpeed: -Math.sign(spinSpeed) * precession,
    precessionPhase: rng() * Math.PI * 2,
    nutationAmplitude: (2 + rng()) * DEG,
    nutationSpeed: precession * (3 + rng() * 2),
    nutationPhase: rng() * Math.PI * 2,
  }
}

export interface AxisAngles {
  /** ψ: rotação em y do sistema. */
  precession: number
  /** θ: rotação em z, já com nutação. */
  obliquity: number
  /** φ: rotação em y local. */
  spin: number
}

/** Ângulos de Euler do planeta no instante t (segundos de simulação). */
export function axisAngles(s: PlanetSpin, t: number): AxisAngles {
  return {
    precession: s.precessionPhase + s.precessionSpeed * t,
    obliquity: s.obliquity + s.nutationAmplitude * Math.sin(s.nutationSpeed * t + s.nutationPhase),
    spin: s.spinSpeed * t,
  }
}

/** Rotação extra do planeta em foco (rad por segundo real): uma volta em ~42 s, para ver todos os lados. */
export const FOCUS_SPIN_RATE = 0.15
const FOCUS_SPIN_MAX_DT = 0.1

/**
 * Avança o ângulo extra de rotação própria do planeta em foco. Com o relógio da simulação parando (escala → 0), a
 * rotação "normal" congela; esta entra no lugar, na medida em que a escala cai. Fora de foco (ou com movimento
 * reduzido) o ângulo fica onde está: nada salta quando o foco sai.
 */
export function focusSpinStep(angle: number, dt: number, focused: boolean, clockScale: number, reduced = false): number {
  if (!focused || reduced) return angle
  const step = Math.min(Math.max(dt, 0), FOCUS_SPIN_MAX_DT)
  const blend = 1 - Math.min(Math.max(clockScale, 0), 1)
  return angle + FOCUS_SPIN_RATE * blend * step
}

/** Segundos de simulação por segundo real que as luas do planeta em foco seguem andando (~35% do normal). */
export const FOCUS_MOON_RATE = 0.35

/** Tempo extra das luas do planeta em foco: mesma entrada gradual e as mesmas regras do `focusSpinStep`. */
export function focusMoonStep(extra: number, dt: number, focused: boolean, clockScale: number, reduced = false): number {
  if (!focused || reduced) return extra
  const step = Math.min(Math.max(dt, 0), FOCUS_SPIN_MAX_DT)
  const blend = 1 - Math.min(Math.max(clockScale, 0), 1)
  return extra + FOCUS_MOON_RATE * blend * step
}
