import type { SunExpression } from './sunMachine'

/**
 * Humor do sol coerente com o que acontece (nunca sorteado): uma tabela só, da situação e do alvo do olhar para a
 * expressão. A situação chega já medida (`MoodContext`, montado pelo Sun a partir dos stores e de relógios); `moodFor`
 * decide pela prioridade; `stepMood` segura cada humor um tempo mínimo, a não ser que entre um evento mais alto.
 *
 * | Situação                                         | Olha para | Expressão                                   |
 * |--------------------------------------------------|-----------|---------------------------------------------|
 * | nada acontecendo por mais de ~8 s                | deriva    | viajando (dormindo, Z z z)                  |
 * | primeira carga / boas-vindas do tutorial         | quem vê   | feliz (cumprimentando); nunca começa dormindo|
 * | girou demais (tontura, ~3 s)                     | quem vê   | tonto                                       |
 * | mouse em cima do sol                             | mouse     | feliz                                       |
 * | clique no sol / painel do perfil aberto          | quem vê   | surpreso (≥1,2 s), depois feliz (orgulhoso) |
 * | nave saindo ou viajando                          | nave      | sério; de olho se ela está bem de lado      |
 * | estilingue perto do sol / nave passando raspando | nave      | surpreso                                    |
 * | planeta selecionado ou em foco                   | o planeta | admirando                                   |
 * | nave chega num planeta                           | planeta   | admirando (rápido), depois de olho na nave  |
 * | cometa perto do periélio                         | cometa    | surpreso, depois de olho                    |
 * | trombada na tela                                 | quem vê   | surpreso; feliz (rindo) na fala de desculpa |
 * | quem interagia saiu (painel fechado / mouse foi) | quem vê   | triste (~1,5 s), depois volta               |
 * | aba volta depois de >10 s escondida              | quem vê   | acorda: surpreso, depois feliz              |
 */
export type MoodTarget = 'viewer' | 'mouse' | 'ship' | 'planet' | 'comet' | 'drift'

export interface Mood {
  expression: SunExpression
  target: MoodTarget
  /** Planeta olhado quando `target` é 'planet'. */
  planet: string | null
  /** Prioridade da situação que gerou o humor (maior passa na frente). */
  rank: number
}

export interface MoodContext {
  /** Mouse em cima do sol. */
  hover: boolean
  /** Girou demais e está tonto (lib/sun/spin). */
  dizzy: boolean
  /** s desde o último clique no sol (Infinity: nenhum). */
  sinceClick: number
  /** Trombada na tela: no impacto, ou rindo na fala de desculpa. */
  crash: 'none' | 'impact' | 'laugh'
  /** Estilingue perto do sol ou nave passando raspando. */
  closePass: boolean
  shipTraveling: boolean
  /** A nave está bem de lado para quem vê (o sol a acompanha de olho). */
  shipFarSide: boolean
  /** s desde que a nave chegou num planeta, e qual (null: nenhuma chegada). */
  sinceArrival: number
  arrivalPlanet: string | null
  /** Planeta selecionado ou em foco na apresentação/tutorial. */
  focusPlanet: string | null
  /** Painel do perfil aberto (o sol foi clicado). */
  profileOpen: boolean
  /** Cometa perto do periélio, e há quanto tempo. */
  cometNear: boolean
  sinceCometNear: number
  /** s desde que a aba voltou depois de >10 s escondida (Infinity: não voltou). */
  sinceTabReturn: number
  /** s desde que a cena abriu. */
  sinceStart: number
  /** Passo de boas-vindas do tutorial. */
  tutorialWelcome: boolean
  /** s desde que quem interagia saiu (Infinity: ninguém saiu). */
  sinceLeave: number
  /** s sem entrada do usuário nem evento. */
  idleFor: number
}

/** Situação calma (nenhum evento); os testes e o Sun partem daqui. */
export const CALM: MoodContext = {
  hover: false,
  dizzy: false,
  sinceClick: Infinity,
  crash: 'none',
  closePass: false,
  shipTraveling: false,
  shipFarSide: false,
  sinceArrival: Infinity,
  arrivalPlanet: null,
  focusPlanet: null,
  profileOpen: false,
  cometNear: false,
  sinceCometNear: Infinity,
  sinceTabReturn: Infinity,
  sinceStart: 0,
  tutorialWelcome: false,
  sinceLeave: Infinity,
  idleFor: 0,
}

