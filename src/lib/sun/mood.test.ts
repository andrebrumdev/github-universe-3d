import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../universe/random'
import {
  ARRIVAL_ADMIRE,
  ARRIVAL_WATCH,
  CALM,
  CLICK_SURPRISE,
  COMET_SURPRISE,
  GREETING,
  IDLE_SLEEP,
  LEAVE_SAD,
  MIN_DWELL,
  MOOD_AT_START,
  MOOD_TABLE,
  moodAllowed,
  moodFor,
  stepMood,
  TAB_HAPPY,
  TAB_SURPRISE,
  type MoodContext,
  type MoodState,
} from './mood'

/** Nada acontecendo, já passou da saudação e mexeram há pouco (acordado). */
const quiet: MoodContext = { ...CALM, sinceStart: 60, idleFor: 1 }
const mood = (ctx: Partial<MoodContext>) => moodFor({ ...quiet, ...ctx })

describe('moodFor: cada linha da tabela de humores', () => {
  it('nada acontecendo por mais de ~8 s: viajando (dormindo), cabeça à deriva', () => {
    expect(mood({ idleFor: IDLE_SLEEP + 0.1 })).toMatchObject({ expression: 'viajando', target: 'drift' })
    // antes disso, acordado olhando para quem vê
    expect(mood({ idleFor: IDLE_SLEEP - 0.5 })).toMatchObject({ expression: 'happy', target: 'viewer' })
  })

  it('primeira carga / boas-vindas do tutorial: feliz para quem vê (cumprimentando); nunca começa dormindo', () => {
    expect(moodFor({ ...CALM, sinceStart: 0, idleFor: 0 })).toMatchObject({ expression: 'happy', target: 'viewer' })
    expect(moodFor({ ...CALM, sinceStart: GREETING - 0.1, idleFor: GREETING - 0.1 })).toMatchObject({ expression: 'happy' })
    expect(mood({ tutorialWelcome: true, idleFor: 99 })).toMatchObject({ expression: 'happy', target: 'viewer' })
    expect(MOOD_AT_START.mood.expression).toBe('happy')
  })

  it('mouse em cima do sol: feliz, olhando o mouse', () => {
    expect(mood({ hover: true })).toMatchObject({ expression: 'happy', target: 'mouse' })
  })

  it('clique no sol: surpreso para quem vê (a situação pede 0,6 s; o tempo mínimo segura 1,2 s) e depois feliz com o painel aberto', () => {
    expect(mood({ sinceClick: 0.1, profileOpen: true })).toMatchObject({ expression: 'surprised', target: 'viewer' })
    expect(mood({ sinceClick: CLICK_SURPRISE + 0.1, profileOpen: true })).toMatchObject({ expression: 'happy', target: 'viewer' })
  })

  it('nave viajando: sério olhando a nave; de olho (pálpebra pesada) quando ela está bem de lado', () => {
    expect(mood({ shipTraveling: true })).toMatchObject({ expression: 'serious', target: 'ship' })
    expect(mood({ shipTraveling: true, shipFarSide: true })).toMatchObject({ expression: 'watching', target: 'ship' })
  })

  it('estilingue perto do sol / nave passando raspando: surpreso olhando a nave', () => {
    expect(mood({ shipTraveling: true, closePass: true })).toMatchObject({ expression: 'surprised', target: 'ship' })
  })

  it('planeta selecionado ou em foco na apresentação/tutorial: admirando aquele planeta', () => {
    expect(mood({ focusPlanet: 'api' })).toMatchObject({ expression: 'admiring', target: 'planet', planet: 'api' })
  })

  it('a nave chega num planeta: admirando o planeta (rápido) e depois de olho na nave', () => {
    expect(mood({ sinceArrival: 0.2, arrivalPlanet: 'api' })).toMatchObject({ expression: 'admiring', target: 'planet', planet: 'api' })
    expect(mood({ sinceArrival: ARRIVAL_ADMIRE + 0.2, arrivalPlanet: 'api' })).toMatchObject({ expression: 'watching', target: 'ship' })
    expect(mood({ sinceArrival: ARRIVAL_WATCH + 0.2, arrivalPlanet: 'api' })).toMatchObject({ expression: 'happy', target: 'viewer' })
  })

  it('cometa perto do periélio: surpreso e depois de olho no cometa', () => {
    expect(mood({ cometNear: true, sinceCometNear: 0.2 })).toMatchObject({ expression: 'surprised', target: 'comet' })
    expect(mood({ cometNear: true, sinceCometNear: COMET_SURPRISE + 0.2 })).toMatchObject({ expression: 'watching', target: 'comet' })
  })

  it('trombada na tela: surpreso para quem vê no impacto; feliz (rindo) quando sai a fala de desculpa', () => {
    expect(mood({ crash: 'impact' })).toMatchObject({ expression: 'surprised', target: 'viewer' })
    expect(mood({ crash: 'laugh' })).toMatchObject({ expression: 'happy', target: 'viewer' })
  })

  it('quem estava interagindo saiu (painel fechado / mouse foi embora): triste para quem vê (~1,5 s), depois volta', () => {
    expect(mood({ sinceLeave: 0.3 })).toMatchObject({ expression: 'sad', target: 'viewer' })
    expect(mood({ sinceLeave: LEAVE_SAD + 0.1 })).toMatchObject({ expression: 'happy', target: 'viewer' })
  })

  it('a aba volta depois de >10 s escondida: acorda surpreso e depois feliz, para quem vê', () => {
    expect(mood({ sinceTabReturn: 0.1, idleFor: 99 })).toMatchObject({ expression: 'surprised', target: 'viewer' })
    expect(mood({ sinceTabReturn: TAB_SURPRISE + 0.1, idleFor: 99 })).toMatchObject({ expression: 'happy', target: 'viewer' })
    expect(mood({ sinceTabReturn: TAB_HAPPY + 0.1, idleFor: 99 })).toMatchObject({ expression: 'viajando' })
  })
})

