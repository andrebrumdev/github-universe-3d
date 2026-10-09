import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../universe/random'
import { MAX_PITCH } from './faceSpring'
import {
  ADMIRE_DWELL,
  AWAKE_DWELL,
  DREAM_DWELL,
  DWELL,
  dwellFor,
  GAZE_AT_START,
  gazeExpression,
  headOffset,
  limitTurn,
  MAX_TURN_AWAY,
  pickGaze,
  planetGazeWeight,
  quantizePupil,
  SACCADE,
  stepGaze,
  TRAVEL_GLANCE,
  WANDER,
  wakesUp,
  type GazeInput,
  type GazeState,
} from './gaze'

const PLANETS = [
  { name: 'big', weight: 3 },
  { name: 'mid', weight: 1.5 },
  { name: 'tiny', weight: 0.2 },
]
const calm: GazeInput = {
  mode: 'idle',
  pointer: true,
  shipTraveling: false,
  focusPlanet: null,
  selectedPlanet: null,
  planets: PLANETS,
  reduced: false,
}
const DT = 1 / 30

function run(input: GazeInput, seconds: number, seed = 7, dt = DT, start: GazeState = GAZE_AT_START) {
  const rng = mulberry32(seed)
  const trace: GazeState[] = []
  let s = start
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    s = stepGaze(s, input, dt, rng)
    trace.push(s)
  }
  return trace
}

/** Trechos contínuos com o mesmo alvo: [alvo, duração]. */
function segments(trace: GazeState[], dt = DT) {
  const out: { key: string; seconds: number }[] = []
  for (const s of trace) {
    const key = `${s.gaze.kind}:${s.gaze.planet ?? ''}`
    if (out.length && out[out.length - 1].key === key) out[out.length - 1].seconds += dt
    else out.push({ key, seconds: dt })
  }
  return out
}
const kindOf = (key: string) => key.split(':')[0]

describe('viajando é o padrão', () => {
  it('começa viajando: expressão "viajando" no idle', () => {
    expect(GAZE_AT_START.gaze.kind).toBe('dream')
    expect(gazeExpression(GAZE_AT_START, 'idle')).toBe('viajando')
  })

  it('numa simulação longa, viajando fica com 55–75% do tempo parado', () => {
    for (const seed of [1, 7, 42]) {
      const trace = run(calm, 3000, seed)
      const share = trace.filter((s) => gazeExpression(s, 'idle') === 'viajando').length / trace.length
      expect(share).toBeGreaterThan(0.55)
      expect(share).toBeLessThan(0.75)
    }
  })

  it('alterna: viajando, uma olhada curta de olhos abertos, viajando de novo — sem repetir o tipo da olhada', () => {
    const segs = segments(run(calm, 600, 3))
    for (let i = 1; i < segs.length; i++) {
      const [a, b] = [kindOf(segs[i - 1].key), kindOf(segs[i].key)]
      expect(a === 'dream' || b === 'dream').toBe(true)
    }
    const briefs = segs.map((g) => kindOf(g.key)).filter((k) => k !== 'dream')
    for (let i = 1; i < briefs.length; i++) expect(briefs[i]).not.toBe(briefs[i - 1])
  })

  it('cada trecho dura o que a faixa dele manda (só o primeiro e o último podem estar cortados)', () => {
    const segs = segments(run(calm, 400)).slice(1, -1)
    expect(segs.length).toBeGreaterThan(30)
    for (const { key, seconds } of segs) {
      const kind = kindOf(key)
      const [lo, hi] = kind === 'planet' ? ADMIRE_DWELL : kind === 'dream' ? DREAM_DWELL : DWELL
      expect(seconds).toBeGreaterThanOrEqual(lo - 0.05)
      expect(seconds).toBeLessThanOrEqual(hi + 0.05)
    }
    expect(dwellFor('dream', () => 0)).toBe(DREAM_DWELL[0])
    expect(dwellFor('planet', () => 0.999)).toBeLessThanOrEqual(ADMIRE_DWELL[1])
  })

  it('viajando, a cabeça vaga devagar e pouco (sem pular para alvo nenhum)', () => {
    const all = run(calm, 120)
    const trace = all.filter((s) => s.gaze.kind === 'dream')
    expect(trace.length).toBeGreaterThan(100)
    const maxStep = 2 * WANDER.yaw * (1 - Math.exp(-DT / WANDER.tau)) + 1e-9
    for (let i = 1; i < all.length; i++) {
      if (all[i].gaze.kind !== 'dream' || all[i - 1].gaze.kind !== 'dream') continue
      const [y0, p0] = headOffset(all[i - 1])
      const [y1, p1] = headOffset(all[i])
      expect(Math.abs(y1)).toBeLessThanOrEqual(WANDER.yaw)
      expect(Math.abs(p1)).toBeLessThanOrEqual(WANDER.pitch)
      expect(Math.abs(y1 - y0)).toBeLessThanOrEqual(maxStep)
      expect(Math.abs(p1 - p0)).toBeLessThanOrEqual(maxStep)
    }
    expect(new Set(trace.map((s) => headOffset(s)[0].toFixed(3))).size).toBeGreaterThan(20)
  })
})

