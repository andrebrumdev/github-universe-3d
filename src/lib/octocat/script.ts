/**
 * Roteiro da quarta parede: o Octocat fala com quem está olhando (de preferência, um recrutador). Este módulo é puro
 * (imports relativos, sem DOM): decide, de um evento e da situação, a fala, a expressão e a ação da nave, com os
 * intervalos e as vezes únicas. Quem mede (URL, chegada no painel, inatividade, janela, zoom, fps) são hooks pequenos
 * que só mandam eventos (`Cue`); quem aplica a decisão é `store/fourthWall`.
 *
 * | Situação                         | O Octocat                                                              |
 * |----------------------------------|------------------------------------------------------------------------|
 * | recrutador olhando               | "Psiu, você é recrutador? …" (uma vez por visitante, quando livre)     |
 * | painel do repo favorito          | "Esse repo aqui é meu xodó, dá uma olhada."                            |
 * | painel do caderno de notas       | "Ah, esse é meu caderninho de ideias."                                 |
 * | muitos commits, zero star        | "{n} commits e zero star, mas o conteúdo é ouro."                      |
 * | repo vazio                       | "Esse aqui tá quietinho, hein."                                        |
 * | mouse parado (longa inatividade) | boceja e encosta a nave na borda: "Ô, dormiu? Clica num planeta aí."   |
 * | janela encolheu de repente       | se firma, surpreso: "Ei ei ei, tá apertando meu universo!"             |
 * | zoom forçando o limite           | fica tonto                                                             |
 * | fps liso por um tempo            | "Tá rodando liso aí? Capricharam na otimização, viu."                  |
 */
import type { CommitRef, Profile, RepoBase } from '../types'
import type { OctocatExpression } from './expression'

/** Fuso do dono do perfil: é nele que "3 da manhã" é conferido. */
export const PROFILE_TIME_ZONE = 'America/Sao_Paulo'

export const SCRIPT_LINES = {
  recruiterNight: 'Psiu, você é recrutador? Finge que não viu o commit das 3 da manhã.',
  recruiterClean: 'Psiu, você é recrutador? Pode olhar à vontade, tá tudo commitado.',
  favorite: 'Esse repo aqui é meu xodó, dá uma olhada.',
  notes: 'Ah, esse é meu caderninho de ideias.',
  underrated: '{commits} commits e zero star, mas o conteúdo é ouro.',
  empty: 'Esse aqui tá quietinho, hein.',
  squeeze: 'Ei ei ei, tá apertando meu universo!',
  smooth: 'Tá rodando liso aí? Capricharam na otimização, viu.',
} as const

/** Intervalo mínimo (ms) antes de uma fala espontânea (e entre duas falas de repo do roteiro). */
export const MIN_GAP_MS = 8000
/** Na primeira visita, depois deste tempo na página (ms), o Octocat arrisca que é um recrutador. */
export const RECRUITER_DWELL_MS = 25_000
/** Com o link ou a origem de recrutador, a fala espera a nave entrar na tela (ms depois da cena pronta). */
export const RECRUITER_LINK_DELAY_MS = 3000
/** Folga (ms) entre duas reações à janela apertada e entre duas tonturas de zoom. */
export const SHRINK_COOLDOWN_MS = 60_000
export const ZOOM_DIZZY_COOLDOWN_MS = 30_000
/** A partir de quantos commits, com zero star, o repo "tem conteúdo de ouro". */
export const UNDERRATED_MIN_COMMITS = 50
/** Madrugada: de 00:00 até antes desta hora, no fuso do perfil. */
export const LATE_NIGHT_END_HOUR = 5

// ─── Recrutador ──────────────────────────────────────────────────────────────────────────────────────────────────

/** `?ref=recrutador`, `?ref=recruiter` ou `?recrutador` no link. */
export function recruiterFromUrl(search: string): boolean {
  const q = new URLSearchParams(search)
  const ref = q.get('ref')?.toLowerCase()
  return ref === 'recrutador' || ref === 'recruiter' || q.has('recrutador')
}

/** LinkedIn (e o encurtador dele) e sites comuns de vaga. */
const RECRUITING_HOSTS = [/(^|\.)linkedin\.com$/, /(^|\.)lnkd\.in$/, /(^|\.)gupy\.(io|com\.br)$/, /(^|\.)greenhouse\.io$/, /(^|\.)lever\.co$/, /(^|\.)workable\.com$/]