describe('prioridade: clique > trombada > hover > estilingue/raspão > nave viajando > foco/seleção > cometa > saída > idle', () => {
  it('cada evento ganha dos de baixo', () => {
    const all: Partial<MoodContext> = {
      sinceClick: 0.1,
      crash: 'impact',
      hover: true,
      closePass: true,
      shipTraveling: true,
      focusPlanet: 'api',
      cometNear: true,
      sinceCometNear: 2,
      sinceLeave: 0.2,
      idleFor: 99,
    }
    expect(mood(all)).toMatchObject({ expression: 'surprised', target: 'viewer' }) // clique
    expect(mood({ ...all, sinceClick: Infinity })).toMatchObject({ expression: 'surprised', target: 'viewer' }) // trombada
    expect(mood({ ...all, sinceClick: Infinity, crash: 'none' })).toMatchObject({ expression: 'happy', target: 'mouse' }) // hover
    expect(mood({ ...all, sinceClick: Infinity, crash: 'none', hover: false })).toMatchObject({ expression: 'surprised', target: 'ship' })
    expect(mood({ ...all, sinceClick: Infinity, crash: 'none', hover: false, closePass: false })).toMatchObject({ expression: 'serious', target: 'ship' })
    const noShip = { ...all, sinceClick: Infinity, crash: 'none' as const, hover: false, closePass: false, shipTraveling: false }
    expect(mood(noShip)).toMatchObject({ expression: 'admiring', target: 'planet' })
    expect(mood({ ...noShip, focusPlanet: null })).toMatchObject({ expression: 'watching', target: 'comet' })
    expect(mood({ ...noShip, focusPlanet: null, cometNear: false })).toMatchObject({ expression: 'sad', target: 'viewer' })
    expect(mood({ ...noShip, focusPlanet: null, cometNear: false, sinceLeave: Infinity })).toMatchObject({ expression: 'viajando' })
  })

  it('hover durante a viagem da nave: o hover ganha (feliz olhando o mouse)', () => {
    expect(mood({ hover: true, shipTraveling: true })).toMatchObject({ expression: 'happy', target: 'mouse' })
  })
})

/** Contexto aleatório (para checar regras em qualquer combinação). */
function randomContext(rng: () => number): MoodContext {
  const pick = <T>(xs: T[]) => xs[Math.floor(rng() * xs.length)]
  return {
    hover: rng() < 0.2,
    sinceClick: pick([0.1, 0.8, Infinity]),
    crash: pick(['none', 'none', 'impact', 'laugh'] as const),
    closePass: rng() < 0.15,
    shipTraveling: rng() < 0.3,
    shipFarSide: rng() < 0.5,
    sinceArrival: pick([0.2, 2, 10]),
    arrivalPlanet: pick([null, 'api']),
    focusPlanet: pick([null, null, 'web']),
    profileOpen: rng() < 0.2,
    cometNear: rng() < 0.2,
    sinceCometNear: pick([0.2, 3]),
    sinceTabReturn: pick([0.1, 1.5, Infinity]),
    sinceStart: pick([0.5, 60]),
    tutorialWelcome: rng() < 0.1,
    sinceLeave: pick([0.2, Infinity]),
    idleFor: pick([1, 20]),
  }
}

