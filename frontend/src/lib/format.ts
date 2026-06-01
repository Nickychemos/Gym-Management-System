import { formatDistanceToNowStrict, isToday, isYesterday } from 'date-fns'

/** "KSh 6,000" — whole shillings, no decimals (gym prices are round). */
export function ksh(amount: number | null | undefined): string {
  const n = amount ?? 0
  return `KSh ${Math.round(n).toLocaleString('en-KE')}`
}

/** Compact money for KPI tiles: "KSh 3.8M", "KSh 142k", "KSh 900". */
export function kshCompact(amount: number | null | undefined): string {
  const n = amount ?? 0
  if (Math.abs(n) >= 1_000_000) return `KSh ${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `KSh ${Math.round(n / 1_000)}k`
  return `KSh ${Math.round(n).toLocaleString('en-KE')}`
}

/** Parse a Frappe datetime string (server local, no tz) into a Date. */
function parse(value: string | null | undefined): Date | null {
  if (!value) return null
  // Frappe emits "YYYY-MM-DD HH:MM:SS" — make it ISO-ish for the parser.
  const d = new Date(value.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d
}

/** "Today", "Yesterday", or "12d ago" — for last-visit style columns. */
export function relativeDay(value: string | null | undefined): string {
  const d = parse(value)
  if (!d) return '—'
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return `${formatDistanceToNowStrict(d)} ago`
}

/** "Today, 6:12 AM" style for timelines. */
export function dateTime(value: string | null | undefined): string {
  const d = parse(value)
  if (!d) return '—'
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  if (isToday(d)) return `Today, ${time}`
  if (isYesterday(d)) return `Yesterday, ${time}`
  return (
    d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) + `, ${time}`
  )
}

/** "Jan 2025" style for "member since". */
export function monthYear(value: string | null | undefined): string {
  const d = parse(value)
  if (!d) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

/** "Jun 22, 2026" */
export function fullDate(value: string | null | undefined): string {
  const d = parse(value)
  if (!d) return '—'
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