describe('olhadas curtas', () => {
  it('sem ponteiro de verdade, nunca escolhe o mouse; sem planetas, nunca admira', () => {
    expect(run({ ...calm, pointer: false }, 600, 11).some((s) => s.gaze.kind === 'mouse')).toBe(false)
    for (let seed = 0; seed < 200; seed++) expect(pickGaze('camera', { ...calm, pointer: false }, mulberry32(seed)).kind).not.toBe('mouse')
    expect(run({ ...calm, planets: [] }, 400).some((s) => s.gaze.kind === 'planet')).toBe(false)
  })

  it('usa todos os alvos; nunca sorteia "viajando" como olhada; prefere planetas grandes', () => {
    const kinds = new Set(run(calm, 1500, 5).map((s) => s.gaze.kind))
    expect([...kinds].sort()).toEqual(['camera', 'dream', 'mouse', 'planet', 'ship'])
    const counts: Record<string, number> = {}
    for (let seed = 0; seed < 400; seed++) {
      const g = pickGaze('camera', { ...calm, pointer: false }, mulberry32(seed))
      expect(g.kind).not.toBe('dream')
      if (g.kind === 'planet') counts[g.planet!] = (counts[g.planet!] ?? 0) + 1
    }
    expect(counts.big).toBeGreaterThan(counts.mid)
    expect(counts.mid).toBeGreaterThan(counts.tiny ?? 0)
  })

  it('a mesma semente dá a mesma sequência', () => {
    const a = segments(run(calm, 60, 42)).map((s) => s.key)
    expect(segments(run(calm, 60, 42)).map((s) => s.key)).toEqual(a)
    expect(a).toMatchInlineSnapshot(`
      [
        "dream:",
        "planet:big",
        "dream:",
        "ship:",
        "dream:",
        "mouse:",
        "dream:",
        "camera:",
        "dream:",
        "mouse:",
        "dream:",
      ]
    `)
  })
})

