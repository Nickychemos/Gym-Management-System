import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { fullDate, ksh } from '@/lib/format'
import { isManager } from '@/lib/roles'
import { type MembershipPlanOption } from '@/lib/types'
import {
  useCreateSubscription,
  useFreezeSubscription,
  useMembershipPlans,
  useRemoveSubscription,
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
  currentPrice,
  size = 'sm',
}: {
  subscription: string
  status: string
  member: string
  currentPlan?: string
  currentEnd?: string | null
  currentPrice?: number
  size?: 'sm' | 'md'
}) {
  const { toast } = useToast()
  const { state } = useAuth()
  const [freezeOpen, setFreezeOpen] = useState(false)
  const [changeDir, setChangeDir] = useState<'up' | 'down' | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)
  const renew = useRenewSubscription(member)
  const unfreeze = useUnfreezeSubscription(member)
  const { data: plans } = useMembershipPlans()

  const canRemove =
    state.status === 'authenticated' &&
    isManager(state.roles, state.isAdmin)

  const busy = renew.isPending || unfreeze.isPending

  // Tier direction is by catalog price (the current plan's listed price, falling
  // back to what this member paid if the plan has since been deactivated). Day
  // Pass and the current plan itself are never change targets.
  const basePrice =
    plans?.find((p) => p.name === currentPlan)?.price ?? currentPrice ?? null
  const targets = (plans ?? []).filter(
    (p) => p.name !== currentPlan && p.plan_type !== 'Day Pass',
  )
  const higher =
    basePrice == null
      ? []
      : targets
          .filter((p) => p.price > basePrice)
          .sort((a, b) => a.price - b.price)
  const lower =
    basePrice == null
      ? []
      : targets
          .filter((p) => p.price < basePrice)
          .sort((a, b) => b.price - a.price)
  const canChange = status === 'Active' || status === 'Frozen'

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
      {canChange && higher.length > 0 && (
        <Button variant="secondary" size={size} disabled={busy} onClick={() => setChangeDir('up')}>
          Upgrade
        </Button>
      )}
      {canChange && lower.length > 0 && (
        <Button variant="secondary" size={size} disabled={busy} onClick={() => setChangeDir('down')}>
          Downgrade
        </Button>
      )}
      {canRemove && (
        <Button
          variant="ghost"
          size={size}
          disabled={busy}
          onClick={() => setRemoveOpen(true)}
          className="text-danger-700 hover:bg-danger-50 hover:text-danger-700"
        >
          <Trash2 className="size-4" strokeWidth={2} />
          Remove
        </Button>
      )}

      {freezeOpen && (
        <FreezeDialog subscription={subscription} member={member} onClose={() => setFreezeOpen(false)} />
      )}
      {removeOpen && (
        <RemoveSubscriptionDialog
          subscription={subscription}
          member={member}
          onClose={() => setRemoveOpen(false)}
        />
      )}
      {changeDir && (
        <ChangePlanDialog
          subscription={subscription}
          member={member}
          direction={changeDir}
          options={changeDir === 'up' ? higher : lower}
          currentEnd={currentEnd}
          onClose={() => setChangeDir(null)}
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

function RemoveSubscriptionDialog({
  subscription,
  member,
  onClose,
}: {
  subscription: string
  member: string
  onClose: () => void
}) {
  const { toast } = useToast()
  const remove = useRemoveSubscription(member)

  function submit() {
    remove.mutate(subscription, {
      onSuccess: () => {
        toast({ variant: 'success', title: 'Subscription removed' })
        onClose()
      },
      onError: errToast(toast, 'Could not remove'),
    })
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Remove subscription"
      widthClassName="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={remove.isPending}>Cancel</Button>
          <Button variant="danger" onClick={submit} disabled={remove.isPending}>
            {remove.isPending ? 'Removing…' : 'Remove'}
          </Button>
        </>
      }
    >
      <p className="text-small text-neutral-600">
        This permanently deletes the subscription and leaves no trace in history.
        Use it only for entries added by mistake. If a payment, invoice, booking
        or visit is attached, the system will block this so you refund or cancel
        instead.
      </p>
    </Dialog>
  )
}

function ChangePlanDialog({
  subscription,
  member,
  direction,
  options,
  currentEnd,
  onClose,
}: {
  subscription: string
  member: string
  direction: 'up' | 'down'
  options: MembershipPlanOption[]
  currentEnd?: string | null
  onClose: () => void
}) {
  const { toast } = useToast()
  const upgrade = useUpgradeSubscription(member)
  const [plan, setPlan] = useState('')

  const verb = direction === 'up' ? 'Upgrade' : 'Downgrade'

  function submit() {
    if (!plan) return toast({ variant: 'error', title: 'Pick a plan' })
    upgrade.mutate(
      { subscription, new_plan: plan },
      {
        onSuccess: (r) => {
          toast({
            variant: 'success',
            title: `${verb} scheduled`,
            description: `${plan} starts ${fullDate(r.start_date)}`,
          })
          onClose()
        },
        onError: errToast(toast, `Could not ${verb.toLowerCase()}`),
      },
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${verb} plan`}
      description="The new plan takes effect at the next renewal, so no paid days are lost."
      widthClassName="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={upgrade.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={upgrade.isPending || options.length === 0}>
            {upgrade.isPending ? 'Scheduling…' : `Schedule ${verb.toLowerCase()}`}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label>{direction === 'up' ? 'Upgrade to' : 'Downgrade to'}</Label>
          <Select value={plan} onChange={(e) => setPlan(e.target.value)} autoFocus>
            <option value="">Select a plan…</option>
            {options.map((p) => (
              <option key={p.name} value={p.name}>{p.name} — {ksh(p.price)}</option>
            ))}
          </Select>
        </div>
        <p className="text-small text-neutral-500">
          {currentEnd
            ? `The current plan stays active until it ends on ${fullDate(currentEnd)}; the new plan begins the next day.`
            : 'The new plan begins today.'}
        </p>
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
