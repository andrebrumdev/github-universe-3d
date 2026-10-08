import { commitsLabel, formatDate } from '@/lib/format'
import { useUniverse } from '@/store/universe'

export function ActivityTooltip() {
  const cell = useUniverse((s) => s.hoveredCell)
  if (!cell) return null
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-40 rounded-md border border-grid/40 bg-space/90 px-2 py-1 text-xs text-slate-100"
      style={{ left: cell.x + 12, top: cell.y + 12 }}
    >
      {formatDate(cell.date)} · {commitsLabel(cell.count)}
    </div>
  )
}