describe('interrupções acordam o sol e trocam a expressão', () => {
  const s0 = run(calm, 2).at(-1)!
  const rng = () => mulberry32(1)

  it('mapa: clique → surpreso, hover → feliz, nave viajando → sério, foco → admirando, seleção → admirando, away → triste', () => {
    const at = (input: GazeInput) => {
      const s = stepGaze(s0, input, DT, rng())
      return gazeExpression(s, input.mode)
    }
    expect(gazeExpression(s0, 'idle')).toBe('viajando')
    expect(at({ ...calm, mode: 'click' })).toBe('surprised')
    expect(at({ ...calm, mode: 'hover' })).toBe('happy')
    expect(at({ ...calm, shipTraveling: true })).toBe('serious')
    expect(at({ ...calm, focusPlanet: 'mid' })).toBe('admiring')
    expect(at({ ...calm, selectedPlanet: 'tiny' })).toBe('admiring')
    expect(at({ ...calm, mode: 'away' })).toBe('sad')
  })

  it('olhadas curtas de olhos abertos: a nave e o mouse "de olho" (pálpebra pesada), o planeta admirando, quem vê feliz', () => {
    const at = (kind: GazeState['gaze']['kind']) => gazeExpression({ ...GAZE_AT_START, gaze: { kind, planet: kind === 'planet' ? 'big' : null } }, 'idle')
    expect(at('ship')).toBe('watching')
    expect(at('mouse')).toBe('watching')
    expect(at('planet')).toBe('admiring')
    expect(at('camera')).toBe('happy')
  })

  it('prioridade: clique > hover > nave viajando > foco > planeta selecionado', () => {
    const all: GazeInput = { ...calm, mode: 'click', shipTraveling: true, focusPlanet: 'mid', selectedPlanet: 'tiny' }
    expect(stepGaze(s0, all, 0.1, rng()).gaze).toEqual({ kind: 'camera', planet: null })
    expect(stepGaze(s0, { ...all, mode: 'hover' }, 0.1, rng()).gaze).toEqual({ kind: 'mouse', planet: null })
    expect(stepGaze(s0, { ...all, mode: 'idle' }, 0.1, rng()).gaze).toEqual({ kind: 'ship', planet: null })
    expect(stepGaze(s0, { ...all, mode: 'idle', shipTraveling: false }, 0.1, rng()).gaze).toEqual({ kind: 'planet', planet: 'mid' })
    expect(stepGaze(s0, { ...all, mode: 'idle', shipTraveling: false, focusPlanet: null }, 0.1, rng()).gaze).toEqual({ kind: 'planet', planet: 'tiny' })
    expect(stepGaze(s0, { ...calm, mode: 'hover', pointer: false }, 0.1, rng()).gaze.kind).not.toBe('mouse')
  })

  it('acabou a interrupção: fica acordado 3–6 s olhando para quem vê e volta a viajar', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = mulberry32(seed)
      let s = s0
      for (let i = 0; i < 60; i++) s = stepGaze(s, { ...calm, mode: 'hover' }, DT, r)
      let t = 0
      s = stepGaze(s, calm, DT, r)
      expect(gazeExpression(s, 'idle')).toBe('happy')
      while (gazeExpression(s, 'idle') !== 'viajando' && t < 20) {
        s = stepGaze(s, calm, DT, r)
        t += DT
      }
      expect(t).toBeGreaterThanOrEqual(AWAKE_DWELL[0] - 0.05)
      expect(t).toBeLessThanOrEqual(AWAKE_DWELL[1] + 0.05)
    }
  })

  it('o foco segura o olhar enquanto durar; depois acorda olhando para quem vê', () => {
    let s = s0
    const r = mulberry32(9)
    for (let i = 0; i < 300; i++) s = stepGaze(s, { ...calm, focusPlanet: 'big' }, DT, r)
    expect(s.gaze).toEqual({ kind: 'planet', planet: 'big' })
    s = stepGaze(s, calm, DT, r)
    expect(s.gaze.kind).toBe('camera')
  })

  it('planeta selecionado: uma olhada (o tempo de admirar), e não força de novo enquanto continuar selecionado', () => {
    const r = mulberry32(4)
    let s = stepGaze(s0, { ...calm, selectedPlanet: 'tiny' }, DT, r)
    expect(s.gaze).toEqual({ kind: 'planet', planet: 'tiny' })
    let t = 0
    while (s.gaze.planet === 'tiny' && t < 20) {
      s = stepGaze(s, { ...calm, selectedPlanet: 'tiny' }, DT, r)
      t += DT
    }
    expect(t).toBeGreaterThanOrEqual(ADMIRE_DWELL[0] - 0.05)
    expect(t).toBeLessThanOrEqual(ADMIRE_DWELL[1] + 0.05)
    expect(s.glanced).toBe('tiny')
  })

  it('saindo do viajando para olhos abertos: piscada de transição; entre olhos abertos, não', () => {
    expect(wakesUp('viajando', 'happy')).toBe(true)
    expect(wakesUp('viajando', 'serious')).toBe(true)
    expect(wakesUp('happy', 'sad')).toBe(false)
    expect(wakesUp('viajando', 'viajando')).toBe(false)
    expect(wakesUp('admiring', 'viajando')).toBe(false)
  })
})