describe('a expressão combina com o que o sol olha', () => {
  it('nunca admirando olhando o mouse, nunca triste olhando a nave, viajando só à deriva (2000 situações)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 2000; i++) {
      const m = moodFor(randomContext(rng))
      expect(moodAllowed(m)).toBe(true)
      if (m.expression === 'admiring') expect(m.target).toBe('planet')
      if (m.expression === 'sad') expect(m.target).toBe('viewer')
      if (m.target === 'ship') expect(['serious', 'watching', 'surprised']).toContain(m.expression)
      if (m.expression === 'viajando') expect(m.target).toBe('drift')
    }
  })

  it('viajando só depois do tempo sem nada: qualquer evento acorda', () => {
    const rng = mulberry32(3)
    for (let i = 0; i < 2000; i++) {
      const ctx = randomContext(rng)
      if (moodFor(ctx).expression === 'viajando') {
        expect(ctx.idleFor).toBeGreaterThanOrEqual(IDLE_SLEEP)
        expect(ctx.hover || ctx.shipTraveling || ctx.focusPlanet || ctx.cometNear || ctx.profileOpen).toBeFalsy()
        expect(ctx.crash).toBe('none')
      }
    }
  })
})

describe('stepMood: tempo mínimo em cada humor (sem piscar de um para outro)', () => {
  const run = (start: MoodState, ctxs: Partial<MoodContext>[], dt = 0.1) => {
    let s = start
    const trace: MoodState[] = []
    for (const c of ctxs) {
      s = stepMood(s, { ...quiet, ...c }, dt)
      trace.push(s)
    }
    return trace
  }

  it('um evento mais fraco espera o mínimo (~1,2 s) antes de trocar', () => {
    const start: MoodState = { mood: moodFor({ ...quiet, sinceLeave: 0 }), held: 0 }
    // sai triste e logo depois um cometa (mais alto que "saída"): troca na hora
    expect(run(start, [{ cometNear: true, sinceCometNear: 0.1 }]).at(-1)!.mood.expression).toBe('surprised')
    // feliz → triste (saída, mais alto que idle) troca na hora; triste → feliz (idle, mais baixo) espera o mínimo
    const sad = run(start, [{ sinceLeave: 0.1 }])[0]
    const after = run(sad, Array.from({ length: 20 }, () => ({})))
    const flip = after.findIndex((s) => s.mood.expression !== 'sad')
    expect((flip + 1) * 0.1).toBeGreaterThanOrEqual(MIN_DWELL - 1e-9)
  })

  it('clique: o surpreso dura o tempo mínimo (1,2 s), não os 0,6 s da situação, e só então vira feliz', () => {
    let st: MoodState = MOOD_AT_START
    let t = 0
    const dt = 0.05
    st = stepMood(st, { ...quiet, sinceClick: 0, profileOpen: true }, dt)
    expect(st.mood.expression).toBe('surprised')
    let surprised = 0
    while (st.mood.expression === 'surprised' && t < 5) {
      t += dt
      st = stepMood(st, { ...quiet, sinceClick: t, profileOpen: true }, dt)
      if (st.mood.expression === 'surprised') surprised += dt
    }
    expect(surprised).toBeGreaterThanOrEqual(MIN_DWELL - dt - 1e-9)
    expect(surprised).toBeLessThan(MIN_DWELL + dt)
    expect(st.mood.expression).toBe('happy')
  })

  it('um evento mais alto passa na frente na hora', () => {
    const start: MoodState = { mood: moodFor({ ...quiet, focusPlanet: 'api' }), held: 0 }
    expect(run(start, [{ focusPlanet: 'api', sinceClick: 0 }])[0].mood.expression).toBe('surprised')
  })

  it('nunca troca antes do mínimo se o novo não for mais alto (simulação aleatória)', () => {
    const rng = mulberry32(11)
    let s = MOOD_AT_START
    for (let i = 0; i < 3000; i++) {
      const next = stepMood(s, randomContext(rng), 0.05)
      const changed = next.mood.expression !== s.mood.expression || next.mood.target !== s.mood.target || next.mood.planet !== s.mood.planet
      if (changed) expect(s.held >= MIN_DWELL || next.mood.rank > s.mood.rank).toBe(true)
      s = next
    }
  })

  it('aba voltando depois de muito tempo dormindo: acorda (surpreso → feliz) mesmo vindo do viajando', () => {
    const asleep: MoodState = { mood: moodFor({ ...quiet, idleFor: 99 }), held: 30 }
    expect(asleep.mood.expression).toBe('viajando')
    const woke = run(asleep, [{ sinceTabReturn: 0, idleFor: 99 }])[0]
    expect(woke.mood).toMatchObject({ expression: 'surprised', target: 'viewer' })
  })
})

describe('MOOD_TABLE (a galeria mostra estas linhas)', () => {
  it('cada linha dá a expressão e o alvo que ela documenta, e todas fazem sentido', () => {
    expect(MOOD_TABLE.length).toBeGreaterThanOrEqual(12)
    for (const row of MOOD_TABLE) {
      const m = moodFor({ ...CALM, ...row.context })
      expect([row.label, m.expression, m.target]).toEqual([row.label, row.expression, row.target])
      expect(moodAllowed(m)).toBe(true)
    }
  })
})
