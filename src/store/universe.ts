import { create } from 'zustand'
import { guideEventFor, type GuideEvent, type UniverseSelection } from '@/lib/interaction'
import { pickLine, type OctocatLine } from '@/lib/octocat/lines'

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
  select: (selection: UniverseSelection) => void
  clearSelection: () => void
  setHoveredCell: (cell: HoveredCell | null) => void
  emitGuide: (event: GuideEvent) => void
  dismissBubble: (seq: number) => void
}

export const useUniverse = create<UniverseState>()((set, get) => ({
  selection: { kind: 'none' },
  hoveredCell: null,
  zoomedOnce: false,
  bubble: null,
  seenLines: [],
  seq: 0,
  select: (selection) => {
    const { zoomedOnce } = get()
    const event = guideEventFor(selection, zoomedOnce)
    set({
      selection,
      hoveredCell: null,
      zoomedOnce: zoomedOnce || selection.kind === 'planet' || selection.kind === 'moon',
    })
    if (event) get().emitGuide(event)
  },
  clearSelection: () => set({ selection: { kind: 'none' }, hoveredCell: null }),
  setHoveredCell: (hoveredCell) => set({ hoveredCell }),
  emitGuide: (event) => {
    const { seenLines, seq } = get()
    const line = pickLine(event, new Set(seenLines))
    if (!line) return
    set({ bubble: { line, seq: seq + 1 }, seq: seq + 1, seenLines: line.once ? [...seenLines, line.id] : seenLines })
  },
  dismissBubble: (s) => {
    if (get().bubble?.seq === s) set({ bubble: null })
  },
}))
