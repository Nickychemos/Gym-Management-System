import { useState } from 'react'
import { Clock, Mail, Pencil, Plus, Send, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { dateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type ReportSchedule } from '@/lib/types'
import {
  useDeleteSchedule,
  useSaveSchedule,
  useScheduleOptions,
  useSchedules,
  useSendScheduleNow,
  useSetScheduleActive,
} from '@/queries/reports'

const PERIOD_LABELS: Record<string, string> = {
  this_month: 'This month',
  last_month: 'Last month',
  last_30_days: 'Last 30 days',
  this_quarter: 'This quarter',
  this_year: 'This year',
}

function hh(h: number) {
  return `${String(h).padStart(2, '0')}:00`
}

function cadence(s: ReportSchedule): string {
  const at = ` at ${hh(s.send_hour)}`
  if (s.frequency === 'Daily') return `Daily${at}`
  if (s.frequency === 'Weekly') return `Weekly on ${s.day_of_week}${at}`
  return `${s.frequency} on day ${s.day_of_month}${at}`
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-tiny font-medium transition-colors',
        active
          ? 'border-neutral-900 bg-neutral-900 text-white'
          : 'border-neutral-200 text-neutral-600 hover:border-neutral-300',
      )}
    >
      {children}
    </button>
  )
}

export function ScheduleManager() {
  const { data, isLoading } = useSchedules()
  const setActive = useSetScheduleActive()
  const del = useDeleteSchedule()
  const sendNow = useSendScheduleNow()
  const { toast } = useToast()
  const [dialog, setDialog] = useState<
    { schedule?: ReportSchedule } | null
  >(null)

  function fireNow(s: ReportSchedule) {
    sendNow.mutate(s.name, {
      onSuccess: (r) =>
        toast({
          variant: r.recipients ? 'success' : 'error',
          title: r.recipients
            ? `Sent to ${r.sent}/${r.recipients} recipient(s)`
            : 'No recipients for the selected role(s)',
        }),
      onError: (e) =>
        toast({
          variant: 'error',
          title: 'Could not send',
          description: e instanceof ApiError ? e.message : undefined,
        }),
    })
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-small text-neutral-500">
          Email reports to a role automatically on a schedule.
        </p>
        <Button size="sm" onClick={() => setDialog({})}>
          <Plus className="size-4" strokeWidth={2} />
          New schedule
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Mail}
            title="No scheduled reports"
            description="Create one to email a report to owners or managers on a cadence."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((s) => (
            <Card key={s.name}>
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-body font-medium text-neutral-900">
                      {s.title}
                    </span>
                    <Badge variant={s.is_active ? 'success' : 'neutral'}>
                      {s.is_active ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-tiny text-neutral-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" strokeWidth={2} />
                      {cadence(s)}
                    </span>
                    <span>{PERIOD_LABELS[s.period] ?? s.period}</span>
                    <span>To: {s.recipient_roles.join(', ') || '—'}</span>
                    <span className="uppercase">{s.formats.join(' · ')}</span>
                    {s.last_sent_on && <span>Last sent {dateTime(s.last_sent_on)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={sendNow.isPending}
                    onClick={() => fireNow(s)}
                  >
                    <Send className="size-3.5" strokeWidth={2} />
                    Send now
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setActive.mutate({ name: s.name, active: s.is_active ? 0 : 1 })
                    }
                  >
                    {s.is_active ? 'Pause' : 'Resume'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDialog({ schedule: s })}
                  >
                    <Pencil className="size-4" strokeWidth={2} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger-700 hover:bg-danger-50 hover:text-danger-700"
                    onClick={() => del.mutate(s.name)}
                  >
                    <Trash2 className="size-4" strokeWidth={2} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dialog && (
        <ScheduleDialog schedule={dialog.schedule} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}

export function ScheduleDialog({
  schedule,
  preset,
  onClose,
}: {
  schedule?: ReportSchedule
  preset?: { report_key?: string; period?: string; branch?: string | null }
  onClose: () => void
}) {
  const { data: opts } = useScheduleOptions()
  const save = useSaveSchedule()
  const { toast } = useToast()

  const [reportKey, setReportKey] = useState(
    schedule?.report_key ?? preset?.report_key ?? '',
  )
  const [frequency, setFrequency] = useState(schedule?.frequency ?? 'Monthly')
  const [dayOfWeek, setDayOfWeek] = useState(schedule?.day_of_week ?? 'Monday')
  const [dayOfMonth, setDayOfMonth] = useState(schedule?.day_of_month ?? 1)
  const [sendHour, setSendHour] = useState(schedule?.send_hour ?? 8)
  const [period, setPeriod] = useState(
    schedule?.period ?? preset?.period ?? 'last_month',
  )
  const [roles, setRoles] = useState<string[]>(schedule?.recipient_roles ?? [])
  const [formats, setFormats] = useState<string[]>(schedule?.formats ?? ['pdf'])

  function toggle(list: string[], v: string, set: (x: string[]) => void) {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  }

  function submit() {
    if (!reportKey) return toast({ variant: 'error', title: 'Pick a report' })
    if (roles.length === 0)
      return toast({ variant: 'error', title: 'Pick at least one recipient role' })
    save.mutate(
      {
        name: schedule?.name,
        report_key: reportKey,
        frequency,
        day_of_week: dayOfWeek,
        day_of_month: dayOfMonth,
        send_hour: sendHour,
        period,
        branch: schedule?.branch ?? preset?.branch ?? null,
        recipient_roles: roles,
        formats: formats.length ? formats : ['pdf'],
        is_active: schedule?.is_active ?? 1,
      },
      {
        onSuccess: () => {
          toast({ variant: 'success', title: schedule ? 'Schedule updated' : 'Schedule created' })
          onClose()
        },
        onError: (e) =>
          toast({
            variant: 'error',
            title: 'Could not save',
            description: e instanceof ApiError ? e.message : undefined,
          }),
      },
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={schedule ? 'Edit schedule' : 'New scheduled report'}
      widthClassName="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save schedule'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>Report</Label>
          <Select value={reportKey} onChange={(e) => setReportKey(e.target.value)}>
            <option value="">Select a report…</option>
            {(opts?.reports ?? []).map((r) => (
              <option key={r.key} value={r.key}>
                {r.title}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Frequency</Label>
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value as ReportSchedule['frequency'])}>
              {['Daily', 'Weekly', 'Monthly', 'Quarterly'].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </Select>
          </div>
          {frequency === 'Weekly' ? (
            <div>
              <Label>Day of week</Label>
              <Select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
                {(opts?.weekdays ?? []).map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </Select>
            </div>
          ) : frequency === 'Monthly' || frequency === 'Quarterly' ? (
            <div>
              <Label>Day of month</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Math.min(28, Math.max(1, Number(e.target.value))))}
              />
            </div>
          ) : (
            <div>
              <Label>Send hour</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={sendHour}
                onChange={(e) => setSendHour(Math.min(23, Math.max(0, Number(e.target.value))))}
              />
            </div>
          )}
        </div>

        {frequency !== 'Daily' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Send hour (0-23)</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={sendHour}
                onChange={(e) => setSendHour(Math.min(23, Math.max(0, Number(e.target.value))))}
              />
            </div>
            <div>
              <Label>Reporting period</Label>
              <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
                {(opts?.periods ?? []).map((p) => (
                  <option key={p} value={p}>
                    {PERIOD_LABELS[p] ?? p}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}
        {frequency === 'Daily' && (
          <div>
            <Label>Reporting period</Label>
            <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {(opts?.periods ?? []).map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABELS[p] ?? p}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div>
          <Label>Recipients (by role)</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {(opts?.roles ?? []).map((r) => (
              <Chip key={r} active={roles.includes(r)} onClick={() => toggle(roles, r, setRoles)}>
                {r}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <Label>Attach formats</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {(opts?.formats ?? ['pdf', 'csv', 'xlsx']).map((f) => (
              <Chip key={f} active={formats.includes(f)} onClick={() => toggle(formats, f, setFormats)}>
                {f.toUpperCase()}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
