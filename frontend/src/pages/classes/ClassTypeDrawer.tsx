import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { type ClassType } from '@/lib/types'
import { useCreateClassType, useUpdateClassType } from '@/queries/classes'

const INTENSITY = ['Low', 'Moderate', 'High', 'Variable']

interface Props {
  edit?: ClassType | null
  onClose: () => void
}

/** Mounted fresh per open (see call site). */
export function ClassTypeDrawer({ edit, onClose }: Props) {
  const { toast } = useToast()
  const create = useCreateClassType()
  const update = useUpdateClassType()

  const [name, setName] = useState(edit?.class_type_name ?? '')
  const [duration, setDuration] = useState(edit ? String(edit.default_duration_minutes) : '60')
  const [capacity, setCapacity] = useState(edit ? String(edit.default_capacity) : '20')
  const [color, setColor] = useState(edit?.display_color ?? '#5469d4')
  const [intensity, setIntensity] = useState(edit?.intensity_level ?? 'Moderate')
  const [shortCode, setShortCode] = useState(edit?.short_code ?? '')
  const [description, setDescription] = useState(edit?.description ?? '')

  const pending = create.isPending || update.isPending

  function submit() {
    if (!name.trim()) return toast({ variant: 'error', title: 'Name the class type' })
    const common = {
      default_duration_minutes: Number(duration) || 60,
      default_capacity: Number(capacity) || 20,
      display_color: color,
      intensity_level: intensity,
      short_code: shortCode || undefined,
      description: description || undefined,
    }
    const onErr = (err: unknown) =>
      toast({ variant: 'error', title: 'Could not save', description: err instanceof ApiError ? err.message : undefined })

    if (edit) {
      update.mutate({ name: edit.name, ...common }, { onSuccess: () => { toast({ variant: 'success', title: 'Class type updated' }); onClose() }, onError: onErr })
    } else {
      create.mutate({ class_type_name: name, ...common }, { onSuccess: () => { toast({ variant: 'success', title: 'Class type created' }); onClose() }, onError: onErr })
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={edit ? 'Edit class type' : 'New class type'}
      description="A type of class (Spin, Yoga…) with default duration and capacity."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{pending ? 'Saving…' : edit ? 'Save' : 'Create'}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spin" disabled={!!edit} autoFocus={!edit} />
          {edit && <p className="mt-1 text-tiny text-neutral-400">Name can't be changed after creation.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Duration (min)</Label><Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} /></div>
          <div><Label>Capacity</Label><Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Color</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 rounded-md border border-neutral-200 cursor-pointer" />
              <Input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1" />
            </div>
          </div>
          <div>
            <Label>Intensity</Label>
            <Select value={intensity} onChange={(e) => setIntensity(e.target.value)}>
              {INTENSITY.map((i) => <option key={i}>{i}</option>)}
            </Select>
          </div>
        </div>
        <div><Label>Short code</Label><Input value={shortCode} onChange={(e) => setShortCode(e.target.value)} placeholder="e.g. SPN" /></div>
        <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" /></div>
      </div>
    </Drawer>
  )
}
