import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { api } from '@/lib/api'
import { type ComplianceRow } from '@/lib/types'
import {
  useAuthorities,
  useCreateComplianceItem,
  useUpdateComplianceItem,
} from '@/queries/compliance'

const CATEGORIES = [
  'Tax',
  'License',
  'Permit',
  'Certificate',
  'Insurance',
  'Inspection',
  'Subscription',
  'Other',
]

const NEW_AUTHORITY = '__new__'

interface Props {
  onClose: () => void
  /** When set, the drawer edits this item instead of creating. Mount fresh
   *  per open (see call site) so initial state comes from the prop. */
  edit?: ComplianceRow | null
}

export function ComplianceItemDrawer({ onClose, edit }: Props) {
  const { toast } = useToast()
  const create = useCreateComplianceItem()
  const update = useUpdateComplianceItem()
  const { data: authorities } = useAuthorities()

  const [name, setName] = useState(edit?.compliance_name ?? '')
  const [authority, setAuthority] = useState(edit?.authority ?? '')
  const [newAuthority, setNewAuthority] = useState('')
  const [category, setCategory] = useState(edit?.category ?? 'License')
  const [issued, setIssued] = useState(edit?.issued_on ?? '')
  const [expires, setExpires] = useState(edit?.expires_on ?? '')
  const [reference, setReference] = useState(edit?.reference_number ?? '')
  const [cost, setCost] = useState(edit?.cost ? String(edit.cost) : '')

  const pending = create.isPending || update.isPending

  async function submit() {
    if (!name.trim()) return toast({ variant: 'error', title: 'Name the item' })
    if (!expires) return toast({ variant: 'error', title: 'Set an expiry date' })

    let auth = authority
    if (auth === NEW_AUTHORITY) {
      if (!newAuthority.trim())
        return toast({ variant: 'error', title: 'Enter the new authority' })
      try {
        const res = await api.callMethod<{ authority: string }>(
          'gym_management.compliance.create_authority',
          { authority_name: newAuthority.trim() },
        )
        auth = res.authority
      } catch (err) {
        return toast({
          variant: 'error',
          title: 'Could not add authority',
          description: err instanceof ApiError ? err.message : undefined,
        })
      }
    }
    if (!auth) return toast({ variant: 'error', title: 'Pick an authority' })

    const payload = {
      compliance_name: name,
      compliance_authority: auth,
      compliance_category: category,
      issued_on: issued || undefined,
      expires_on: expires,
      reference_number: reference || undefined,
      cost: cost ? Number(cost) : undefined,
    }
    const onErr = (err: unknown) =>
      toast({
        variant: 'error',
        title: 'Could not save',
        description: err instanceof ApiError ? err.message : undefined,
      })

    if (edit) {
      update.mutate(
        { name: edit.name, ...payload },
        { onSuccess: () => { toast({ variant: 'success', title: 'Item updated' }); onClose() }, onError: onErr },
      )
    } else {
      create.mutate(payload, {
        onSuccess: () => { toast({ variant: 'success', title: 'Compliance item added' }); onClose() },
        onError: onErr,
      })
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={edit ? 'Edit compliance item' : 'Add compliance item'}
      description="A license, permit, tax filing, insurance or inspection to track."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{pending ? 'Saving…' : edit ? 'Save' : 'Add item'}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Business Permit" autoFocus />
        </div>
        <div>
          <Label>Authority</Label>
          <Select value={authority} onChange={(e) => setAuthority(e.target.value)}>
            <option value="">Select an authority…</option>
            {(authorities ?? []).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
            <option value={NEW_AUTHORITY}>+ New authority…</option>
          </Select>
          {authority === NEW_AUTHORITY && (
            <Input className="mt-2" value={newAuthority} onChange={(e) => setNewAuthority(e.target.value)} placeholder="New authority name" />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Category</Label>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </div>
          <div>
            <Label>Cost (KSh)</Label>
            <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Issued on</Label>
            <Input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} />
          </div>
          <div>
            <Label>Expires on</Label>
            <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Reference number</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
        </div>
      </div>
    </Drawer>
  )
}
