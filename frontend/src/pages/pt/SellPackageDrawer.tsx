import { useState } from 'react'
import { Search } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/context/ToastContext'
import { useDebounce } from '@/hooks/useDebounce'
import { ApiError } from '@/lib/api'
import { ksh } from '@/lib/format'
import { type MemberRow } from '@/lib/types'
import { useMembers } from '@/queries/members'
import { usePtFormOptions, useSellPackage } from '@/queries/pt'

interface Props {
  open: boolean
  onClose: () => void
  onSold: (pkg: string) => void
}

export function SellPackageDrawer({ open, onClose, onSold }: Props) {
  const { toast } = useToast()
  const sell = useSellPackage()
  const { data: options } = usePtFormOptions()
  const [member, setMember] = useState<MemberRow | null>(null)
  const [trainer, setTrainer] = useState('')
  const [plan, setPlan] = useState('')
  const [goals, setGoals] = useState('')

  function reset() {
    setMember(null)
    setTrainer('')
    setPlan('')
    setGoals('')
  }
  function close() {
    reset()
    onClose()
  }

  const selectedPlan = options?.plans.find((p) => p.name === plan)

  function submit() {
    if (!member?.customer) return toast({ variant: 'error', title: 'Pick a member' })
    if (!trainer) return toast({ variant: 'error', title: 'Pick a trainer' })
    if (!plan) return toast({ variant: 'error', title: 'Pick a package' })
    sell.mutate(
      { customer: member.customer, trainer, membership_plan: plan, goals: goals || undefined },
      {
        onSuccess: (res) => {
          toast({
            variant: 'success',
            title: 'Package sold',
            description: `${res.package} · ${res.sessions} sessions`,
          })
          reset()
          onSold(res.package)
        },
        onError: (err) =>
          toast({
            variant: 'error',
            title: 'Could not sell package',
            description: err instanceof ApiError ? err.message : undefined,
          }),
      },
    )
  }

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Sell PT Package"
      description="Create an active personal-training package for a member."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={sell.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={sell.isPending}>
            {sell.isPending ? 'Selling…' : 'Sell package'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Label>Member</Label>
          {member ? (
            <div className="flex items-center gap-3 rounded-md border border-neutral-200 px-3 py-2">
              <Avatar name={member.full_name} size="size-8" />
              <span className="flex-1 min-w-0 text-small text-neutral-900 truncate">
                {member.full_name}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setMember(null)}>
                Change
              </Button>
            </div>
          ) : (
            <MemberPicker onPick={setMember} />
          )}
        </div>

        <div>
          <Label>Trainer</Label>
          <Select value={trainer} onChange={(e) => setTrainer(e.target.value)}>
            <option value="">Select a trainer…</option>
            {options?.trainers.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Package</Label>
          <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="">Select a package…</option>
            {options?.plans.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} — {p.sessions} sessions · {ksh(p.price)}
              </option>
            ))}
          </Select>
          {options && options.plans.length === 0 && (
            <p className="mt-1 text-tiny text-warning-700">
              No PT-type Membership Plans found. Create one first.
            </p>
          )}
        </div>

        {selectedPlan && (
          <div className="rounded-md bg-neutral-50 border border-neutral-200 px-3 py-2.5 text-small text-neutral-700">
            <span className="font-medium tabular-nums">{ksh(selectedPlan.price)}</span>
            {' for '}
            <span className="font-medium">{selectedPlan.sessions} sessions</span>
            <span className="text-neutral-400">
              {' '}
              ({ksh(selectedPlan.price / Math.max(1, selectedPlan.sessions))}/session)
            </span>
          </div>
        )}

        <div>
          <Label>Goals (optional)</Label>
          <Textarea
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            placeholder="e.g. Strength + conditioning over 12 weeks"
          />
        </div>
      </div>
    </Drawer>
  )
}

function MemberPicker({ onPick }: { onPick: (m: MemberRow) => void }) {
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 250)
  const { data } = useMembers({ search: debounced || undefined, pageLength: 6 })
  const results = debounced ? (data?.rows ?? []) : []

  return (
    <div>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400"
          strokeWidth={2}
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members…"
          className="pl-9"
        />
      </div>
      {results.length > 0 && (
        <ul className="mt-2 rounded-md border border-neutral-200 divide-y divide-neutral-100 max-h-52 overflow-y-auto">
          {results.map((m) => (
            <li key={m.member}>
              <button
                type="button"
                onClick={() => onPick(m)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-neutral-50 transition-colors"
              >
                <Avatar name={m.full_name} size="size-7" />
                <span className="flex-1 min-w-0 text-small text-neutral-900 truncate">
                  {m.full_name}
                </span>
                <span className="text-tiny text-neutral-400 font-mono">
                  {m.member}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
