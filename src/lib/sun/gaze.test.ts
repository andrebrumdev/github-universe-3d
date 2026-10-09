import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../universe/random'
import {
  ADMIRE_DWELL,
  DWELL,
  dwellFor,
  GAZE_AT_START,
  isAdmiring,
  limitTurnAway,
  MAX_TURN_AWAY,
  pickGaze,
  planetGazeWeight,
  quantizePupil,
  SACCADE,
  TRAVEL_GLANCE,
  stepGaze,
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

function run(input: GazeInput, seconds: number, seed = 7, dt = 1 / 30, start: GazeState = GAZE_AT_START) {
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
function segments(trace: GazeState[], dt = 1 / 30) {
  const out: { key: string; seconds: number }[] = []
  for (const s of trace) {
    const key = `${s.gaze.kind}:${s.gaze.planet ?? ''}`
    if (out.length && out[out.length - 1].key === key) out[out.length - 1].seconds += dt
    else out.push({ key, seconds: dt })
  }
  return out
}

describe('quanto tempo o sol fica olhando', () => {
  it('2–6 s em geral; 4–8 s admirando um planeta', () => {
    for (const r of [0, 0.5, 0.999]) {
      for (const kind of ['camera', 'mouse', 'ship'] as const) {
        expect(dwellFor(kind, () => r)).toBeGreaterThanOrEqual(DWELL[0])
        expect(dwellFor(kind, () => r)).toBeLessThanOrEqual(DWELL[1])
      }
      expect(dwellFor('planet', () => r)).toBeGreaterThanOrEqual(ADMIRE_DWELL[0])
      expect(dwellFor('planet', () => r)).toBeLessThanOrEqual(ADMIRE_DWELL[1])
    }
    expect(DWELL).toEqual([2, 6])
    expect(ADMIRE_DWELL).toEqual([4, 8])
  })

  it('numa sequência longa, cada olhar dura o que a faixa dele manda (só o último pode estar cortado)', () => {
    const segs = segments(run(calm, 240)).slice(1, -1)
    expect(segs.length).toBeGreaterThan(20)
    for (const { key, seconds } of segs) {
      const [lo, hi] = key.startsWith('planet') ? ADMIRE_DWELL : DWELL
      expect(seconds).toBeGreaterThanOrEqual(lo - 0.05)
      expect(seconds).toBeLessThanOrEqual(hi + 0.05)
    }
  })
})

describe('escolha do alvo', () => {
  it('nunca repete o mesmo tipo de alvo em seguida', () => {
    const segs = segments(run(calm, 400, 3))
    for (let i = 1; i < segs.length; i++) expect(segs[i].key.split(':')[0]).not.toBe(segs[i - 1].key.split(':')[0])
  })

  it('sem ponteiro de verdade, nunca escolhe o mouse', () => {
    const trace = run({ ...calm, pointer: false }, 400, 11)
    expect(trace.some((s) => s.gaze.kind === 'mouse')).toBe(false)
    for (let seed = 0; seed < 200; seed++) expect(pickGaze('camera', { ...calm, pointer: false }, mulberry32(seed)).kind).not.toBe('mouse')
  })

  it('sem planetas, não tenta admirar nenhum', () => {
    expect(run({ ...calm, planets: [] }, 200).some((s) => s.gaze.kind === 'planet')).toBe(false)
  })

  it('usa todos os alvos; prefere planetas grandes', () => {
    const trace = run(calm, 1200, 5)
    const kinds = new Set(trace.map((s) => s.gaze.kind))
    expect([...kinds].sort()).toEqual(['camera', 'mouse', 'planet', 'ship'])
    const counts: Record<string, number> = {}
    for (let seed = 0; seed < 400; seed++) {
      const g = pickGaze('camera', { ...calm, pointer: false, planets: PLANETS }, mulberry32(seed))
      if (g.kind === 'planet') counts[g.planet!] = (counts[g.planet!] ?? 0) + 1
    }
    expect(counts.big).toBeGreaterThan(counts.mid)
    expect(counts.mid).toBeGreaterThan(counts.tiny ?? 0)
  })

  it('a mesma semente dá a mesma sequência', () => {
    const a = segments(run(calm, 60, 42)).map((s) => s.key)
    const b = segments(run(calm, 60, 42)).map((s) => s.key)
    expect(a).toEqual(b)
    expect(a).toMatchInlineSnapshot(`
      [
        "camera:",
        "ship:",
        "camera:",
        "mouse:",
        "ship:",
        "camera:",
        "planet:big",
        "camera:",
        "ship:",
        "planet:big",
        "mouse:",
        "planet:big",
        "mouse:",
        "camera:",
      ]
    `)
  })
})

describe('interrupções', () => {
  const s0 = run(calm, 3).at(-1)!

  it('prioridade: clique (câmera) > hover (mouse) > foco da apresentação/tutorial > planeta selecionado', () => {
    const rng = mulberry32(1)
    const all: GazeInput = { ...calm, mode: 'click', focusPlanet: 'mid', selectedPlanet: 'tiny' }
    expect(stepGaze(s0, all, 0.1, rng).gaze).toEqual({ kind: 'camera', planet: null })
    expect(stepGaze(s0, { ...all, mode: 'hover' }, 0.1, rng).gaze).toEqual({ kind: 'mouse', planet: null })
    expect(stepGaze(s0, { ...all, mode: 'idle' }, 0.1, rng).gaze).toEqual({ kind: 'planet', planet: 'mid' })
    expect(stepGaze(s0, { ...all, mode: 'idle', focusPlanet: null }, 0.1, rng).gaze).toEqual({ kind: 'planet', planet: 'tiny' })
  })

  it('hover sem ponteiro (toque) não força o mouse', () => {
    expect(stepGaze(s0, { ...calm, mode: 'hover', pointer: false }, 0.1, mulberry32(1)).gaze.kind).not.toBe('mouse')
  })

  it('o foco segura o olhar enquanto durar; depois volta a escolher sozinho, sem repetir o planeta logo', () => {
    let s = s0
    const rng = mulberry32(9)
    for (let i = 0; i < 300; i++) s = stepGaze(s, { ...calm, focusPlanet: 'big' }, 1 / 30, rng)
    expect(s.gaze).toEqual({ kind: 'planet', planet: 'big' })
    s = stepGaze(s, calm, 1 / 30, rng)
    expect(s.gaze.kind).not.toBe('planet')
  })

  it('planeta selecionado: uma olhada primeiro (o tempo de admirar), depois segue a vida', () => {
    const rng = mulberry32(4)
    let s = stepGaze(s0, { ...calm, selectedPlanet: 'tiny' }, 1 / 30, rng)
    expect(s.gaze).toEqual({ kind: 'planet', planet: 'tiny' })
    let t = 0
    while (s.gaze.planet === 'tiny' && t < 20) {
      s = stepGaze(s, { ...calm, selectedPlanet: 'tiny' }, 1 / 30, rng)
      t += 1 / 30
    }
    expect(t).toBeGreaterThanOrEqual(ADMIRE_DWELL[0] - 0.05)
    expect(t).toBeLessThanOrEqual(ADMIRE_DWELL[1] + 0.05)
    // continua selecionado: não volta a forçar a olhada
    for (let i = 0; i < 60; i++) s = stepGaze(s, { ...calm, selectedPlanet: 'tiny' }, 1 / 30, rng)
    expect(s.glanced).toBe('tiny')
  })
})

describe('movimento reduzido', () => {
  it('sem troca aleatória e sem sacada: olha para a câmera, ou para o mouse no hover', () => {
    const trace = run({ ...calm, reduced: true }, 60)
    for (const s of trace) {
      expect(s.gaze.kind).toBe('camera')
      expect(s.saccadeYaw).toBe(0)
      expect(s.saccadePitch).toBe(0)
    }
    expect(stepGaze(GAZE_AT_START, { ...calm, reduced: true, mode: 'hover' }, 0.1, mulberry32(1)).gaze.kind).toBe('mouse')
  })
})

describe('sacadas e expressão', () => {
  it('micro-movimentos pequenos enquanto olha, trocando de vez em quando', () => {
    const trace = run(calm, 20)
    const yaws = new Set(trace.map((s) => s.saccadeYaw))
    expect(yaws.size).toBeGreaterThan(10)
    for (const s of trace) {
      expect(Math.abs(s.saccadeYaw)).toBeLessThanOrEqual(SACCADE.yaw)
      expect(Math.abs(s.saccadePitch)).toBeLessThanOrEqual(SACCADE.pitch)
    }
  })

  it('admira (expressão própria) só olhando um planeta no idle', () => {
    const planet: GazeState = { ...GAZE_AT_START, gaze: { kind: 'planet', planet: 'big' } }
    expect(isAdmiring(planet, 'idle')).toBe(true)
    expect(isAdmiring(planet, 'hover')).toBe(false)
    expect(isAdmiring(GAZE_AT_START, 'idle')).toBe(false)
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
    expect(levels.size).toBe(9) // −4…+4 degraus
  })
})

describe('o rosto nunca some: vira no máximo MAX_TURN_AWAY para longe de quem vê', () => {
  const deg = (d: number) => (d * Math.PI) / 180
  it('alvo perto da câmera: segue igual; alvo atrás do sol: para no limite, do lado do alvo', () => {
    expect(MAX_TURN_AWAY).toBeLessThanOrEqual(deg(65))
    expect(limitTurnAway(deg(30), 0)).toBeCloseTo(deg(30))
    expect(limitTurnAway(deg(170), 0)).toBeCloseTo(MAX_TURN_AWAY)
    expect(limitTurnAway(deg(-120), 0)).toBeCloseTo(-MAX_TURN_AWAY)
  })

  it('funciona na volta do ±π (câmera atrás do eixo)', () => {
    expect(limitTurnAway(deg(-170), deg(170))).toBeCloseTo(deg(190))
    const y = limitTurnAway(deg(10), deg(170))
    expect(Math.abs(Math.atan2(Math.sin(y - deg(170)), Math.cos(y - deg(170))))).toBeCloseTo(MAX_TURN_AWAY)
  })
})

describe('nave viajando é interrupção: o sol acompanha a viagem inteira', () => {
  const traveling: GazeInput = { ...calm, shipTraveling: true }

  it('a nave parte → olha para ela no mesmo passo, de qualquer olhar (até admirando um planeta no meio da espera)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s0 = run(calm, 1 + seed, seed).at(-1)!
      expect(stepGaze(s0, traveling, 1 / 30, mulberry32(seed)).gaze).toEqual({ kind: 'ship', planet: null })
    }
    // mesmo vindo de olhar a nave (a regra de não repetir não vale para interrupções)
    const watching: GazeState = { ...GAZE_AT_START, gaze: { kind: 'ship', planet: null }, left: 0.1 }
    expect(stepGaze(watching, traveling, 1 / 30, mulberry32(1)).gaze.kind).toBe('ship')
  })

  it('viagem longa: fica na nave; só olhadelas curtas (≤ 0,6 s) para outro lado, sempre voltando para ela', () => {
    const dt = 1 / 30
    const s0 = stepGaze(run(calm, 3).at(-1)!, traveling, dt, mulberry32(9))
    const trace = run(traveling, 90, 9, dt, s0)
    const segs = segments(trace, dt)
    const ship = trace.filter((s) => s.gaze.kind === 'ship').length / trace.length
    expect(ship).toBeGreaterThan(0.85)
    const away = segs.filter((g) => !g.key.startsWith('ship'))
    expect(away.length).toBeGreaterThan(3) // olha de relance de vez em quando
    for (const g of away) expect(g.seconds).toBeLessThanOrEqual(TRAVEL_GLANCE.max + dt + 1e-9)
    for (let i = 0; i < segs.length - 1; i++) if (!segs[i].key.startsWith('ship')) expect(segs[i + 1].key.startsWith('ship')).toBe(true)
    expect(segs.at(-1)!.key.startsWith('ship') || segs.at(-1)!.seconds <= TRAVEL_GLANCE.max + dt).toBe(true)
  })

  it('a nave chega → solta: volta a escolher sozinho (outro alvo, espera normal)', () => {
    const dt = 1 / 30
    let s = run(traveling, 10, 4).at(-1)!
    s = stepGaze({ ...s, gaze: { kind: 'ship', planet: null } }, traveling, dt, mulberry32(4))
    s = stepGaze(s, calm, dt, mulberry32(5))
    expect(s.gaze.kind).not.toBe('ship')
    expect(s.left).toBeGreaterThanOrEqual(s.gaze.kind === 'planet' ? ADMIRE_DWELL[0] : DWELL[0])
    // e a vida segue: na próxima espera pode até voltar para a nave, sem prender
    const later = run(calm, 120, 6, dt, s)
    expect(later.some((x) => x.gaze.kind !== 'ship')).toBe(true)
  })

  it('prioridade: clique e hover passam na frente da viagem; a viagem passa na frente do foco e da seleção', () => {
    const rng = mulberry32(2)
    const s0 = run(calm, 3).at(-1)!
    expect(stepGaze(s0, { ...traveling, mode: 'click' }, 0.1, rng).gaze.kind).toBe('camera')
    expect(stepGaze(s0, { ...traveling, mode: 'hover' }, 0.1, rng).gaze.kind).toBe('mouse')
    expect(stepGaze(s0, { ...traveling, focusPlanet: 'big' }, 0.1, rng).gaze.kind).toBe('ship')
    expect(stepGaze(s0, { ...traveling, selectedPlanet: 'tiny' }, 0.1, rng).gaze.kind).toBe('ship')
  })

  it('movimento reduzido: sem olhadelas — câmera (a regra do movimento reduzido vale)', () => {
    expect(run({ ...traveling, reduced: true }, 20).every((s) => s.gaze.kind === 'camera')).toBe(true)
  })
})