export function recruiterFromReferrer(referrer: string): boolean {
  let host: string
  try {
    host = new URL(referrer).hostname.toLowerCase()
  } catch {
    return false
  }
  return RECRUITING_HOSTS.some((re) => re.test(host))
}

const hourFormats = new Map<string, Intl.DateTimeFormat>()

/** Hora (0–23) do instante no fuso; null quando a data não tem hora (só o dia) ou é inválida. */
export function localHour(iso: string, timeZone: string): number | null {
  if (!/T\d{2}:\d{2}/.test(iso)) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  let fmt = hourFormats.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' })
    hourFormats.set(timeZone, fmt)
  }
  const hour = fmt.formatToParts(date).find((p) => p.type === 'hour')
  return hour ? Number(hour.value) % 24 : null
}

/** Algum commit de madrugada (00:00–04:59 no fuso)? null quando nenhuma data tem hora: não dá para saber. */
export function hasLateNightCommit(dates: readonly string[], timeZone: string = PROFILE_TIME_ZONE): boolean | null {
  let known = false
  for (const iso of dates) {
    const hour = localHour(iso, timeZone)
    if (hour === null) continue
    known = true
    if (hour < LATE_NIGHT_END_HOUR) return true
  }
  return known ? false : null
}

interface CommitSource {
  profile: { lastCommit: CommitRef | null }
  repos: readonly { lastCommit: CommitRef | null }[]
}

/**
 * A fala do recrutador, verdadeira quando dá: o snapshot só guarda a hora do último commit de cada repo (a atividade
 * é por dia). Com um deles de madrugada, a piada; com horas e nenhuma de madrugada, a variante; sem hora nenhuma, a
 * piada (é só uma piada).
 */
export function recruiterLine(u: CommitSource, timeZone: string = PROFILE_TIME_ZONE): string {
  const dates = [u.profile.lastCommit, ...u.repos.map((r) => r.lastCommit)].filter((c): c is CommitRef => c !== null).map((c) => c.date)
  return hasLateNightCommit(dates, timeZone) === false ? SCRIPT_LINES.recruiterClean : SCRIPT_LINES.recruiterNight
}

// ─── Repos ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type RepoLike = Pick<RepoBase, 'name' | 'description' | 'stars' | 'totalCommits' | 'languages' | 'readme' | 'topics'>

/** O xodó: o primeiro repo fixado no perfil que virou planeta; sem fixados, o de mais stars (se algum tiver star). */
export function favoriteRepo(u: { profile: Pick<Profile, 'pinned'>; repos: readonly Pick<RepoBase, 'name' | 'stars'>[] }): string | null {
  const names = new Set(u.repos.map((r) => r.name))
  const pinned = u.profile.pinned?.find((name) => names.has(name))
  if (pinned) return pinned
  let best: Pick<RepoBase, 'name' | 'stars'> | null = null
  for (const r of u.repos) if (r.stars > 0 && (!best || r.stars > best.stars)) best = r
  return best?.name ?? null
}

/** Palavras que denunciam um caderno de notas/ideias (palavra inteira: "utils" não é "til"). */
const NOTES_WORD = /^(notes?|notas?|ideias?|ideas|til|journal|zettel\w*|caderno|brain|secondbrain)$/

/** Palavras de um texto: quebra camelCase e tudo que não é letra ou número; minúsculas. */
const words = (text: string) =>
  text
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)

export function isNotesRepo(repo: Pick<RepoBase, 'name' | 'description' | 'topics'>): boolean {
  return [repo.name, repo.description, ...(repo.topics ?? [])].some((text) => words(text).some((w) => NOTES_WORD.test(w)))
}

export type RepoLineKind = 'favorite' | 'notes' | 'underrated' | 'empty'

/** A fala do repo, pela prioridade: favorito > caderno > muitos commits sem star > vazio. */
export function repoLineKind(repo: RepoLike, favorite: string | null): RepoLineKind | null {
  if (repo.name === favorite) return 'favorite'
  if (isNotesRepo(repo)) return 'notes'
  if (repo.totalCommits >= UNDERRATED_MIN_COMMITS && repo.stars === 0) return 'underrated'
  if (repo.totalCommits <= 1 || (repo.languages.length === 0 && !repo.readme)) return 'empty'
  return null
}

