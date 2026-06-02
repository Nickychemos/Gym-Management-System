import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Drawer } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { type PlanRow } from '@/lib/types'
import { useCreatePlan, useUpdatePlan } from '@/queries/settings'

const PLAN_TYPES = ['Day Pass', 'Weekly', 'Monthly', 'Quarterly', 'Half-Yearly', 'Annual', 'Family', 'Corporate', 'Class Pack', 'PT Package', 'Freeze']
const BILLING = ['One-Off', 'Pre-Pay', 'Recurring', 'Invoiced']

interface Props {
  edit?: PlanRow | null
  onClose: () => void
}

/** Mounted fresh per open (see call site) so state initialises from `edit`. */
export function PlanDrawer({ edit, onClose }: Props) {
  const { toast } = useToast()
  const create = useCreatePlan()
  const update = useUpdatePlan()

  const [name, setName] = useState(edit?.plan_name ?? '')
  const [type, setType] = useState(edit?.plan_type ?? 'Monthly')
  const [billing, setBilling] = useState(edit?.billing_frequency ?? 'Pre-Pay')
  const [price, setPrice] = useState(edit?.price ? String(edit.price) : '')
  const [duration, setDuration] = useState(edit ? String(edit.duration_days) : '30')
  const [sessions, setSessions] = useState(edit ? String(edit.session_count) : '0')
  const [autoRenew, setAutoRenew] = useState(!!edit?.auto_renew)
  const [freezeDays, setFreezeDays] = useState(edit ? String(edit.max_freeze_days_per_year) : '0')
  const [description, setDescription] = useState(edit?.description ?? '')

  const pending = create.isPending || update.isPending

  function submit() {
    if (!name.trim()) return toast({ variant: 'error', title: 'Name the plan' })
    if (!Number(price) && Number(price) !== 0) return toast({ variant: 'error', title: 'Enter a price' })
    const payload = {
      plan_name: name,
      plan_type: type,
      billing_frequency: billing,
      price: Number(price),
      duration_days: Number(duration) || 0,
      session_count: Number(sessions) || 0,
      auto_renew: autoRenew,
      max_freeze_days_per_year: Number(freezeDays) || 0,
      description: description || undefined,
    }
    const onErr = (err: unknown) =>
      toast({ variant: 'error', title: 'Could not save', description: err instanceof ApiError ? err.message : undefined })

    if (edit) {
      update.mutate({ name: edit.name, ...payload }, { onSuccess: () => { toast({ variant: 'success', title: 'Plan updated' }); onClose() }, onError: onErr })
    } else {
      create.mutate(payload, { onSuccess: () => { toast({ variant: 'success', title: 'Plan created' }); onClose() }, onError: onErr })
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={edit ? 'Edit plan' : 'New plan'}
      description="A membership, pass or package you sell."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{pending ? 'Saving…' : edit ? 'Save' : 'Create'}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Label>Plan name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Premium Monthly" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Type</Label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {PLAN_TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </div>
          <div>
            <Label>Billing</Label>
            <Select value={billing} onChange={(e) => setBilling(e.target.value)}>
              {BILLING.map((b) => <option key={b}>{b}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Price (KSh)</Label>
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>Duration (days)</Label>
            <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <div>
            <Label>Sessions</Label>
            <Input type="number" value={sessions} onChange={(e) => setSessions(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <div>
            <Label>Max freeze days/yr</Label>
            <Input type="number" value={freezeDays} onChange={(e) => setFreezeDays(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-small text-neutral-700 h-9">
            <Checkbox checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />
            Auto-renew
          </label>
        </div>
        <div>
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
        </div>
      </div>
    </Drawer>
  )
}
