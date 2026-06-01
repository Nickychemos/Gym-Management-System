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
import { type MemberRow } from '@/lib/types'
import { useMembers } from '@/queries/members'
import { useCreateRefund } from '@/queries/refunds'

const REASONS = [
  'Cancellation',
  'Service Not Delivered',
  'Duplicate Payment',
  'Goodwill',
  'Equipment Issue',
  'Member Request',
  'Other',
]
const SOURCES = ['Subscription', 'PT Package', 'Class Booking', 'POS Sale', 'Other']
const METHODS = ['M-Pesa B2C', 'Cash', 'Bank Transfer', 'Store Credit', 'Cheque']

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function NewRefundDrawer({ open, onClose, onCreated }: Props) {
  const { toast } = useToast()
  const create = useCreateRefund()
  const [member, setMember] = useState<MemberRow | null>(null)
  const [reason, setReason] = useState('Goodwill')
  const [source, setSource] = useState('Other')
  const [method, setMethod] = useState('Cash')
  const [original, setOriginal] = useState('')
  const [amount, setAmount] = useState('')
  const [phone, setPhone] = useState('')
  const [bank, setBank] = useState('')
  const [justification, setJustification] = useState('')

  function reset() {
    setMember(null)
    setReason('Goodwill')
    setSource('Other')
    setMethod('Cash')
    setOriginal('')
    setAmount('')
    setPhone('')
    setBank('')
    setJustification('')
  }

  function close() {
    reset()
    onClose()
  }

  function submit() {
    if (!member?.customer) {
      toast({ variant: 'error', title: 'Pick a member' })
      return
    }
    if (!Number(amount) || Number(amount) <= 0) {
      toast({ variant: 'error', title: 'Enter a refund amount' })
      return
    }
    if (!justification.trim()) {
      toast({ variant: 'error', title: 'Justification is required' })
      return
    }
    create.mutate(
      {
        customer: member.customer,
        refund_reason: reason,
        source_type: source,
        original_amount_paid: Number(original) || Number(amount),
        requested_refund_amount: Number(amount),
        refund_method: method,
        justification,
        refund_account_phone:
          method === 'M-Pesa B2C' ? phone || member.phone || undefined : undefined,
        bank_details: method === 'Bank Transfer' ? bank || undefined : undefined,
      },
      {
        onSuccess: (res) => {
          toast({
            variant: 'success',
            title: 'Refund created',
            description: `${res.refund} · Draft`,
          })
          reset()
          onCreated()
        },
        onError: (err) =>
          toast({
            variant: 'error',
            title: 'Could not create refund',
            description: err instanceof ApiError ? err.message : undefined,
          }),
      },
    )
  }

  return (
    <Drawer
      open={open}
      onClose={close}
      title="New Refund"
      description="Create a draft refund request, then move it through approval."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create draft'}
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Reason</Label>
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Source</Label>
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Original paid (KSh)</Label>
            <Input
              type="number"
              value={original}
              onChange={(e) => setOriginal(e.target.value)}
              placeholder="6000"
            />
          </div>
          <div>
            <Label>Refund amount (KSh)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="3000"
            />
          </div>
        </div>

        <div>
          <Label>Method</Label>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </div>

        {method === 'M-Pesa B2C' && (
          <div>
            <Label>Refund phone</Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={member?.phone ?? '2547…'}
            />
          </div>
        )}
        {method === 'Bank Transfer' && (
          <div>
            <Label>Bank details</Label>
            <Textarea value={bank} onChange={(e) => setBank(e.target.value)} />
          </div>
        )}

        <div>
          <Label>Justification</Label>
          <Textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Why is this refund warranted?"
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