describe('nave viajando: o sol acompanha a viagem inteira, sério', () => {
  const traveling: GazeInput = { ...calm, shipTraveling: true }

  it('a nave parte → olha para ela no mesmo passo, de qualquer olhar (sem a regra de não repetir)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s0 = run(calm, 1 + seed * 3, seed).at(-1)!
      expect(stepGaze(s0, traveling, DT, mulberry32(seed)).gaze).toEqual({ kind: 'ship', planet: null })
    }
    const watching: GazeState = { ...GAZE_AT_START, gaze: { kind: 'ship', planet: null }, left: 0.1, lastBrief: 'ship' }
    expect(stepGaze(watching, traveling, DT, mulberry32(1)).gaze.kind).toBe('ship')
  })

  it('viagem longa: fica na nave e sério; só olhadelas curtas (≤ 0,6 s) para outro lado, sempre voltando para ela', () => {
    const s0 = stepGaze(run(calm, 3).at(-1)!, traveling, DT, mulberry32(9))
    const trace = run(traveling, 90, 9, DT, s0)
    expect(trace.every((s) => gazeExpression(s, 'idle') === 'serious')).toBe(true)
    const segs = segments(trace)
    expect(trace.filter((s) => s.gaze.kind === 'ship').length / trace.length).toBeGreaterThan(0.85)
    const away = segs.filter((g) => !g.key.startsWith('ship'))
    expect(away.length).toBeGreaterThan(3)
    for (const g of away) expect(g.seconds).toBeLessThanOrEqual(TRAVEL_GLANCE.max + DT + 1e-9)
    for (let i = 0; i < segs.length - 1; i++) if (!segs[i].key.startsWith('ship')) expect(segs[i + 1].key.startsWith('ship')).toBe(true)
  })

  it('a nave chega → solta: acorda olhando para quem vê e depois volta a viajar', () => {
    let s = run(traveling, 10, 4).at(-1)!
    s = stepGaze(s, calm, DT, mulberry32(5))
    expect(s.gaze.kind).toBe('camera')
    expect(s.traveling).toBe(false)
    expect(run(calm, 12, 6, DT, s).some((x) => x.gaze.kind === 'dream')).toBe(true)
  })
})

describe('movimento reduzido', () => {
  it('sem sorteio, sem sacada, sem cabeça vagando: viajando de frente; o mouse só no hover', () => {
    for (const input of [calm, { ...calm, shipTraveling: true }]) {
      for (const s of run({ ...input, reduced: true }, 60)) {
        expect(s.gaze.kind).toBe('dream')
        expect(headOffset(s)).toEqual([0, 0])
        expect(gazeExpression(s, 'idle')).toBe('viajando')
      }
    }
    expect(stepGaze(GAZE_AT_START, { ...calm, reduced: true, mode: 'hover' }, 0.1, mulberry32(1)).gaze.kind).toBe('mouse')
  })
})

describe('sacadas de olhos abertos', () => {
  it('micro-movimentos pequenos enquanto olha, trocando de vez em quando', () => {
    const trace = run(calm, 60).filter((s) => s.gaze.kind !== 'dream')
    expect(new Set(trace.map((s) => headOffset(s)[0])).size).toBeGreaterThan(5)
    for (const s of trace) {
      expect(Math.abs(s.saccadeYaw)).toBeLessThanOrEqual(SACCADE.yaw)
      expect(Math.abs(s.saccadePitch)).toBeLessThanOrEqual(SACCADE.pitch)
    }
  })
})

describe('peso do planeta para admirar', () => {
  const now = Date.parse('2026-10-09T12:00:00Z')
  it('cresce com o tamanho; atividade recente (dias) multiplica, e some com o tempo', () => {
    expect(planetGazeWeight(2, null, now)).toBeCloseTo(2 * planetGazeWeight(1, null, now))
    const today = planetGazeWeight(1, '2026-10-09T08:00:00Z', now)
    const lastWeek = planetGazeWeight(1, '2026-10-02T12:00:00Z', now)
    const lastYear = planetGazeWeight(1, '2025-10-09T12:00:00Z', now)
    expect(today).toBeGreaterThan(lastWeek)
    expect(lastWeek).toBeGreaterThan(lastYear)
    expect(lastYear).toBeCloseTo(planetGazeWeight(1, null, now), 2)
    expect(today).toBeLessThanOrEqual(3.01)
    expect(planetGazeWeight(1, 'não é data', now)).toBe(planetGazeWeight(1, null, now))
  })
})

