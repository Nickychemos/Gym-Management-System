import { useState } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { fullDate, ksh } from '@/lib/format'
import {
  useCreateSubscription,
  useFreezeSubscription,
  useMembershipPlans,
  useRenewSubscription,
  useUnfreezeSubscription,
  useUpgradeSubscription,
} from '@/queries/members'

const FREEZE_REASONS = ['Vacation', 'Illness', 'Injury', 'Travel', 'Financial', 'Other']

const errToast =
  (toast: ReturnType<typeof useToast>['toast'], title: string) => (err: unknown) =>
    toast({ variant: 'error', title, description: err instanceof ApiError ? err.message : undefined })

/** Lifecycle buttons for a single subscription. Self-contained dialogs. */
export function SubscriptionLifecycle({
  subscription,
  status,
  member,
  currentPlan,
  currentEnd,
  size = 'sm',
}: {
  subscription: string
  status: string
  member: string
  currentPlan?: string
  currentEnd?: string | null
  size?: 'sm' | 'md'
}) {
  const { toast } = useToast()
  const [freezeOpen, setFreezeOpen] = useState(false)
  const [changeOpen, setChangeOpen] = useState(false)
  const renew = useRenewSubscription(member)
  const unfreeze = useUnfreezeSubscription(member)

  const busy = renew.isPending || unfreeze.isPending

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'Active' && (
        <Button variant="secondary" size={size} disabled={busy} onClick={() => setFreezeOpen(true)}>
          Freeze
        </Button>
      )}
      {status === 'Frozen' && (
        <Button
          variant="secondary"
          size={size}
          disabled={busy}
          onClick={() =>
            unfreeze.mutate(subscription, {
              onSuccess: () => toast({ variant: 'success', title: 'Resumed' }),
              onError: errToast(toast, 'Could not resume'),
            })
          }
        >
          Resume
        </Button>
      )}
      <Button
        variant="secondary"
        size={size}
        disabled={busy}
        onClick={() =>
          renew.mutate(subscription, {
            onSuccess: (r) => toast({ variant: 'success', title: 'Renewed', description: r.subscription }),
            onError: errToast(toast, 'Could not renew'),
          })
        }
      >
        Renew
      </Button>
      {(status === 'Active' || status === 'Frozen') && (
        <Button variant="secondary" size={size} disabled={busy} onClick={() => setChangeOpen(true)}>
          Change plan
        </Button>
      )}

      {freezeOpen && (
        <FreezeDialog subscription={subscription} member={member} onClose={() => setFreezeOpen(false)} />
      )}
      {changeOpen && (
        <ChangePlanDialog
          subscription={subscription}
          member={member}
          currentPlan={currentPlan}
          currentEnd={currentEnd}
          onClose={() => setChangeOpen(false)}
        />
      )}
    </div>
  )
}

function FreezeDialog({
  subscription,
  member,
  onClose,
}: {
  subscription: string
  member: string
  onClose: () => void
}) {
  const { toast } = useToast()
  const freeze = useFreezeSubscription(member)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('Travel')
  const [notes, setNotes] = useState('')

  function submit() {
    if (!start || !end) return toast({ variant: 'error', title: 'Pick start & end dates' })
    freeze.mutate(
      { subscription, freeze_start_date: start, freeze_end_date: end, reason, reason_notes: notes || undefined },
      {
        onSuccess: (r) => { toast({ variant: 'success', title: `Frozen ${r.freeze_days} days` }); onClose() },
        onError: errToast(toast, 'Could not freeze'),
      },
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Freeze subscription"
      widthClassName="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={freeze.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={freeze.isPending}>{freeze.isPending ? 'Freezing…' : 'Freeze'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>From</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Reason</Label>
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {FREEZE_REASONS.map((r) => <option key={r}>{r}</option>)}
          </Select>
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Dialog>
  )
}

function ChangePlanDialog({
  subscription,
  member,
  currentPlan,
  currentEnd,
  onClose,
}: {
  subscription: string
  member: string
  currentPlan?: string
  currentEnd?: string | null
  onClose: () => void
}) {
  const { toast } = useToast()
  const upgrade = useUpgradeSubscription(member)
  const { data: plans } = useMembershipPlans()
  const [plan, setPlan] = useState('')

  // Only other recurring membership tiers are valid change targets: drop the
  // current plan (changing to itself is a no-op) and Day Pass (a drop-in, not a
  // membership a member moves onto).
  const options = (plans ?? []).filter(
    (p) => p.name !== currentPlan && p.plan_type !== 'Day Pass',
  )

  function submit() {
    if (!plan) return toast({ variant: 'error', title: 'Pick a plan' })
    upgrade.mutate(
      { subscription, new_plan: plan },
      {
        onSuccess: (r) => {
          toast({
            variant: 'success',
            title: 'Plan change scheduled',
            description: `${plan} starts ${fullDate(r.start_date)}`,
          })
          onClose()
        },
        onError: errToast(toast, 'Could not change plan'),
      },
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Change plan"
      description="The new plan takes effect at the next renewal, so no paid days are lost."
      widthClassName="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={upgrade.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={upgrade.isPending || options.length === 0}>
            {upgrade.isPending ? 'Scheduling…' : 'Schedule change'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label>New plan</Label>
          <Select value={plan} onChange={(e) => setPlan(e.target.value)} autoFocus>
            <option value="">Select a plan…</option>
            {options.map((p) => (
              <option key={p.name} value={p.name}>{p.name} — {ksh(p.price)}</option>
            ))}
          </Select>
        </div>
        {options.length === 0 ? (
          <p className="text-small text-neutral-500">
            No other membership plans are available to change to.
          </p>
        ) : (
          <p className="text-small text-neutral-500">
            {currentEnd
              ? `The current plan stays active until it ends on ${fullDate(currentEnd)}; the new plan begins the next day.`
              : 'The new plan begins today.'}
          </p>
        )}
      </div>
    </Dialog>
  )
}

/** Sell a member their first subscription (shown when none is active). */
export function SubscribeButton({ member, size = 'sm' }: { member: string; size?: 'sm' | 'md' }) {
  const { toast } = useToast()
  const create = useCreateSubscription(member)
  const { data: plans } = useMembershipPlans()
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState('')

  function submit() {
    if (!plan) return toast({ variant: 'error', title: 'Pick a plan' })
    create.mutate(
      { member, membership_plan: plan },
      {
        onSuccess: () => { toast({ variant: 'success', title: 'Subscription started' }); setOpen(false); setPlan('') },
        onError: errToast(toast, 'Could not subscribe'),
      },
    )
  }

  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <Plus className="size-4" strokeWidth={2} />
        Add subscription
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title="Start a subscription"
          widthClassName="max-w-md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={create.isPending}>Cancel</Button>
              <Button onClick={submit} disabled={create.isPending}>{create.isPending ? 'Starting…' : 'Start'}</Button>
            </>
          }
        >
          <div>
            <Label>Plan</Label>
            <Select value={plan} onChange={(e) => setPlan(e.target.value)} autoFocus>
              <option value="">Select a plan…</option>
              {(plans ?? []).map((p) => (
                <option key={p.name} value={p.name}>{p.name} — {ksh(p.price)}</option>
              ))}
            </Select>
          </div>
        </Dialog>
      )}
    </>
  )
}
