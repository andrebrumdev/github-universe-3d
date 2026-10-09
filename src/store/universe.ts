import { create } from 'zustand'
import { guideEventFor, type GuideEvent, type UniverseSelection } from '@/lib/interaction'
import { pickLine, type OctocatExpression, type OctocatLine } from '@/lib/octocat/lines'

export interface HoveredCell {
  planet: string
  week: number
  day: number
  count: number
  date: string
  x: number
  y: number
}

export interface Bubble {
  line: OctocatLine
  seq: number
}

interface UniverseState {
  selection: UniverseSelection
  hoveredCell: HoveredCell | null
  zoomedOnce: boolean
  bubble: Bubble | null
  seenLines: string[]
  seq: number
  /** `quiet`: sem a fala do guia (quem seleciona narra por conta própria, como a apresentação). */
  select: (selection: UniverseSelection, options?: { quiet?: boolean }) => void
  clearSelection: () => void
  setHoveredCell: (cell: HoveredCell | null) => void
  emitGuide: (event: GuideEvent) => void
  /** Fala livre no balão do Octocat (`{name}` vira o primeiro nome do perfil). */
  say: (text: string, expression?: OctocatExpression) => void
  dismissBubble: (seq: number) => void
}

export const useUniverse = create<UniverseState>()((set, get) => ({
  selection: { kind: 'none' },
  hoveredCell: null,
  zoomedOnce: false,
  bubble: null,
  seenLines: [],
  seq: 0,
  select: (selection, options) => {
    const { zoomedOnce } = get()
    const event = guideEventFor(selection, zoomedOnce)
    set({
      selection,
      hoveredCell: null,
      zoomedOnce: zoomedOnce || selection.kind === 'planet' || selection.kind === 'moon',
    })
    if (event && !options?.quiet) get().emitGuide(event)
  },
  clearSelection: () => set({ selection: { kind: 'none' }, hoveredCell: null }),
  setHoveredCell: (hoveredCell) => set({ hoveredCell }),
  emitGuide: (event) => {
    const { seenLines, seq } = get()
    const line = pickLine(event, new Set(seenLines))
    if (!line) return
    set({ bubble: { line, seq: seq + 1 }, seq: seq + 1, seenLines: line.once ? [...seenLines, line.id] : seenLines })
  },
  say: (text, expression = 'happy') => {
    const seq = get().seq + 1
    set({ bubble: { line: { id: 'presentation', text, once: false, expression }, seq }, seq })
  },
  dismissBubble: (s) => {
    if (get().bubble?.seq === s) set({ bubble: null })
  },
}))