const countFmt = new Intl.NumberFormat('pt-BR')

export function repoLineText(kind: RepoLineKind, repo: Pick<RepoBase, 'totalCommits'>): string {
  if (kind === 'underrated') return SCRIPT_LINES.underrated.replace('{commits}', countFmt.format(repo.totalCommits))
  return SCRIPT_LINES[kind]
}

const REPO_EXPRESSION: Record<RepoLineKind, OctocatExpression> = { favorite: 'happy', notes: 'thinking', underrated: 'wink', empty: 'neutral' }

// ─── Diretor ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Eventos medidos pelos hooks. `tick` só dá a vez às falas que esperam (recrutador, fps). */
export type Cue =
  | { type: 'recruiter'; text: string }
  | { type: 'arrival'; repo: RepoLike; favorite: string | null }
  | { type: 'longIdle' }
  | { type: 'wake' }
  | { type: 'shrink' }
  | { type: 'zoomDizzy'; text: string }
  | { type: 'smoothFps' }
  | { type: 'tick' }

export interface ScriptContext {
  /** ms (relógio monotônico). */
  now: number
  /** Tutorial ou apresentação na tela: o roteiro não fala por cima deles. */
  busy: boolean
  /** Há um balão na tela agora. */
  bubble: boolean
  /** A nave está parada no canto da escolta, sem nada selecionado (pode encostar na borda). */
  parked: boolean
  /** Movimento reduzido: as falas e expressões seguem, o movimento não. */
  reduced: boolean
  /** Painel aberto agora (`planet:<repo>`, `sun`…), ou null: a fala de repo guardada só sai com o painel dela aberto. */
  panelKey: string | null
}

export type ScriptAction = 'sleep' | 'wake' | 'brace' | 'dizzy'

export interface ScriptLine {
  text: string
  expression: OctocatExpression
}

export interface Directive {
  line: ScriptLine | null
  /** Fala do guia no lugar de `line` (a soneca usa a de longa inatividade, uma vez por sessão). */
  guide: 'longIdle' | null
  action: ScriptAction | null
  /** A ação pode mexer a nave (encostar, firmar, bambear)? Falso com movimento reduzido: só a expressão. */
  motion: boolean
  /** Lembrar o visitante (o recrutador não ouve a piada de novo noutra visita). */
  remember: 'recruiter' | null
}

export interface ScriptState {
  /** ms da última fala na tela (de qualquer um: guia, apresentação, roteiro). */
  lastLineAt: number
  /** ms da última fala de repo do roteiro. */
  lastRepoLineAt: number
  /** Falas de repo já ditas nesta sessão (`tipo:repo`). */
  spoken: Set<string>
  /** Fala do recrutador esperando a vez, e se já saiu. */
  recruiter: string | null
  recruiterDone: boolean
  fps: 'waiting' | 'pending' | 'done'
  lastShrinkAt: number
  lastZoomDizzyAt: number
  sleeping: boolean
  /** Fala de repo esperando o balão da vez sumir (a chegada não corta o guia, o estilingue nem o disco). */
  pendingRepo: { name: string; key: string; line: ScriptLine } | null
}

export function newScriptState(): ScriptState {
  return {
    lastLineAt: -Infinity,
    lastRepoLineAt: -Infinity,
    spoken: new Set(),
    recruiter: null,
    recruiterDone: false,
    fps: 'waiting',
    lastShrinkAt: -Infinity,
    lastZoomDizzyAt: -Infinity,
    sleeping: false,
    pendingRepo: null,
  }
}

/** Uma fala apareceu no balão (qualquer uma): conta para o intervalo das espontâneas. */
export function noteLine(s: ScriptState, now: number): void {
  s.lastLineAt = Math.max(s.lastLineAt, now)
}

const directive = (over: Partial<Directive>): Directive => ({ line: null, guide: null, action: null, motion: false, remember: null, ...over })

/** Livre para uma fala espontânea: fora do tutorial/apresentação, sem balão e com o intervalo cumprido. */
const isFree = (s: ScriptState, c: ScriptContext) => !c.busy && !c.bubble && c.now - s.lastLineAt >= MIN_GAP_MS

