import type { GuideEvent } from '../interaction'
import type { OctocatExpression } from './expression'

export type { OctocatExpression }

export interface OctocatLine {
  id: GuideEvent
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
  longIdle: { id: 'longIdle', text: 'Ei, se precisar de ajuda, é comigo!', once: true, expression: 'happy' },
}

export const LINE_DURATION_MS = 4000
export const IDLE_MS = 20_000
export const LONG_IDLE_MS = 60_000

export function pickLine(event: GuideEvent, seen: ReadonlySet<string>): OctocatLine | null {
  const line = LINES[event]
  return line.once && seen.has(line.id) ? null : line
}

export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? ''
}

export function formatLine(text: string, name: string): string {
  return text.replaceAll('{name}', firstName(name))
}