describe('pupila em degraus (cara de olhar de desenho, sem jitter)', () => {
  it('8 degraus no alcance: arredonda para o degrau mais perto e não passa do alcance', () => {
    const reach = 5
    const step = (2 * reach) / 8
    expect(quantizePupil(0, reach)).toBe(0)
    expect(quantizePupil(0.3, reach)).toBe(0)
    expect(quantizePupil(0.7, reach)).toBeCloseTo(step)
    expect(quantizePupil(-2.6, reach)).toBeCloseTo(-2 * step)
    expect(quantizePupil(99, reach)).toBe(reach)
    expect(quantizePupil(-99, reach)).toBe(-reach)
    const levels = new Set<number>()
    for (let v = -6; v <= 6; v += 0.01) levels.add(quantizePupil(v, reach))
    expect(levels.size).toBe(9)
  })
})

describe('olhando longe: o rosto desliza pela esfera até 55° de quem vê e o pitch fica limitado', () => {
  const deg = (d: number) => (d * Math.PI) / 180
  const front = { yaw: 0, pitch: 0 }
  const dir = (t: { yaw: number; pitch: number }) => [Math.cos(t.pitch) * Math.sin(t.yaw), Math.sin(t.pitch), Math.cos(t.pitch) * Math.cos(t.yaw)]
  const angle = (a: { yaw: number; pitch: number }, b: { yaw: number; pitch: number }) => {
    const [u, v] = [dir(a), dir(b)]
    return Math.acos(Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))
  }

  it('yaw: segue igual até 55° da câmera; além disso para no limite, do lado do alvo', () => {
    expect(MAX_TURN_AWAY).toBeCloseTo(deg(55))
    expect(limitTurn({ yaw: deg(50), pitch: 0 }, front).yaw).toBeCloseTo(deg(50))
    expect(limitTurn({ yaw: deg(170), pitch: 0 }, front).yaw).toBeCloseTo(deg(55))
    expect(limitTurn({ yaw: deg(-120), pitch: 0 }, front).yaw).toBeCloseTo(deg(-55))
    // na volta do ±π (sem normalizar: a mola trata a volta)
    expect(limitTurn({ yaw: deg(-170), pitch: 0 }, { yaw: deg(170), pitch: 0 }).yaw).toBeCloseTo(deg(190))
  })

  it('pitch: limitado a ±35° (o mesmo MAX_PITCH da mola)', () => {
    expect(MAX_PITCH).toBeCloseTo(deg(35))
    expect(limitTurn({ yaw: 0, pitch: deg(80) }, front).pitch).toBeCloseTo(deg(35))
    expect(limitTurn({ yaw: 0, pitch: deg(-80) }, front).pitch).toBeCloseTo(deg(-35))
    expect(limitTurn({ yaw: 0, pitch: deg(20) }, front).pitch).toBeCloseTo(deg(20))
  })

  it('com a câmera de cima, o ângulo de verdade até quem vê também para no limite (o rosto não some na borda)', () => {
    const viewer = { yaw: 0, pitch: deg(30) }
    for (const target of [{ yaw: deg(160), pitch: deg(-10) }, { yaw: deg(-100), pitch: 0 }, { yaw: deg(80), pitch: deg(-20) }]) {
      expect(angle(limitTurn(target, viewer), viewer)).toBeLessThanOrEqual(MAX_TURN_AWAY + 1e-9)
    }
    // alvo exatamente atrás: vira para um lado, sem NaN
    const back = limitTurn({ yaw: deg(180), pitch: deg(-30) }, viewer)
    expect(Number.isFinite(back.yaw) && Number.isFinite(back.pitch)).toBe(true)
    expect(angle(back, viewer)).toBeCloseTo(MAX_TURN_AWAY, 3)
  })
})
