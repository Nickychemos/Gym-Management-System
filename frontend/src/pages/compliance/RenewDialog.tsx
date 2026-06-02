import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { fullDate } from '@/lib/format'
import { type ComplianceRow } from '@/lib/types'
import { useRenewCompliance } from '@/queries/compliance'

const METHODS = ['Cash', 'M-Pesa', 'Bank Transfer', 'Cheque', 'Card']

/** Default the new expiry to one year past the current expiry. */
function defaultExpiry(expires_on: string | null): string {
  if (!expires_on) return ''
  const d = new Date(expires_on + 'T00:00:00')
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

export function RenewDialog({
  item,
  onClose,
}: {
  item: ComplianceRow
  onClose: () => void
}) {
  const { toast } = useToast()
  const renew = useRenewCompliance()
  const [newExpiry, setNewExpiry] = useState(() => defaultExpiry(item.expires_on))
  const [cost, setCost] = useState('')
  const [method, setMethod] = useState('M-Pesa')
  const [reference, setReference] = useState('')

  function submit() {
    if (!newExpiry) return toast({ variant: 'error', title: 'Set the new expiry date' })
    renew.mutate(
      {
        compliance_item: item.name,
        new_expiry_date: newExpiry,
        cost_paid: cost ? Number(cost) : undefined,
        payment_method: method,
        new_reference_number: reference || undefined,
      },
      {
        onSuccess: () => {
          toast({ variant: 'success', title: 'Renewed', description: `New expiry ${fullDate(newExpiry)}` })
          onClose()
        },
        onError: (err) =>
          toast({ variant: 'error', title: 'Could not renew', description: err instanceof ApiError ? err.message : undefined }),
      },
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Renew — ${item.compliance_name}`}
      description={item.expires_on ? `Currently expires ${fullDate(item.expires_on)}` : undefined}
      widthClassName="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={renew.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={renew.isPending}>{renew.isPending ? 'Renewing…' : 'Record renewal'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>New expiry date</Label>
          <Input type="date" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Cost paid (KSh)</Label>
            <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>Payment method</Label>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => <option key={m}>{m}</option>)}
            </Select>
          </div>
        </div>
        <div>
          <Label>New reference number</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
        </div>
      </div>
    </Dialog>
  )
}
