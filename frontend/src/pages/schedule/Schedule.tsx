import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useBranch } from '@/context/BranchContext'
import { cn } from '@/lib/utils'
import { fullDate } from '@/lib/format'
import { type ScheduleSession } from '@/lib/types'
import { useWeekSchedule } from '@/queries/schedule'
import { BookingModal } from './BookingModal'

/** Shift a YYYY-MM-DD string by n days, returning YYYY-MM-DD. */
function shiftDate(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function SchedulePage() {
  const [params, setParams] = useSearchParams()
  const week = params.get('week') ?? undefined
  const [openSession, setOpenSession] = useState<string | null>(null)

  const { branchParam } = useBranch()
  const { data, isLoading, isError, error, refetch, isFetching } =
    useWeekSchedule(week, branchParam)

  function setWeek(value?: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set('week', value)
      else next.delete('week')
      return next
    })
  }

  const sessions = data?.sessions ?? []
  const days = data?.days ?? []

  // Distinct time rows, sorted; index sessions by day+time for cell lookup.
  const times = [...new Set(sessions.map((s) => s.time_label))].sort()
  const cell = new Map<string, ScheduleSession[]>()
  for (const s of sessions) {
    const key = `${s.day_index}|${s.time_label}`
    const arr = cell.get(key)
    if (arr) arr.push(s)
    else cell.set(key, [s])
  }

  const todayIso = new Date().toISOString().slice(0, 10)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-display font-semibold tracking-tight text-neutral-900">
            Schedule
          </h1>
          <p className="text-body text-neutral-500">
            {data
              ? `${fullDate(data.week_start)} – ${fullDate(data.week_end)}`
              : 'Loading…'}
            {isFetching && !isLoading ? ' · refreshing…' : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" onClick={() => setWeek(undefined)}>
            Today
          </Button>
          <Button
            variant="secondary"
            size="sm"
            aria-label="Previous week"
            onClick={() => setWeek(shiftDate(data?.week_start ?? todayIso, -7))}
            disabled={!data}
          >
            <ChevronLeft className="size-4" strokeWidth={2} />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            aria-label="Next week"
            onClick={() => setWeek(shiftDate(data?.week_start ?? todayIso, 7))}
            disabled={!data}
          >
            <ChevronRight className="size-4" strokeWidth={2} />
          </Button>
        </div>
      </div>

      {isError ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="Couldn't load the schedule"
            description={error instanceof Error ? error.message : undefined}
            action={
              <Button variant="secondary" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : isLoading || !data ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="No classes this week"
            description="Sessions are generated from active Class Schedules. Set one up under Classes."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              {/* Day header row */}
              <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-neutral-200 bg-neutral-50/60">
                <div />
                {days.map((d) => {
                  const isToday = d.date === todayIso
                  return (
                    <div
                      key={d.date}
                      className={cn(
                        'px-2 py-2.5 text-center border-l border-neutral-100',
                        isToday && 'bg-brand-50',
                      )}
                    >
                      <div
                        className={cn(
                          'text-tiny font-medium uppercase tracking-wide',
                          isToday ? 'text-brand-700' : 'text-neutral-500',
                        )}
                      >
                        {d.label}
                      </div>
                      <div className="text-small tabular-nums text-neutral-700">
                        {Number(d.date.slice(8, 10))}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Time rows */}
              {times.map((time) => (
                <div
                  key={time}
                  className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-neutral-100 last:border-b-0"
                >
                  <div className="px-2 py-2 text-tiny font-mono tabular-nums text-neutral-500 text-right">
                    {time}
                  </div>
                  {days.map((d) => {
                    const items = cell.get(`${d.weekday}|${time}`) ?? []
                    return (
                      <div
                        key={d.date}
                        className="border-l border-neutral-100 p-1 space-y-1 min-h-12"
                      >
                        {items.map((s) => (
                          <SessionChip
                            key={s.name}
                            session={s}
                            onClick={() => setOpenSession(s.name)}
                          />
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <BookingModal
        session={openSession}
        onClose={() => setOpenSession(null)}
      />
    </div>
  )
}

function SessionChip({
  session,
  onClick,
}: {
  session: ScheduleSession
  onClick: () => void
}) {
  const pct = session.capacity ? (session.booked / session.capacity) * 100 : 0
  const full = session.spots_remaining <= 0
  const cancelled = session.status === 'Cancelled'

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ borderLeftColor: session.color }}
      className={cn(
        'w-full text-left rounded-md border border-neutral-200 border-l-[3px]',
        'bg-white px-2 py-1.5 hover:bg-neutral-50 transition-colors',
        cancelled && 'opacity-50',
      )}
    >
      <div className="flex items-center gap-1">
        <span
          className={cn(
            'text-tiny font-medium truncate',
            cancelled ? 'text-neutral-500 line-through' : 'text-neutral-900',
          )}
        >
          {session.class_type}
        </span>
        {full && !cancelled && (
          <span className="size-1.5 rounded-full bg-danger-500 shrink-0" />
        )}
      </div>
      {session.trainer && (
        <div className="text-[10px] text-neutral-500 truncate">
          {session.trainer}
        </div>
      )}
      <div className="mt-1 flex items-center gap-1.5">
        <div className="h-1 flex-1 rounded-full bg-neutral-100 overflow-hidden">
          <div
            className={cn(
              'h-full',
              pct >= 100
                ? 'bg-danger-500'
                : pct >= 75
                  ? 'bg-warning-500'
                  : 'bg-brand-500',
            )}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <span className="text-[10px] tabular-nums text-neutral-500">
          {session.booked}/{session.capacity}
        </span>
      </div>
    </button>
  )
}
