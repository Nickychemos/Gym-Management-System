import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarClock, Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { dateTime, fullDate, ksh } from '@/lib/format'
import { opStatusVariant, priorityVariant, ticketVariant } from '@/lib/status'
import {
  useCreateSchedule,
  useEquipmentDetail,
  useMarkServiced,
} from '@/queries/equipment'
import { CreateTicketDrawer } from './CreateTicketDrawer'
import { TicketActions } from './Equipment'

const FREQUENCIES = ['Daily', 'Weekly', 'Bi-Weekly', 'Monthly', 'Quarterly', 'Half-Yearly', 'Annually']
const TASK_TYPES = ['Visual Inspection', 'Cleaning', 'Lubrication', 'Calibration', 'Replacement', 'Service', 'Other']

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, isError, error, refetch } = useEquipmentDetail(id)
  const [reportOpen, setReportOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)

  const asset = data?.asset
  const presetAsset = asset
    ? { name: asset.name, asset_name: asset.asset_name, location: asset.branch }
    : null

  return (
    <div>
      <Link to="/equipment" className="inline-flex items-center gap-1.5 text-small text-neutral-500 hover:text-neutral-900 transition-colors mb-4">
        <ArrowLeft className="size-3.5" strokeWidth={2} />
        Equipment
      </Link>

      {isError ? (
        <Card>
          <EmptyState title="Couldn't load this machine" description={error instanceof Error ? error.message : undefined} action={<Button variant="secondary" onClick={() => refetch()}>Try again</Button>} />
        </Card>
      ) : isLoading || !data || !asset ? (
        <DetailSkeleton />
      ) : (
        <>
          <div className="flex items-start gap-4 mb-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-h2 font-semibold tracking-tight text-neutral-900">{asset.asset_name}</h1>
                <Badge variant={opStatusVariant(asset.op_status)}>{asset.op_status}</Badge>
              </div>
              <p className="text-small text-neutral-500 mt-0.5">
                {asset.category ?? 'Equipment'}
                {asset.branch ? ` · ${asset.branch}` : ''}
                {' · '}
                <span className="font-mono">{asset.name}</span>
              </p>
              <p className="text-tiny text-neutral-400 mt-0.5">
                {asset.cost > 0 ? `${ksh(asset.cost)} · ` : ''}
                {asset.purchase_date ? `bought ${fullDate(asset.purchase_date)}` : ''}
              </p>
            </div>
            <Button variant="secondary" onClick={() => setReportOpen(true)}>
              <Plus className="size-4" strokeWidth={2} />
              Report Issue
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Maintenance schedules */}
            <Card>
              <CardHeader>
                <CardTitle>Maintenance Schedule</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setScheduleOpen(true)}>
                  <Plus className="size-3.5" strokeWidth={2} />
                  Add
                </Button>
              </CardHeader>
              <CardContent className="px-0 py-0">
                {data.schedules.length === 0 ? (
                  <EmptyState icon={CalendarClock} title="No schedules" description="Add a preventive-maintenance schedule." />
                ) : (
                  <ul className="divide-y divide-neutral-100">
                    {data.schedules.map((sc) => (
                      <ScheduleRow key={sc.name} schedule={sc} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Ticket history */}
            <Card>
              <CardHeader>
                <CardTitle>Issue History</CardTitle>
                <span className="text-small text-neutral-500">{data.tickets.length}</span>
              </CardHeader>
              <CardContent className="px-0 py-0">
                {data.tickets.length === 0 ? (
                  <EmptyState title="No issues logged" description="This machine has a clean record." />
                ) : (
                  <ul className="divide-y divide-neutral-100">
                    {data.tickets.map((t) => (
                      <li key={t.name} className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {t.out_of_service ? <span className="size-2 rounded-full bg-danger-500 shrink-0" /> : null}
                          <span className="flex-1 min-w-0 text-small text-neutral-900 truncate">{t.title}</span>
                          <Badge variant={priorityVariant(t.priority)}>{t.priority}</Badge>
                          <Badge variant={ticketVariant(t.status)}>{t.status}</Badge>
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-tiny text-neutral-400">{dateTime(t.reported_at)}</span>
                          <TicketActions ticket={t} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <CreateTicketDrawer open={reportOpen} onClose={() => setReportOpen(false)} presetAsset={presetAsset} />
      {asset && <ScheduleDialog asset={asset.name} freqs={FREQUENCIES} tasks={TASK_TYPES} open={scheduleOpen} onClose={() => setScheduleOpen(false)} />}
    </div>
  )
}

function ScheduleRow({ schedule }: { schedule: import('@/lib/types').MaintenanceSchedule }) {
  const { toast } = useToast()
  const serviced = useMarkServiced()
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-small text-neutral-900">{schedule.task_type ?? 'Service'}</div>
        <div className="text-tiny text-neutral-500">
          {schedule.frequency}
          {schedule.next_due_on ? ` · next ${fullDate(schedule.next_due_on)}` : ''}
        </div>
      </div>
      {schedule.due && <Badge variant="warning">Due</Badge>}
      <Button
        variant="secondary"
        size="sm"
        disabled={serviced.isPending}
        onClick={() =>
          serviced.mutate(schedule.name, {
            onSuccess: () => toast({ variant: 'success', title: 'Marked serviced' }),
            onError: (err) => toast({ variant: 'error', title: 'Failed', description: err instanceof ApiError ? err.message : undefined }),
          })
        }
      >
        Mark serviced
      </Button>
    </li>
  )
}

function ScheduleDialog({
  asset,
  freqs,
  tasks,
  open,
  onClose,
}: {
  asset: string
  freqs: string[]
  tasks: string[]
  open: boolean
  onClose: () => void
}) {
  const { toast } = useToast()
  const create = useCreateSchedule()
  const [frequency, setFrequency] = useState('Monthly')
  const [taskType, setTaskType] = useState('Service')
  const [lastDone, setLastDone] = useState('')

  function submit() {
    create.mutate(
      { asset, frequency, task_type: taskType, last_performed_on: lastDone || undefined },
      {
        onSuccess: () => {
          toast({ variant: 'success', title: 'Schedule added' })
          setLastDone('')
          onClose()
        },
        onError: (err) => toast({ variant: 'error', title: 'Could not add schedule', description: err instanceof ApiError ? err.message : undefined }),
      },
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add maintenance schedule"
      widthClassName="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>{create.isPending ? 'Adding…' : 'Add schedule'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Frequency</Label>
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              {freqs.map((f) => <option key={f}>{f}</option>)}
            </Select>
          </div>
          <div>
            <Label>Task</Label>
            <Select value={taskType} onChange={(e) => setTaskType(e.target.value)}>
              {tasks.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </div>
        </div>
        <div>
          <Label>Last performed (optional)</Label>
          <Input type="date" value={lastDone} onChange={(e) => setLastDone(e.target.value)} />
          <p className="mt-1 text-tiny text-neutral-400">Next due is computed from this + the frequency.</p>
        </div>
      </div>
    </Dialog>
  )
}

function DetailSkeleton() {
  return (
    <div>
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    </div>
  )
}
