import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { useCreateMember } from '@/queries/members'

const schema = z.object({
  full_name: z.string().min(2, 'Enter the member’s full name'),
  phone: z.string().min(7, 'Enter a valid phone number'),
  email: z.string().email('Enter a valid email').or(z.literal('')).optional(),
  gender: z.string().optional(),
  date_of_birth: z.string().optional(),
  source: z.string().optional(),
  emergency_contact_name: z.string().min(2, 'Emergency contact name is required'),
  emergency_contact_phone: z.string().min(7, 'Emergency contact phone is required'),
  emergency_contact_relationship: z.string().optional(),
  tax_id: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say']
const SOURCES = [
  'Walk-in',
  'Website',
  'Referral',
  'Social Media',
  'Campaign',
  'Corporate',
  'Other',
]

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (member: string) => void
}

export function AddMemberDrawer({ open, onClose, onCreated }: Props) {
  const { toast } = useToast()
  const createMember = useCreateMember()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { gender: '', source: 'Walk-in' },
  })

  function close() {
    reset()
    onClose()
  }

  const onSubmit = handleSubmit((values) => {
    createMember.mutate(
      {
        full_name: values.full_name,
        phone: values.phone,
        email: values.email || undefined,
        gender: values.gender || undefined,
        date_of_birth: values.date_of_birth || undefined,
        source: values.source || undefined,
        emergency_contact_name: values.emergency_contact_name,
        emergency_contact_phone: values.emergency_contact_phone,
        emergency_contact_relationship:
          values.emergency_contact_relationship || undefined,
        tax_id: values.tax_id || undefined,
      },
      {
        onSuccess: (res) => {
          toast({
            variant: 'success',
            title: 'Member added',
            description: `${values.full_name} · ${res.member}`,
          })
          reset()
          onCreated(res.member)
        },
        onError: (err) => {
          toast({
            variant: 'error',
            title: 'Could not add member',
            description:
              err instanceof ApiError
                ? err.message
                : 'Please try again in a moment.',
          })
        },
      },
    )
  })

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Add Member"
      description="Create a member record. You can add subscription and payment details next."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={createMember.isPending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={createMember.isPending}>
            {createMember.isPending ? 'Adding…' : 'Add Member'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Section title="Identity">
          <Field label="Full name" error={errors.full_name?.message} required>
            <Input autoFocus aria-invalid={!!errors.full_name} {...register('full_name')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gender">
              <Select {...register('gender')}>
                <option value="">—</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date of birth">
              <Input type="date" {...register('date_of_birth')} />
            </Field>
          </div>
        </Section>

        <Section title="Contact">
          <Field label="Phone" error={errors.phone?.message} required>
            <Input
              type="tel"
              placeholder="254712345678"
              aria-invalid={!!errors.phone}
              {...register('phone')}
            />
          </Field>
          <Field label="Email" error={errors.email?.message}>
            <Input type="email" aria-invalid={!!errors.email} {...register('email')} />
          </Field>
        </Section>

        <Section title="Emergency contact">
          <Field
            label="Contact name"
            error={errors.emergency_contact_name?.message}
            required
          >
            <Input
              aria-invalid={!!errors.emergency_contact_name}
              {...register('emergency_contact_name')}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Contact phone"
              error={errors.emergency_contact_phone?.message}
              required
            >
              <Input
                type="tel"
                aria-invalid={!!errors.emergency_contact_phone}
                {...register('emergency_contact_phone')}
              />
            </Field>
            <Field label="Relationship">
              <Input
                placeholder="e.g. Spouse"
                {...register('emergency_contact_relationship')}
              />
            </Field>
          </div>
        </Section>

        <Section title="Other">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source">
              <Select {...register('source')}>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="KRA PIN (optional)">
              <Input placeholder="A123456789Z" {...register('tax_id')} />
            </Field>
          </div>
        </Section>
      </form>
    </Drawer>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="text-tiny font-medium uppercase tracking-wide text-neutral-400 mb-3">
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string
  error?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <Label>
        {label}
        {required && <span className="text-danger-500 ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="mt-1 text-tiny text-danger-700">{error}</p>}
    </div>
  )
}