/** Sem nada acontecendo por isto (s), o sol dorme (viajando). */
export const IDLE_SLEEP = 8
/** Tempo mínimo em cada humor (s), a não ser que entre um evento mais alto. */
export const MIN_DWELL = 1.2
/**
 * Os surpresos curtos (clique, cometa, aba) duram na prática pelo menos `MIN_DWELL`: o humor seguinte tem prioridade
 * menor e espera o mínimo. Estes valores dizem quando a situação deixa de pedir surpresa.
 */
export const CLICK_SURPRISE = 0.6
export const LEAVE_SAD = 1.5
export const ARRIVAL_ADMIRE = 1.5
export const ARRIVAL_WATCH = 4
export const COMET_SURPRISE = 0.8
export const TAB_SURPRISE = 0.8
export const TAB_HAPPY = 2.5
export const GREETING = 4

/** Prioridade: clique > trombada > tontura > hover > estilingue/raspão > nave > foco/seleção > cometa > aba > saída > saudação > idle. */
export const RANK = { click: 10, crash: 9, dizzy: 8.5, hover: 8, closePass: 7, ship: 6, focus: 5, comet: 4, tab: 3.5, leave: 3, greeting: 2, idle: 0 } as const

const at = (expression: SunExpression, target: MoodTarget, rank: number, planet: string | null = null): Mood => ({ expression, target, planet, rank })

/** O humor para a situação de agora, pela tabela e pela prioridade. */
export function moodFor(c: MoodContext): Mood {
  if (c.sinceClick < CLICK_SURPRISE) return at('surprised', 'viewer', RANK.click)
  if (c.crash === 'impact') return at('surprised', 'viewer', RANK.crash)
  if (c.crash === 'laugh') return at('happy', 'viewer', RANK.crash)
  if (c.dizzy) return at('tonto', 'viewer', RANK.dizzy)
  if (c.hover) return at('happy', 'mouse', RANK.hover)
  if (c.closePass) return at('surprised', 'ship', RANK.closePass)
  if (c.shipTraveling) return at(c.shipFarSide ? 'watching' : 'serious', 'ship', RANK.ship)
  if (c.arrivalPlanet && c.sinceArrival < ARRIVAL_ADMIRE) return at('admiring', 'planet', RANK.ship, c.arrivalPlanet)
  if (c.arrivalPlanet && c.sinceArrival < ARRIVAL_WATCH) return at('watching', 'ship', RANK.ship)
  if (c.focusPlanet) return at('admiring', 'planet', RANK.focus, c.focusPlanet)
  if (c.profileOpen) return at('happy', 'viewer', RANK.focus)
  if (c.cometNear) return at(c.sinceCometNear < COMET_SURPRISE ? 'surprised' : 'watching', 'comet', RANK.comet)
  if (c.sinceTabReturn < TAB_SURPRISE) return at('surprised', 'viewer', RANK.tab)
  if (c.sinceTabReturn < TAB_HAPPY) return at('happy', 'viewer', RANK.tab)
  if (c.sinceLeave < LEAVE_SAD) return at('sad', 'viewer', RANK.leave)
  if (c.sinceStart < GREETING || c.tutorialWelcome) return at('happy', 'viewer', RANK.greeting)
  if (c.idleFor >= IDLE_SLEEP) return at('viajando', 'drift', RANK.idle)
  return at('happy', 'viewer', RANK.idle)
}

/** Pares expressão × alvo que fazem sentido (o que `moodFor` pode devolver). */
const ALLOWED: Record<SunExpression, readonly MoodTarget[]> = {
  viajando: ['drift'],
  happy: ['viewer', 'mouse'],
  surprised: ['viewer', 'ship', 'comet'],
  serious: ['ship'],
  watching: ['ship', 'comet'],
  admiring: ['planet'],
  sad: ['viewer'],
  tonto: ['viewer'],
}

export function moodAllowed(m: Mood): boolean {
  return ALLOWED[m.expression].includes(m.target) && (m.target === 'planet') === (m.planet !== null)
}

