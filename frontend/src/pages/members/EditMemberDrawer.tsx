import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { type MemberOverview } from '@/lib/types'
import { useUpdateMember } from '@/queries/members'

const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say']
const SOURCES = ['Walk-in', 'Website', 'Referral', 'Social Media', 'Campaign', 'Corporate', 'Other']

interface Props {
  member: MemberOverview
  onClose: () => void
}

/** Mounted fresh per open (see call site) so initial state = the member. */
export function EditMemberDrawer({ member, onClose }: Props) {
  const { toast } = useToast()
  const update = useUpdateMember(member.member)

  const [fullName, setFullName] = useState(member.full_name)
  const [phone, setPhone] = useState(member.phone ?? '')
  const [email, setEmail] = useState(member.email ?? '')
  const [gender, setGender] = useState(member.gender ?? '')
  const [dob, setDob] = useState(member.date_of_birth ?? '')
  const [source, setSource] = useState(member.source ?? '')
  const [ecName, setEcName] = useState(member.emergency_contact_name ?? '')
  const [ecPhone, setEcPhone] = useState(member.emergency_contact_phone ?? '')
  const [ecRel, setEcRel] = useState(member.emergency_contact_relationship ?? '')

  function submit() {
    if (!fullName.trim()) return toast({ variant: 'error', title: 'Name is required' })
    update.mutate(
      {
        full_name: fullName,
        phone,
        email: email || undefined,
        gender: gender || undefined,
        date_of_birth: dob || undefined,
        source: source || undefined,
        emergency_contact_name: ecName || undefined,
        emergency_contact_phone: ecPhone || undefined,
        emergency_contact_relationship: ecRel || undefined,
      },
      {
        onSuccess: () => { toast({ variant: 'success', title: 'Member updated' }); onClose() },
        onError: (err) => toast({ variant: 'error', title: 'Could not save', description: err instanceof ApiError ? err.message : undefined }),
      },
    )
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Edit Member"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Section title="Identity">
          <Field label="Full name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gender">
              <Select value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">—</option>
                {GENDERS.map((g) => <option key={g}>{g}</option>)}
              </Select>
            </Field>
            <Field label="Date of birth"><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></Field>
          </div>
        </Section>

        <Section title="Contact">
          <Field label="Phone"><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        </Section>

        <Section title="Emergency contact">
          <Field label="Contact name"><Input value={ecName} onChange={(e) => setEcName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact phone"><Input type="tel" value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} /></Field>
            <Field label="Relationship"><Input value={ecRel} onChange={(e) => setEcRel(e.target.value)} /></Field>
          </div>
        </Section>

        <Section title="Other">
          <Field label="Source">
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">—</option>
              {SOURCES.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
        </Section>
      </div>
    </Drawer>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-tiny font-medium uppercase tracking-wide text-neutral-400 mb-3">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  )
}
