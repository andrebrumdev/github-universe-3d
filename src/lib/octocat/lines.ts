import type { GuideEvent } from '../interaction'
import type { OctocatExpression } from './expression'

export type { OctocatExpression }

export interface OctocatLine {
  /** Evento do guia, 'presentation' para as falas livres do modo apresentação, 'play' para as do modo de foco na nave. */
  id: GuideEvent | 'presentation' | 'play'
  /** `{name}` vira o primeiro nome do perfil. */
  text: string
  once: boolean
  expression: OctocatExpression
}

export const LINES: Record<GuideEvent, OctocatLine> = {
  sun: { id: 'sun', text: 'Esse é o perfil GitHub de {name}!', once: false, expression: 'happy' },
  planet: { id: 'planet', text: 'Olha que legal esse repo aqui!', once: false, expression: 'surprised' },
  moon: { id: 'moon', text: 'Essa linguagem é importante nesse projeto!', once: false, expression: 'happy' },
  firstZoom: { id: 'firstZoom', text: 'Uau, dá pra ver bem mais de perto!', once: true, expression: 'surprised' },
  idle: { id: 'idle', text: 'Oi, tá aí?', once: true, expression: 'wink' },
  // boceja e encosta a nave na borda da tela (roteiro da quarta parede, lib/octocat/script)
  longIdle: { id: 'longIdle', text: 'Ô, dormiu? Clica num planeta aí.', once: true, expression: 'sleepy' },
  slingshot: { id: 'slingshot', text: 'Estilingue gravitacional!', once: true, expression: 'surprised' },
  // a cada trombada na tela (rara): a nave emite uma vez por trombada
  crash: { id: 'crash', text: 'Opa, foi mal, vim rápido demais.', once: false, expression: 'happy' },
}

export const LINE_DURATION_MS = 4000
export const IDLE_MS = 20_000
export const LONG_IDLE_MS = 60_000

export function pickLine(event: GuideEvent, seen: ReadonlySet<string>): OctocatLine | null {
  const line = LINES[event]
  return line.once && seen.has(line.id) ? null : line
}

/**
 * Falas curtas do modo de foco na nave, por peça tocada: cabeça (play), tentáculo (giggle), Clawd, bocal (engine) e
 * casco (ship); o parafuso do toque duplo (roll) e o Octocat tonto de tanto girar (dizzy). Sorteadas sem repetir a última do grupo (`pickPlayLine`).
 */
export const PLAY_LINES = {
  play: ['Ei! Isso faz cócegas!', 'Quer dar uma volta?', 'Gostou da minha nave?', 'Oi! Tô aqui dentro!', 'Cuidado com o vidro!'],
  giggle: ['Hihihi!', 'Ai, cócegas não!', 'Hahaha, para!', 'Esse tentáculo é sensível!'],
  clawd: ['Segura firme, Clawd!', 'O Clawd adora pular!', 'Opa, cuidado aí em cima!'],
  engine: ['Vrum vrum!', 'Motor quentinho!', 'Pronto pra decolar!'],
  ship: ['Gostou da minha nave?', 'Lataria novinha!', 'Pode girar à vontade!'],
  roll: ['Uhuuu!', 'Parafuso!', 'Iupiii!'],
  dizzy: ['Para, para… tô tonto!', 'O universo tá girando…', 'Acho que vou vomitar estrelas'],
} as const satisfies Record<string, readonly string[]>

export type PlayLineGroup = keyof typeof PLAY_LINES

/** Uma fala do grupo, sorteada por `rng`, nunca igual a `last` (a última dita). */
export function pickPlayLine(group: PlayLineGroup, last: string | null, rng: () => number): string {
  const all: readonly string[] = PLAY_LINES[group]
  const pool = last === null ? all : all.filter((text) => text !== last)
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]
}

export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? ''
}

export function formatLine(text: string, name: string): string {
  return text.replaceAll('{name}', firstName(name))
}
