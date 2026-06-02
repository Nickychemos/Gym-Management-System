import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarClock, Dumbbell, Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table'
import { Tabs } from '@/components/ui/tabs'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { type ClassScheduleRow, type ClassType } from '@/lib/types'
import {
  useClassSchedules,
  useSetClassScheduleActive,
  useSetClassTypeActive,
} from '@/queries/classes'
import { useClassTypes } from '@/queries/schedule'
import { ClassTypeDrawer } from './ClassTypeDrawer'
import { ScheduleDrawer } from './ScheduleDrawer'

const TABS = [
  { value: 'types', label: 'Class Types' },
  { value: 'schedules', label: 'Schedules' },
]

const INTENSITY_VARIANT: Record<string, NonNullable<BadgeProps['variant']>> = {
  Low: 'success',
  Moderate: 'info',
  High: 'danger',
  Variable: 'warning',
}

export default function ClassesPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'types'
  const [typeDrawer, setTypeDrawer] = useState<{ open: boolean; edit: ClassType | null }>({ open: false, edit: null })
  const [schedDrawer, setSchedDrawer] = useState<{ open: boolean; edit: ClassScheduleRow | null }>({ open: false, edit: null })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-display font-semibold tracking-tight text-neutral-900">Classes</h1>
          <p className="text-body text-neutral-500">Catalog & weekly timetable</p>
        </div>
        {tab === 'types' ? (
          <Button onClick={() => setTypeDrawer({ open: true, edit: null })}>
            <Plus className="size-4" strokeWidth={2} />
            New class type
          </Button>
        ) : (
          <Button onClick={() => setSchedDrawer({ open: true, edit: null })}>
            <Plus className="size-4" strokeWidth={2} />
            New schedule
          </Button>
        )}
      </div>

      <div className="mb-6">
        <Tabs tabs={TABS} value={tab} onValueChange={(v) => setParams({ tab: v })} />
      </div>

      {tab === 'types' ? (
        <TypesTab onEdit={(t) => setTypeDrawer({ open: true, edit: t })} onAdd={() => setTypeDrawer({ open: true, edit: null })} />
      ) : (
        <SchedulesTab onEdit={(s) => setSchedDrawer({ open: true, edit: s })} onAdd={() => setSchedDrawer({ open: true, edit: null })} />
      )}

      {typeDrawer.open && <ClassTypeDrawer edit={typeDrawer.edit} onClose={() => setTypeDrawer({ open: false, edit: null })} />}
      {schedDrawer.open && <ScheduleDrawer edit={schedDrawer.edit} onClose={() => setSchedDrawer({ open: false, edit: null })} />}
    </div>
  )
}

function TypesTab({ onEdit, onAdd }: { onEdit: (t: ClassType) => void; onAdd: () => void }) {
  const { toast } = useToast()
  const { data, isLoading, isError, refetch } = useClassTypes()
  const setActive = useSetClassTypeActive()

  if (isError) return <Card><EmptyState icon={Dumbbell} title="Couldn't load classes" action={<Button variant="secondary" onClick={() => refetch()}>Try again</Button>} /></Card>
  if (isLoading) return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-lg" />)}</div>
  if (!data || data.length === 0) return <Card><EmptyState icon={Dumbbell} title="No class types yet" description="Create the catalog your schedule is built from." action={<Button onClick={onAdd}><Plus className="size-4" strokeWidth={2} />New class type</Button>} /></Card>

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {data.map((c) => (
        <Card key={c.name} className={c.is_active ? '' : 'opacity-60'}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: c.display_color ?? '#5469d4' }} />
                <span className="text-h3 font-semibold text-neutral-900 truncate">{c.class_type_name}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onEdit(c)}>Edit</Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-neutral-600">
              <span>{c.default_duration_minutes} min</span>
              <span>{c.default_capacity} cap</span>
              {c.intensity_level && <Badge variant={INTENSITY_VARIANT[c.intensity_level] ?? 'neutral'}>{c.intensity_level}</Badge>}
            </div>
            <label className="mt-3 flex items-center gap-2 text-small text-neutral-600">
              <Checkbox
                checked={!!c.is_active}
                disabled={setActive.isPending}
                onChange={(e) => setActive.mutate({ name: c.name, active: e.target.checked }, { onError: (err) => toast({ variant: 'error', title: 'Failed', description: err instanceof ApiError ? err.message : undefined }) })}
              />
              Active
            </label>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function SchedulesTab({ onEdit, onAdd }: { onEdit: (s: ClassScheduleRow) => void; onAdd: () => void }) {
  const { toast } = useToast()
  const { data, isLoading, isError, refetch } = useClassSchedules()
  const setActive = useSetClassScheduleActive()

  return (
    <Card className="overflow-hidden">
      {isError ? (
        <EmptyState icon={CalendarClock} title="Couldn't load schedules" action={<Button variant="secondary" onClick={() => refetch()}>Try again</Button>} />
      ) : isLoading ? (
        <div className="divide-y divide-neutral-100">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="px-4 py-3"><Skeleton className="h-6 w-full" /></div>)}</div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No schedules yet" description="Add a recurring weekly class to populate the timetable." action={<Button onClick={onAdd}><Plus className="size-4" strokeWidth={2} />New schedule</Button>} />
      ) : (
        <Table>
          <THead>
            <TR><TH>Class</TH><TH>Trainer</TH><TH>Days</TH><TH>Time</TH><TH>Branch</TH><TH>Active</TH><TH className="text-right">Actions</TH></TR>
          </THead>
          <TBody>
            {data.map((s) => (
              <TR key={s.name}>
                <TD className="text-neutral-900">{s.class_type}</TD>
                <TD className="text-neutral-600">{s.trainer_name ?? '—'}</TD>
                <TD className="text-small text-neutral-600">{s.days.join(' · ')}</TD>
                <TD className="font-mono tabular-nums text-neutral-700">{s.start_time?.slice(0, 5)}</TD>
                <TD className="text-neutral-600">{s.branch ?? '—'}</TD>
                <TD>
                  <Checkbox
                    checked={!!s.is_active}
                    disabled={setActive.isPending}
                    onChange={(e) => setActive.mutate({ name: s.name, active: e.target.checked }, { onError: (err) => toast({ variant: 'error', title: 'Failed', description: err instanceof ApiError ? err.message : undefined }) })}
                  />
                </TD>
                <TD className="text-right"><Button variant="ghost" size="sm" onClick={() => onEdit(s)}>Edit</Button></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  )
}
