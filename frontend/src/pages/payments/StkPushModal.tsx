import { useState } from 'react'
import { Search } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/context/ToastContext'
import { useDebounce } from '@/hooks/useDebounce'
import { ApiError } from '@/lib/api'
import { type MemberRow } from '@/lib/types'
import { useMembers } from '@/queries/members'
import { useSendStkPush } from '@/queries/payments'

interface Props {
  open: boolean
  onClose: () => void
}

export function StkPushModal({ open, onClose }: Props) {
  const { toast } = useToast()
  const [picked, setPicked] = useState<MemberRow | null>(null)
  const [amount, setAmount] = useState('')
  const [phone, setPhone] = useState('')
  const send = useSendStkPush()

  function reset() {
    setPicked(null)
    setAmount('')
    setPhone('')
  }

  function close() {
    reset()
    onClose()
  }

  function submit() {
    if (!picked?.customer) return
    const amt = Number(amount)
    if (!amt || amt <= 0) {
      toast({ variant: 'error', title: 'Enter a valid amount' })
      return
    }
    send.mutate(
      {
        customer: picked.customer,
        amount: amt,
        phone_number: phone || picked.phone || '',
        account_reference: picked.member,
      },
      {
        onSuccess: (res) => {
          toast({
            variant: res.sent ? 'success' : 'info',
            title: res.sent
              ? 'STK push sent'
              : 'Recorded (M-Pesa not configured)',
            description: res.sent
              ? `Prompt sent to ${phone || picked.phone}`
              : res.reason,
          })
          close()
        },
        onError: (err) =>
          toast({
            variant: 'error',
            title: 'STK push failed',
            description: err instanceof ApiError ? err.message : undefined,
          }),
      },
    )
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Charge a member"
      description="Send an M-Pesa STK push prompt to the member's phone."
      widthClassName="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={send.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={send.isPending || !picked} data-testid="stk-submit">
            {send.isPending ? 'Sending…' : 'Send STK Push'}
          </Button>
        </>
      }
    >
      {picked ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-md border border-neutral-200 px-3 py-2">
            <Avatar name={picked.full_name} size="size-8" />
            <div className="flex-1 min-w-0">
              <div className="text-small font-medium text-neutral-900 truncate">
                {picked.full_name}
              </div>
              <div className="text-tiny text-neutral-500 font-mono">
                {picked.member}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
              Change
            </Button>
          </div>

          <div>
            <Label htmlFor="amt">Amount (KSh)</Label>
            <Input
              id="amt"
              type="number"
              inputMode="numeric"
              autoFocus
              placeholder="6000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              placeholder={picked.phone ?? '2547…'}
              value={phone || picked.phone || ''}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <MemberPicker onPick={setPicked} />
      )}
    </Dialog>
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
          placeholder="Search members by name, phone or ID…"
          className="pl-9"
          autoFocus
          data-testid="member-picker-search"
        />
      </div>
      {results.length > 0 && (
        <ul className="mt-2 rounded-md border border-neutral-200 divide-y divide-neutral-100 max-h-60 overflow-y-auto">
          {results.map((m) => (
            <li key={m.member}>
              <button
                type="button"
                onClick={() => onPick(m)}
                data-testid="member-picker-result"
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-neutral-50 transition-colors"
              >
                <Avatar name={m.full_name} size="size-7" />
                <span className="flex-1 min-w-0">
                  <span className="block text-small text-neutral-900 truncate">
                    {m.full_name}
                  </span>
                  <span className="block text-tiny text-neutral-500">
                    {m.phone ?? m.member}
                  </span>
                </span>
                {m.sub_status === 'Active' ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="neutral">No sub</Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
