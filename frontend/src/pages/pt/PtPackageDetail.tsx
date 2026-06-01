import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Plus, UserX, X } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { dateTime, fullDate, ksh } from '@/lib/format'
import { ptSessionVariant, ptVariant } from '@/lib/status'
import { type PtSession } from '@/lib/types'
import {
  useCancelSession,
  useCompleteSession,
  useNoShowSession,
  usePtPackage,
  useScheduleSession,
} from '@/queries/pt'

export default function PtPackageDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, isError, error, refetch } = usePtPackage(id)
  const [scheduleOpen, setScheduleOpen] = useState(false)

  return (
    <div>
      <Link
        to="/pt"
        className="inline-flex items-center gap-1.5 text-small text-neutral-500 hover:text-neutral-900 transition-colors mb-4"
      >
        <ArrowLeft className="size-3.5" strokeWidth={2} />
        PT Packages
      </Link>

      {isError ? (
        <Card>
          <EmptyState
            title="Couldn't load this package"
            description={error instanceof Error ? error.message : undefined}
            action={<Button variant="secondary" onClick={() => refetch()}>Try again</Button>}
          />
        </Card>
      ) : isLoading || !data ? (
        <DetailSkeleton />
      ) : (
        <>
          {/* Header */}
          <div className="flex items-start gap-4 mb-6">
            <Avatar name={data.package.customer_name} size="size-12" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-h2 font-semibold tracking-tight text-neutral-900">
                  {data.package.customer_name}
                </h1>
                <Badge variant={ptVariant(data.package.status)}>
                  {data.package.status}
                </Badge>
              </div>
              <p className="text-small text-neutral-500 mt-0.5">
                {data.package.trainer_name ?? '—'} ·{' '}
                <span className="font-mono">{data.package.name}</span>
              </p>
              <p className="text-tiny text-neutral-400 mt-0.5">
                {fullDate(data.package.start_date)} – {fullDate(data.package.expiry_date)}
              </p>
            </div>
            <Button
              onClick={() => setScheduleOpen(true)}
              disabled={data.package.sessions_remaining <= 0}
            >
              <Plus className="size-4" strokeWidth={2} />
              Schedule Session
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Burndown */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Burndown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-2">
                  <div className="text-display font-semibold tabular-nums text-neutral-900">
                    {data.package.sessions_remaining}
                  </div>
                  <div className="text-small text-neutral-500">
                    of {data.package.sessions_purchased} remaining
                  </div>
                </div>
                <div className="mt-3 h-2 rounded-full bg-neutral-100 overflow-hidden">
                  <div
                    className="h-full bg-brand-500"
                    style={{
                      width: `${
                        data.package.sessions_purchased
                          ? (data.package.sessions_used /
                              data.package.sessions_purchased) *
                            100
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-tiny text-neutral-500">
                  <span>{data.package.sessions_used} used</span>
                  <span>{ksh(data.package.price)}</span>
                </div>
                {data.package.goals && (
                  <p className="mt-4 text-small text-neutral-600 border-t border-neutral-100 pt-3">
                    {data.package.goals}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Sessions */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Sessions</CardTitle>
                <span className="text-small text-neutral-500">
                  {data.sessions.length} logged
                </span>
              </CardHeader>
              <CardContent className="px-0 py-0">
                {data.sessions.length === 0 ? (
                  <EmptyState
                    title="No sessions yet"
                    description="Schedule the first session to start the burndown."
                  />
                ) : (
                  <ul className="divide-y divide-neutral-100">
                    {data.sessions.map((s) => (
                      <SessionRow key={s.name} session={s} pkg={data.package.name} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <ScheduleDialog
        pkg={id!}
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
      />
    </div>
  )
}

function SessionRow({ session, pkg }: { session: PtSession; pkg: string }) {
  const { toast } = useToast()
  const complete = useCompleteSession(pkg)
  const noShow = useNoShowSession(pkg)
  const cancel = useCancelSession(pkg)
  const busy = complete.isPending || noShow.isPending || cancel.isPending

  const onErr = (err: unknown) =>
    toast({
      variant: 'error',
      title: 'Action failed',
      description: err instanceof ApiError ? err.message : undefined,
    })

  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-small text-neutral-900">
          {dateTime(session.scheduled_at)}
        </div>
        {session.workout_focus && (
          <div className="text-tiny text-neutral-500">{session.workout_focus}</div>
        )}
      </div>
      <Badge variant={ptSessionVariant(session.status)}>{session.status}</Badge>
      {session.status === 'Scheduled' && (
        <>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            aria-label="Complete"
            onClick={() =>
              complete.mutate(session.name, {
                onSuccess: () => toast({ variant: 'success', title: 'Session completed' }),
                onError: onErr,
              })
            }
          >
            <Check className="size-3.5" strokeWidth={2} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            aria-label="No-show"
            onClick={() =>
              noShow.mutate(session.name, {
                onSuccess: () => toast({ title: 'Marked no-show' }),
                onError: onErr,
              })
            }
          >
            <UserX className="size-3.5" strokeWidth={2} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            aria-label="Cancel"
            onClick={() =>
              cancel.mutate(session.name, {
                onSuccess: () => toast({ title: 'Session cancelled' }),
                onError: onErr,
              })
            }
          >
            <X className="size-3.5" strokeWidth={2} />
          </Button>
        </>
      )}
    </li>
  )
}

function ScheduleDialog({
  pkg,
  open,
  onClose,
}: {
  pkg: string
  open: boolean
  onClose: () => void
}) {
  const { toast } = useToast()
  const schedule = useScheduleSession(pkg)
  const [when, setWhen] = useState('')
  const [focus, setFocus] = useState('')

  function submit() {
    if (!when) return toast({ variant: 'error', title: 'Pick a date & time' })
    // datetime-local gives "YYYY-MM-DDTHH:MM" → Frappe datetime string.
    const scheduled_at = when.replace('T', ' ') + ':00'
    schedule.mutate(
      { scheduled_at, workout_focus: focus || undefined },
      {
        onSuccess: () => {
          toast({ variant: 'success', title: 'Session scheduled' })
          setWhen('')
          setFocus('')
          onClose()
        },
        onError: (err) =>
          toast({
            variant: 'error',
            title: 'Could not schedule',
            description: err instanceof ApiError ? err.message : undefined,
          }),
      },
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Schedule a session"
      widthClassName="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={schedule.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={schedule.isPending}>
            {schedule.isPending ? 'Scheduling…' : 'Schedule'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="when">Date &amp; time</Label>
          <Input
            id="when"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="focus">Workout focus (optional)</Label>
          <Input
            id="focus"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="e.g. Lower body"
          />
        </div>
      </div>
    </Dialog>
  )
}

function DetailSkeleton() {
  return (
    <div>
      <div className="flex items-start gap-4 mb-6">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-56 w-full rounded-lg" />
        <Skeleton className="h-56 w-full rounded-lg lg:col-span-2" />
      </div>
    </div>
  )
}
