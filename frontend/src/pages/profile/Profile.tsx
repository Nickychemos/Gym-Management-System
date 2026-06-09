import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Camera } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import {
  type MyProfile,
  useChangeMyPassword,
  useMyProfile,
  useRemoveAvatar,
  useUpdateMyProfile,
  useUploadAvatar,
} from '@/queries/profile'

// ---------------------------------------------------------------- helpers ---

function fmtDateTime(v?: string | null): string {
  if (!v) return 'Never'
  const d = new Date(v.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return 'Never'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtDate(v?: string | null): string {
  if (!v) return 'Unknown'
  const d = new Date(v.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return 'Unknown'
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function strength(pwd: string): { score: 0 | 1 | 2 | 3; label: string } {
  let s = 0
  if (pwd.length >= 8) s++
  if (/[0-9]/.test(pwd) && /[a-zA-Z]/.test(pwd)) s++
  if (/[^a-zA-Z0-9]/.test(pwd)) s++
  return { score: s as 0 | 1 | 2 | 3, label: ['Too short', 'Weak', 'Good', 'Strong'][s] }
}

// The User doc carries dozens of ERPNext system roles; only the gym roles are
// meaningful here. Admins just see a single "Administrator".
const GYM_ROLES = ['Gym Owner', 'Gym Manager', 'Receptionist', 'Trainer']

function displayRoles(p: MyProfile): string[] {
  if (p.is_admin) return ['Administrator']
  const r = p.roles.filter((x) => GYM_ROLES.includes(x))
  return r.length ? r : ['Staff']
}

// ------------------------------------------------------------------- page ---

export default function ProfilePage() {
  const { data, isLoading } = useMyProfile()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-display font-semibold tracking-tight text-neutral-900">
          Profile
        </h1>
        <p className="text-body text-neutral-500">
          Manage your account, preferences and password.
        </p>
      </div>

      {isLoading || !data ? (
        <div className="space-y-6">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      ) : (
        <div className="space-y-6">
          <Hero profile={data} />
          <Section
            title="Personal details"
            description="Your name and contact information."
          >
            <PersonalDetails profile={data} />
          </Section>
          <Section
            title="Account"
            description="Your sign-in email and account history."
          >
            <AccountInfo profile={data} />
          </Section>
          <Section
            title="Password"
            description="Change the password you use to sign in."
          >
            <PasswordCard />
          </Section>
        </div>
      )}
    </div>
  )
}

/** Two-column settings section: label + description on the left, controls right. */
function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-x-8 gap-y-5 px-6 py-6 lg:grid-cols-3">
        <div>
          <h2 className="text-h3 font-semibold tracking-tight text-neutral-900">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-small leading-relaxed text-neutral-500">
              {description}
            </p>
          )}
        </div>
        <div className="lg:col-span-2">{children}</div>
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------------ hero ----

function Hero({ profile }: { profile: MyProfile }) {
  const upload = useUploadAvatar()
  const remove = useRemoveAvatar()
  const { refresh } = useAuth()
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)

  const name = profile.full_name || profile.user
  const roles = displayRoles(profile)

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'error', title: 'Please choose an image file' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'error', title: 'Image must be 5 MB or smaller' })
      return
    }
    upload.mutate(file, {
      onSuccess: () => {
        toast({ variant: 'success', title: 'Photo updated' })
        refresh()
      },
      onError: (err) =>
        toast({
          variant: 'error',
          title: 'Upload failed',
          description: err instanceof ApiError ? err.message : undefined,
        }),
    })
  }

  function onRemove() {
    remove.mutate(undefined, {
      onSuccess: () => {
        toast({ variant: 'success', title: 'Photo removed' })
        refresh()
      },
      onError: (err) =>
        toast({
          variant: 'error',
          title: 'Could not remove photo',
          description: err instanceof ApiError ? err.message : undefined,
        }),
    })
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-5 px-6 py-6 sm:flex-row sm:items-center">
        <div className="relative shrink-0">
          <Avatar
            name={name}
            src={profile.user_image}
            size="size-20"
            className="text-display ring-1 ring-neutral-200"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
            aria-label="Change photo"
            className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full border-2 border-white bg-neutral-900 text-white shadow-[var(--shadow-card)] transition-colors hover:bg-neutral-800"
          >
            {upload.isPending ? (
              <Spinner size="size-4" className="border-white/40 border-t-white" />
            ) : (
              <Camera className="size-4" strokeWidth={2} />
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPick}
          />
        </div>

        <div className="min-w-0">
          <div className="truncate text-h2 font-semibold tracking-tight text-neutral-900">
            {name}
          </div>
          <div className="truncate text-small text-neutral-500">
            {profile.email || profile.user}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {roles.map((r) => (
              <Badge key={r} variant="neutral">
                {r}
              </Badge>
            ))}
          </div>
          {profile.user_image && (
            <button
              type="button"
              onClick={onRemove}
              disabled={remove.isPending}
              className="mt-2.5 text-tiny font-medium text-neutral-500 transition-colors hover:text-danger-700 disabled:opacity-50"
            >
              Remove photo
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------- personal details ---

function PersonalDetails({ profile }: { profile: MyProfile }) {
  const update = useUpdateMyProfile()
  const { refresh } = useAuth()
  const { toast } = useToast()

  const [firstName, setFirstName] = useState(profile.first_name ?? '')
  const [lastName, setLastName] = useState(profile.last_name ?? '')
  const [mobile, setMobile] = useState(profile.mobile_no ?? '')

  const dirty =
    firstName !== (profile.first_name ?? '') ||
    lastName !== (profile.last_name ?? '') ||
    mobile !== (profile.mobile_no ?? '')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!dirty) return
    update.mutate(
      { first_name: firstName, last_name: lastName, mobile_no: mobile },
      {
        onSuccess: () => {
          toast({ variant: 'success', title: 'Profile updated' })
          refresh()
        },
        onError: (err) =>
          toast({
            variant: 'error',
            title: 'Could not update profile',
            description: err instanceof ApiError ? err.message : undefined,
          }),
      },
    )
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="first">First name</Label>
          <Input
            id="first"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="last">Last name</Label>
          <Input
            id="last"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="e.g. 0712 345 678"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button type="submit" disabled={!dirty || update.isPending}>
          {update.isPending ? 'Saving' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------- account ---

function AccountInfo({ profile }: { profile: MyProfile }) {
  return (
    <dl className="divide-y divide-neutral-100">
      <InfoRow label="Email" value={profile.email || profile.user} />
      <InfoRow label="Last sign-in" value={fmtDateTime(profile.last_login)} />
      <InfoRow label="Member since" value={fmtDate(profile.creation)} />
    </dl>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-small first:pt-0 last:pb-0">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="break-all text-right text-neutral-800">{value}</dd>
    </div>
  )
}

// --------------------------------------------------------------- password ---

function PasswordCard() {
  const change = useChangeMyPassword()
  const { toast } = useToast()
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')

  const meter = strength(newPwd)
  const mismatch = !!confirmPwd && confirmPwd !== newPwd
  const canChange =
    !!oldPwd && newPwd.length >= 8 && newPwd === confirmPwd && !change.isPending

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canChange) return
    change.mutate(
      { old_password: oldPwd, new_password: newPwd },
      {
        onSuccess: () => {
          toast({ variant: 'success', title: 'Password changed' })
          setOldPwd('')
          setNewPwd('')
          setConfirmPwd('')
        },
        onError: (err) =>
          toast({
            variant: 'error',
            title: 'Could not change password',
            description: err instanceof ApiError ? err.message : undefined,
          }),
      },
    )
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="old">Current password</Label>
          <PasswordInput
            id="old"
            autoComplete="current-password"
            value={oldPwd}
            onChange={(e) => setOldPwd(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="new">New password</Label>
          <PasswordInput
            id="new"
            autoComplete="new-password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
          />
          {newPwd && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={[
                    'h-full transition-all',
                    meter.score >= 3
                      ? 'w-full bg-success-500'
                      : meter.score === 2
                        ? 'w-2/3 bg-warning-500'
                        : 'w-1/3 bg-danger-500',
                  ].join(' ')}
                />
              </div>
              <span className="text-tiny text-neutral-500">{meter.label}</span>
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="confirm">Confirm new password</Label>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            aria-invalid={mismatch}
          />
          {mismatch && (
            <p className="mt-1 text-tiny text-danger-700">
              Passwords do not match.
            </p>
          )}
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button type="submit" disabled={!canChange}>
          {change.isPending ? 'Changing' : 'Change password'}
        </Button>
      </div>
    </form>
  )
}
