import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { type ClassScheduleRow } from '@/lib/types'
import {
  useClassFormOptions,
  useCreateClassSchedule,
  useUpdateClassSchedule,
} from '@/queries/classes'

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }

interface Props {
  edit?: ClassScheduleRow | null
  onClose: () => void
}

export function ScheduleDrawer({ edit, onClose }: Props) {
  const { toast } = useToast()
  const { data: options } = useClassFormOptions()
  const create = useCreateClassSchedule()
  const update = useUpdateClassSchedule()

  const [classType, setClassType] = useState(edit?.class_type ?? '')
  const [trainer, setTrainer] = useState(edit?.trainer ?? '')
  const [branch, setBranch] = useState(edit?.branch ?? '')
  const [time, setTime] = useState(edit?.start_time ? edit.start_time.slice(0, 5) : '06:00')
  const [days, setDays] = useState<string[]>(edit ? edit.days.map((d) => d.toLowerCase()) : ['mon', 'wed', 'fri'])
  const [room, setRoom] = useState(edit?.room ?? '')
  const [effectiveFrom, setEffectiveFrom] = useState(edit?.effective_from ?? '')

  const pending = create.isPending || update.isPending

  function toggleDay(d: string) {
    setDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]))
  }

  function submit() {
    if (!edit && !classType) return toast({ variant: 'error', title: 'Pick a class type' })
    if (!trainer) return toast({ variant: 'error', title: 'Pick a trainer' })
    if (!branch) return toast({ variant: 'error', title: 'Pick a branch' })
    if (days.length === 0) return toast({ variant: 'error', title: 'Pick at least one day' })

    const onErr = (err: unknown) =>
      toast({ variant: 'error', title: 'Could not save', description: err instanceof ApiError ? err.message : undefined })

    if (edit) {
      update.mutate(
        { name: edit.name, trainer, branch, room: room || undefined, start_time: `${time}:00`, days, effective_from: effectiveFrom || undefined },
        { onSuccess: () => { toast({ variant: 'success', title: 'Schedule updated' }); onClose() }, onError: onErr },
      )
    } else {
      create.mutate(
        { class_type: classType, trainer, branch, start_time: `${time}:00`, days, room: room || undefined, effective_from: effectiveFrom || undefined },
        { onSuccess: () => { toast({ variant: 'success', title: 'Schedule created — sessions generated' }); onClose() }, onError: onErr },
      )
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={edit ? 'Edit schedule' : 'New schedule'}
      description="A recurring weekly class. Sessions are generated automatically."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{pending ? 'Saving…' : edit ? 'Save' : 'Create'}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Label>Class type</Label>
          <Select value={classType} onChange={(e) => setClassType(e.target.value)} disabled={!!edit}>
            <option value="">Select…</option>
            {(options?.class_types ?? []).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Trainer</Label>
            <Select value={trainer} onChange={(e) => setTrainer(e.target.value)}>
              <option value="">Select…</option>
              {(options?.trainers ?? []).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </div>
          <div>
            <Label>Branch</Label>
            <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">Select…</option>
              {(options?.branches ?? []).map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Start time</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          <div><Label>Room</Label><Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Optional" /></div>
        </div>
        <div>
          <Label>Days</Label>
          <div className="flex gap-1.5">
            {DAYS.map((d) => {
              const on = days.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={cn(
                    'flex-1 rounded-md border py-1.5 text-tiny font-medium transition-colors',
                    on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50',
                  )}
                >
                  {DAY_LABEL[d]}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <Label>Effective from (optional)</Label>
          <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </div>
      </div>
    </Drawer>
  )
}
