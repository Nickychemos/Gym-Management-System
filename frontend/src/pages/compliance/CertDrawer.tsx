import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Drawer } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { type CertRow } from '@/lib/types'
import {
  useComplianceEmployees,
  useCreateCertification,
  useUpdateCertification,
} from '@/queries/compliance'

interface Props {
  onClose: () => void
  edit?: CertRow | null
}

export function CertDrawer({ onClose, edit }: Props) {
  const { toast } = useToast()
  const create = useCreateCertification()
  const update = useUpdateCertification()
  const { data: employees } = useComplianceEmployees()

  const [employee, setEmployee] = useState(edit?.employee ?? '')
  const [name, setName] = useState(edit?.certification_name ?? '')
  const [issuer, setIssuer] = useState(edit?.issuing_body ?? '')
  const [issued, setIssued] = useState(edit?.issued_on ?? '')
  const [expires, setExpires] = useState(edit?.expires_on ?? '')
  const [number, setNumber] = useState(edit?.certification_number ?? '')
  const [verified, setVerified] = useState(!!edit?.verified_by_hr)

  const pending = create.isPending || update.isPending

  function submit() {
    if (!edit && !employee) return toast({ variant: 'error', title: 'Pick a staff member' })
    if (!name.trim()) return toast({ variant: 'error', title: 'Name the certification' })
    if (!issuer.trim()) return toast({ variant: 'error', title: 'Add the issuer' })
    if (!issued || !expires) return toast({ variant: 'error', title: 'Set issue & expiry dates' })

    const onErr = (err: unknown) =>
      toast({ variant: 'error', title: 'Could not save', description: err instanceof ApiError ? err.message : undefined })

    if (edit) {
      update.mutate(
        {
          name: edit.name,
          certification_name: name,
          issuing_body: issuer,
          certification_number: number || undefined,
          issued_on: issued,
          expires_on: expires,
          verified_by_hr: verified,
        },
        { onSuccess: () => { toast({ variant: 'success', title: 'Certification updated' }); onClose() }, onError: onErr },
      )
    } else {
      create.mutate(
        {
          employee,
          certification_name: name,
          issuing_body: issuer,
          issued_on: issued,
          expires_on: expires,
          certification_number: number || undefined,
          verified_by_hr: verified,
        },
        { onSuccess: () => { toast({ variant: 'success', title: 'Certification added' }); onClose() }, onError: onErr },
      )
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={edit ? 'Edit certification' : 'Add certification'}
      description="A trainer or staff certification to keep current."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{pending ? 'Saving…' : edit ? 'Save' : 'Add'}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Label>Staff member</Label>
          <Select value={employee} onChange={(e) => setEmployee(e.target.value)} disabled={!!edit}>
            <option value="">Select…</option>
            {(employees ?? []).map((emp) => (
              <option key={emp.name} value={emp.name}>{emp.employee_name}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Certification</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. NASM CPT" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Issuing body</Label>
            <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="e.g. NASM" />
          </div>
          <div>
            <Label>Cert number</Label>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Optional" />
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
        <label className="flex items-center gap-2 text-small text-neutral-700">
          <Checkbox checked={verified} onChange={(e) => setVerified(e.target.checked)} />
          Verified by HR
        </label>
      </div>
    </Drawer>
  )
}