/** Sai a fala de repo guardada (ela já gastou a vez e o intervalo na chegada). */
function sayRepo(s: ScriptState, c: ScriptContext, pending: NonNullable<ScriptState['pendingRepo']>): Directive {
  s.pendingRepo = null
  s.spoken.add(pending.key)
  s.lastRepoLineAt = c.now
  noteLine(s, c.now)
  return directive({ line: pending.line })
}

/**
 * As falas na fila, uma por vez: primeiro a de repo guardada (é resposta à chegada: sai assim que o balão some, sem o
 * intervalo das espontâneas, e cai fora se o painel dela fechou), depois as espontâneas, recrutador antes do fps.
 */
function flush(s: ScriptState, c: ScriptContext): Directive | null {
  const pending = s.pendingRepo
  if (pending && c.panelKey !== `planet:${pending.name}`) s.pendingRepo = null
  else if (pending && !c.busy && !c.bubble) return sayRepo(s, c, pending)
  if (!isFree(s, c)) return null
  if (s.recruiter !== null) {
    const text = s.recruiter
    s.recruiter = null
    s.recruiterDone = true
    noteLine(s, c.now)
    const expression: OctocatExpression = text === SCRIPT_LINES.recruiterClean ? 'happy' : 'wink'
    return directive({ line: { text, expression }, remember: 'recruiter' })
  }
  if (s.fps === 'pending') {
    s.fps = 'done'
    noteLine(s, c.now)
    return directive({ line: { text: SCRIPT_LINES.smooth, expression: 'wink' } })
  }
  return null
}

/**
 * Decide o que fazer com um evento. Muda `s` no lugar (filas, vezes únicas, folgas). Reações a uma ação direta (painel
 * aberto, janela apertada, zoom) não esperam o intervalo das espontâneas, mas nunca falam por cima do tutorial ou da
 * apresentação; as espontâneas (recrutador, fps) esperam a vez na fila.
 */
export function direct(s: ScriptState, cue: Cue, c: ScriptContext): Directive | null {
  const motion = !c.reduced
  switch (cue.type) {
    case 'recruiter':
      if (s.recruiterDone) return null
      s.recruiter = cue.text
      return flush(s, c)
    case 'smoothFps':
      if (s.fps !== 'waiting') return flush(s, c)
      s.fps = 'pending'
      return flush(s, c)
    case 'tick':
      return flush(s, c)
    case 'arrival': {
      if (c.busy) return null
      const kind = repoLineKind(cue.repo, cue.favorite)
      if (!kind) return null
      const key = `${kind}:${cue.repo.name}`
      if (s.spoken.has(key) || c.now - s.lastRepoLineAt < MIN_GAP_MS) return null
      const pending = { name: cue.repo.name, key, line: { text: repoLineText(kind, cue.repo), expression: REPO_EXPRESSION[kind] } }
      // outra fala no balão (o guia de "Olha que legal…", o estilingue, o disco): espera ela sumir em vez de cortá-la
      if (c.bubble) {
        s.pendingRepo = pending
        return null
      }
      return sayRepo(s, c, pending)
    }
    case 'longIdle': {
      if (c.busy || !c.parked || s.sleeping) return null
      s.sleeping = true
      const speak = isFree(s, c)
      if (speak) noteLine(s, c.now)
      return directive({ action: 'sleep', guide: speak ? 'longIdle' : null, motion })
    }
    case 'wake':
      if (!s.sleeping) return null
      s.sleeping = false
      return directive({ action: 'wake', motion })
    case 'shrink':
      if (c.now - s.lastShrinkAt < SHRINK_COOLDOWN_MS) return null
      s.lastShrinkAt = c.now
      // o susto acorda
      s.sleeping = false
      if (!c.busy) noteLine(s, c.now)
      return directive({ action: 'brace', motion, line: c.busy ? null : { text: SCRIPT_LINES.squeeze, expression: 'surprised' } })
    case 'zoomDizzy':
      if (c.now - s.lastZoomDizzyAt < ZOOM_DIZZY_COOLDOWN_MS) return null
      s.lastZoomDizzyAt = c.now
      if (!c.busy) noteLine(s, c.now)
      return directive({ action: 'dizzy', motion, line: c.busy ? null : { text: cue.text, expression: 'dizzy' } })
  }
}
