const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const countFmt = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const relFmt = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso))
}

export function formatCount(n: number): string {
  return countFmt.format(n)
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
]

export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relFmt.format(-Math.floor(seconds / size), unit)
  }
  return 'agora mesmo'
}

export function commitsLabel(n: number): string {
  return n === 1 ? '1 commit' : `${n} commits`
}