export interface MoodState {
  mood: Mood
  /** s neste humor. */
  held: number
}

export const MOOD_AT_START: MoodState = { mood: moodFor(CALM), held: 0 }

const same = (a: Mood, b: Mood) => a.expression === b.expression && a.target === b.target && a.planet === b.planet

/** Segura cada humor pelo menos `MIN_DWELL` s; um evento mais alto passa na frente na hora. */
export function stepMood(s: MoodState, ctx: MoodContext, dt: number): MoodState {
  const next = moodFor(ctx)
  if (same(next, s.mood)) return { mood: next, held: s.held + dt }
  if (s.held >= MIN_DWELL || next.rank > s.mood.rank) return { mood: next, held: 0 }
  return { mood: s.mood, held: s.held + dt }
}

/** Uma linha da tabela, com uma situação de exemplo (a galeria `?preview=sun` mostra o humor de cada uma). */
export interface MoodRow {
  label: string
  context: Partial<MoodContext>
  expression: SunExpression
  target: MoodTarget
}

const AWAKE: Partial<MoodContext> = { sinceStart: 60, idleFor: 1 }

export const MOOD_TABLE: readonly MoodRow[] = [
  { label: 'Nada acontecendo (>8 s)', context: { sinceStart: 60, idleFor: 20 }, expression: 'viajando', target: 'drift' },
  { label: 'Primeira carga / boas-vindas', context: { sinceStart: 0.5, idleFor: 0 }, expression: 'happy', target: 'viewer' },
  { label: 'Girou demais (tonto)', context: { ...AWAKE, dizzy: true }, expression: 'tonto', target: 'viewer' },
  { label: 'Mouse em cima do sol', context: { ...AWAKE, hover: true }, expression: 'happy', target: 'mouse' },
  { label: 'Clique no sol', context: { ...AWAKE, sinceClick: 0.2, profileOpen: true }, expression: 'surprised', target: 'viewer' },
  { label: 'Painel do perfil aberto', context: { ...AWAKE, sinceClick: 2, profileOpen: true }, expression: 'happy', target: 'viewer' },
  { label: 'Nave viajando', context: { ...AWAKE, shipTraveling: true }, expression: 'serious', target: 'ship' },
  { label: 'Nave viajando bem de lado', context: { ...AWAKE, shipTraveling: true, shipFarSide: true }, expression: 'watching', target: 'ship' },
  { label: 'Estilingue / nave raspando', context: { ...AWAKE, shipTraveling: true, closePass: true }, expression: 'surprised', target: 'ship' },
  { label: 'Planeta selecionado ou em foco', context: { ...AWAKE, focusPlanet: 'planeta' }, expression: 'admiring', target: 'planet' },
  { label: 'Nave chegou num planeta', context: { ...AWAKE, sinceArrival: 0.5, arrivalPlanet: 'planeta' }, expression: 'admiring', target: 'planet' },
  { label: 'Nave chegou (depois)', context: { ...AWAKE, sinceArrival: 2.5, arrivalPlanet: 'planeta' }, expression: 'watching', target: 'ship' },
  { label: 'Cometa no periélio', context: { ...AWAKE, cometNear: true, sinceCometNear: 0.3 }, expression: 'surprised', target: 'comet' },
  { label: 'Cometa no periélio (depois)', context: { ...AWAKE, cometNear: true, sinceCometNear: 2 }, expression: 'watching', target: 'comet' },
  { label: 'Trombada na tela', context: { ...AWAKE, crash: 'impact' }, expression: 'surprised', target: 'viewer' },
  { label: 'Fala de desculpa da trombada', context: { ...AWAKE, crash: 'laugh' }, expression: 'happy', target: 'viewer' },
  { label: 'Quem interagia saiu', context: { ...AWAKE, sinceLeave: 0.5 }, expression: 'sad', target: 'viewer' },
  { label: 'Aba voltou (>10 s fora)', context: { sinceStart: 60, idleFor: 30, sinceTabReturn: 0.3 }, expression: 'surprised', target: 'viewer' },
  { label: 'Aba voltou (depois)', context: { sinceStart: 60, idleFor: 30, sinceTabReturn: 1.5 }, expression: 'happy', target: 'viewer' },
]
