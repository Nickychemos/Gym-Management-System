import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  Copy,
  Plus,
  RefreshCw,
  UserPlus,
  XCircle,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table'
import { Tabs } from '@/components/ui/tabs'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { ksh, relativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type InviteResult, type PlanRow, type StaffUser } from '@/lib/types'
import {
  type BranchRow,
  useBranches,
  useCreateBranch,
  useSetBranchActive,
  useSetUserBranch,
  useUpdateBranch,
} from '@/queries/branches'
import {
  useInviteUser,
  useIntegrationsStatus,
  usePlans,
  useRemoveUser,
  useResendInvite,
  useRoles,
  useSetPlanActive,
  useSetUserEnabled,
  useSetUserRole,
  useSettings,
  useStaff,
  useUpdateBrandSettings,
  useUpdateGymSettings,
} from '@/queries/settings'
import { PlanDrawer } from './PlanDrawer'

const TABS = [
  { value: 'plans', label: 'Plans' },
  { value: 'branches', label: 'Branches' },
  { value: 'gym', label: 'Gym' },
  { value: 'brand', label: 'Brand' },
  { value: 'integrations', label: 'Integrations' },
  { value: 'users', label: 'Users' },
]

export default function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'plans'

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-display font-semibold tracking-tight text-neutral-900">Settings</h1>
        <p className="text-body text-neutral-500">Plans, policies, branding & integrations</p>
      </div>

      <div className="mb-6">
        <Tabs tabs={TABS} value={tab} onValueChange={(v) => setParams({ tab: v })} />
      </div>

      {tab === 'plans' && <PlansTab />}
      {tab === 'branches' && <BranchesTab />}
      {tab === 'gym' && <GymTab />}
      {tab === 'brand' && <BrandTab />}
      {tab === 'integrations' && <IntegrationsTab />}
      {tab === 'users' && <UsersTab />}
    </div>
  )
}

// ---------------- Plans ----------------

function PlansTab() {
  const { toast } = useToast()
  const { data, isLoading } = usePlans()
  const setActive = useSetPlanActive()
  const [drawer, setDrawer] = useState<{ open: boolean; edit: PlanRow | null }>({ open: false, edit: null })

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Membership Plans</CardTitle>
        <Button size="sm" onClick={() => setDrawer({ open: true, edit: null })}>
          <Plus className="size-4" strokeWidth={2} />
          New plan
        </Button>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {isLoading ? (
          <div className="px-5 py-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : !data || data.length === 0 ? (
          <EmptyState title="No plans yet" description="Create the memberships, passes and packages you sell." action={<Button onClick={() => setDrawer({ open: true, edit: null })}><Plus className="size-4" strokeWidth={2} />New plan</Button>} />
        ) : (
          <Table>
            <THead>
              <TR><TH>Plan</TH><TH>Type</TH><TH>Duration</TH><TH className="text-right">Price</TH><TH>Active</TH><TH className="text-right">Actions</TH></TR>
            </THead>
            <TBody>
              {data.map((p) => (
                <TR key={p.name}>
                  <TD>
                    <div className="text-neutral-900">{p.plan_name}</div>
                    {p.session_count > 0 && <div className="text-tiny text-neutral-400">{p.session_count} sessions</div>}
                  </TD>
                  <TD>{p.plan_type}</TD>
                  <TD className="text-neutral-600">{p.duration_days} days</TD>
                  <TD className="text-right tabular-nums text-neutral-900">{ksh(p.price)}</TD>
                  <TD>
                    <label className="inline-flex items-center">
                      <Checkbox
                        checked={!!p.is_active}
                        disabled={setActive.isPending}
                        onChange={(e) =>
                          setActive.mutate({ name: p.name, active: e.target.checked }, {
                            onError: (err) => toast({ variant: 'error', title: 'Failed', description: err instanceof ApiError ? err.message : undefined }),
                          })
                        }
                      />
                    </label>
                  </TD>
                  <TD className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setDrawer({ open: true, edit: p })}>Edit</Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
      {drawer.open && <PlanDrawer edit={drawer.edit} onClose={() => setDrawer({ open: false, edit: null })} />}
    </Card>
  )
}

// ---------------- Gym policies ----------------

type FieldDef = { key: string; label: string; kind: 'number' | 'currency' | 'percent' | 'check' | 'text' | 'textarea' }
type Group = { title: string; fields: FieldDef[] }

const GYM_GROUPS: Group[] = [
  { title: 'Memberships', fields: [
    { key: 'default_grace_period_days', label: 'Grace period (days)', kind: 'number' },
    { key: 'default_max_freeze_days_per_year', label: 'Max freeze days / year', kind: 'number' },
    { key: 'allow_member_self_freeze', label: 'Allow member self-freeze', kind: 'check' },
    { key: 'auto_lapse_after_grace', label: 'Auto-lapse after grace', kind: 'check' },
    { key: 'require_waiver_for_access', label: 'Require waiver for access', kind: 'check' },
  ] },
  { title: 'Classes', fields: [
    { key: 'class_cancel_window_hours', label: 'Cancel window (hours)', kind: 'number' },
    { key: 'class_no_show_fee', label: 'No-show fee', kind: 'currency' },
    { key: 'class_no_show_blocks_after_n', label: 'Block after N no-shows', kind: 'number' },
    { key: 'waitlist_auto_promote', label: 'Auto-promote waitlist', kind: 'check' },
    { key: 'waitlist_response_window_minutes', label: 'Waitlist response (min)', kind: 'number' },
  ] },
  { title: 'Personal Training', fields: [
    { key: 'pt_session_default_duration_minutes', label: 'Default session (min)', kind: 'number' },
    { key: 'pt_package_default_validity_days', label: 'Package validity (days)', kind: 'number' },
    { key: 'pt_default_trainer_commission_percent', label: 'Trainer commission %', kind: 'percent' },
  ] },
  { title: 'Finance', fields: [
    { key: 'cash_variance_threshold', label: 'Cash variance threshold', kind: 'currency' },
    { key: 'require_dual_control_for_refunds', label: 'Dual control for refunds', kind: 'check' },
  ] },
  { title: 'Facility', fields: [
    { key: 'operating_hours', label: 'Operating hours', kind: 'textarea' },
    { key: 'location', label: 'Location', kind: 'textarea' },
  ] },
]

const BRAND_GROUPS: Group[] = [
  { title: 'Identity', fields: [
    { key: 'gym_display_name', label: 'Display name', kind: 'text' },
    { key: 'gym_legal_name', label: 'Legal name', kind: 'text' },
    { key: 'tagline', label: 'Tagline', kind: 'text' },
    { key: 'primary_color', label: 'Primary color', kind: 'text' },
    { key: 'secondary_color', label: 'Secondary color', kind: 'text' },
  ] },
  { title: 'Contact', fields: [
    { key: 'support_phone', label: 'Support phone', kind: 'text' },
    { key: 'support_email', label: 'Support email', kind: 'text' },
    { key: 'physical_address', label: 'Address', kind: 'textarea' },
  ] },
  { title: 'Social', fields: [
    { key: 'social_facebook', label: 'Facebook', kind: 'text' },
    { key: 'social_instagram', label: 'Instagram', kind: 'text' },
    { key: 'social_twitter', label: 'Twitter / X', kind: 'text' },
  ] },
  { title: 'Receipt', fields: [
    { key: 'receipt_footer', label: 'Receipt footer', kind: 'textarea' },
    { key: 'receipt_show_logo', label: 'Show logo on receipt', kind: 'check' },
  ] },
]

function GymTab() {
  const { data, isLoading } = useSettings()
  const update = useUpdateGymSettings()
  if (isLoading || !data) return <FormSkeleton />
  return <SettingsForm key="gym" groups={GYM_GROUPS} initial={data.gym as unknown as Record<string, unknown>} pending={update.isPending} onSave={(v) => update.mutateAsync(v)} />
}

function BrandTab() {
  const { data, isLoading } = useSettings()
  const update = useUpdateBrandSettings()
  if (isLoading || !data) return <FormSkeleton />
  return <SettingsForm key="brand" groups={BRAND_GROUPS} initial={data.brand as unknown as Record<string, unknown>} pending={update.isPending} onSave={(v) => update.mutateAsync(v)} />
}

function SettingsForm({
  groups,
  initial,
  pending,
  onSave,
}: {
  groups: Group[]
  initial: Record<string, unknown>
  pending: boolean
  onSave: (values: Record<string, unknown>) => Promise<unknown>
}) {
  const { toast } = useToast()
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...initial }))
  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }))

  async function save() {
    try {
      await onSave(values)
      toast({ variant: 'success', title: 'Saved' })
    } catch (err) {
      toast({ variant: 'error', title: 'Could not save', description: err instanceof ApiError ? err.message : undefined })
    }
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Card key={g.title}>
          <CardHeader><CardTitle>{g.title}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {g.fields.map((f) => (
                <div key={f.key} className={f.kind === 'textarea' ? 'sm:col-span-2' : ''}>
                  {f.kind === 'check' ? (
                    <label className="flex items-center gap-2 text-small text-neutral-700 mt-5">
                      <Checkbox checked={!!values[f.key]} onChange={(e) => set(f.key, e.target.checked ? 1 : 0)} />
                      {f.label}
                    </label>
                  ) : (
                    <>
                      <Label>{f.label}</Label>
                      <Input
                        type={f.kind === 'text' || f.kind === 'textarea' ? 'text' : 'number'}
                        value={(values[f.key] as string | number | null) ?? ''}
                        onChange={(e) => set(f.key, f.kind === 'text' || f.kind === 'textarea' ? e.target.value : Number(e.target.value))}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
      <div className="flex justify-end">
        <Button onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </div>
  )
}

// ---------------- Integrations ----------------

function IntegrationsTab() {
  const { data, isLoading } = useIntegrationsStatus()
  if (isLoading || !data) return <FormSkeleton />
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <IntegrationCard title="eTIMS (KRA)" ok={!!data.etims.ready} detail={data.etims.ready ? 'Ready to fiscalize' : data.etims.reason ?? 'Not configured'} />
      <IntegrationCard title="M-Pesa" ok={data.mpesa.configured} detail={data.mpesa.configured ? `${data.mpesa.env ?? 'configured'} · ${data.mpesa.shortcode ?? ''}` : 'Credentials not set in site config'} />
      <IntegrationCard title="WhatsApp" ok={data.whatsapp.configured} detail={data.whatsapp.configured ? 'Channel connected' : 'No channel connected'} />
    </div>
  )
}

function IntegrationCard({ title, ok, detail }: { title: string; ok: boolean; detail: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-h3 font-semibold text-neutral-900">{title}</span>
          {ok ? <CheckCircle2 className="size-5 text-success-500" strokeWidth={2} /> : <XCircle className="size-5 text-neutral-300" strokeWidth={2} />}
        </div>
        <Badge variant={ok ? 'success' : 'neutral'}>{ok ? 'Connected' : 'Not configured'}</Badge>
        <p className="text-small text-neutral-500 mt-3">{detail}</p>
      </CardContent>
    </Card>
  )
}

// ---------------- Users ----------------

function userStatus(u: StaffUser): { label: string; variant: 'success' | 'warning' | 'neutral' } {
  if (!u.enabled) return { label: 'Disabled', variant: 'neutral' }
  if (u.pending ?? u.last_login === null) return { label: 'Pending', variant: 'warning' }
  return { label: 'Active', variant: 'success' }
}

function UsersTab() {
  const { data, isLoading } = useStaff()
  const { state } = useAuth()
  const me = state.status === 'authenticated' ? state.user : ''
  const [inviteOpen, setInviteOpen] = useState(false)

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Staff & Users</CardTitle>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="size-4" strokeWidth={2} />
          Invite user
        </Button>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {isLoading ? (
          <div className="px-5 py-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : !data || data.length === 0 ? (
          <EmptyState title="No staff users yet" description="Invite receptionists, trainers and managers." action={<Button onClick={() => setInviteOpen(true)}><UserPlus className="size-4" strokeWidth={2} />Invite user</Button>} />
        ) : (
          <Table>
            <THead><TR><TH>Name</TH><TH>Email</TH><TH>Roles</TH><TH>Last login</TH><TH>Status</TH><TH className="text-right">Actions</TH></TR></THead>
            <TBody>
              {data.map((u) => {
                const status = userStatus(u)
                return (
                  <TR key={u.name}>
                    <TD className="text-neutral-900">{u.full_name ?? '—'}</TD>
                    <TD className="text-neutral-500">{u.name}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.slice(0, 3).map((r) => <Badge key={r} variant="neutral">{r}</Badge>)}
                        {u.roles.length > 3 && <span className="text-tiny text-neutral-400">+{u.roles.length - 3}</span>}
                      </div>
                    </TD>
                    <TD className="text-neutral-500">{u.last_login ? relativeDay(u.last_login) : 'Never'}</TD>
                    <TD><Badge variant={status.variant}>{status.label}</Badge></TD>
                    <TD className="text-right"><RowActions user={u} isSelf={u.name === me} /></TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
      </CardContent>
      {inviteOpen && <InviteUserDialog onClose={() => setInviteOpen(false)} />}
    </Card>
  )
}

function RowActions({ user, isSelf }: { user: StaffUser; isSelf: boolean }) {
  const { toast } = useToast()
  const setEnabled = useSetUserEnabled()
  const remove = useRemoveUser()
  const resend = useResendInvite()
  const [roleOpen, setRoleOpen] = useState(false)
  const [branchOpen, setBranchOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [result, setResult] = useState<InviteResult | null>(null)
  const isPending = user.pending ?? user.last_login === null

  function onError(err: unknown, title: string) {
    toast({ variant: 'error', title, description: err instanceof ApiError ? err.message : undefined })
  }

  return (
    <div className="inline-flex items-center gap-1">
      {isPending && (
        <Button
          variant="ghost"
          size="sm"
          disabled={resend.isPending}
          onClick={() =>
            resend.mutate(user.name, {
              onSuccess: (r) => setResult(r),
              onError: (err) => onError(err, 'Could not resend invite'),
            })
          }
        >
          <RefreshCw className="size-3.5" strokeWidth={2} />
          Resend
        </Button>
      )}
      <Button variant="ghost" size="sm" disabled={isSelf} onClick={() => setRoleOpen(true)}>
        Role
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setBranchOpen(true)}>
        Branch
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={isSelf || setEnabled.isPending}
        onClick={() =>
          setEnabled.mutate(
            { email: user.name, enabled: !user.enabled },
            {
              onSuccess: () => toast({ variant: 'success', title: user.enabled ? 'User disabled' : 'User enabled' }),
              onError: (err) => onError(err, 'Could not update user'),
            },
          )
        }
      >
        {user.enabled ? 'Disable' : 'Enable'}
      </Button>
      <Button variant="ghost" size="sm" disabled={isSelf} onClick={() => setRemoveOpen(true)}>
        <span className="text-danger-700">Remove</span>
      </Button>

      {roleOpen && <ChangeRoleDialog user={user} onClose={() => setRoleOpen(false)} />}
      {branchOpen && (
        <ChangeBranchDialog user={user} onClose={() => setBranchOpen(false)} />
      )}

      {removeOpen && (
        <Dialog
          open
          onClose={() => setRemoveOpen(false)}
          title={`Remove ${user.full_name ?? user.name}?`}
          description="They'll be disabled and won't be able to sign in. Their history is kept."
          widthClassName="max-w-md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setRemoveOpen(false)} disabled={remove.isPending}>Cancel</Button>
              <Button
                variant="danger"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(user.name, {
                    onSuccess: () => { toast({ variant: 'success', title: 'User removed' }); setRemoveOpen(false) },
                    onError: (err) => onError(err, 'Could not remove user'),
                  })
                }
              >
                {remove.isPending ? 'Removing…' : 'Remove user'}
              </Button>
            </>
          }
        >
          <p className="text-small text-neutral-600">Email: {user.name}</p>
        </Dialog>
      )}

      {result && (
        <InviteResultDialog
          result={result}
          title="Invite resent"
          onClose={() => setResult(null)}
        />
      )}
    </div>
  )
}

function ChangeRoleDialog({ user, onClose }: { user: StaffUser; onClose: () => void }) {
  const { toast } = useToast()
  const { data: roles } = useRoles()
  const setRole = useSetUserRole()
  const current = (roles ?? []).find((r) => user.roles.includes(r)) ?? ''
  const [role, setRole_] = useState(current)

  function submit() {
    if (!role) return toast({ variant: 'error', title: 'Pick a role' })
    setRole.mutate(
      { email: user.name, role },
      {
        onSuccess: () => { toast({ variant: 'success', title: 'Role updated' }); onClose() },
        onError: (err) => toast({ variant: 'error', title: 'Could not change role', description: err instanceof ApiError ? err.message : undefined }),
      },
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Change role"
      description={user.full_name ?? user.name}
      widthClassName="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={setRole.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={setRole.isPending}>{setRole.isPending ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <div>
        <Label>Role</Label>
        <Select value={role} onChange={(e) => setRole_(e.target.value)}>
          <option value="">Select a role…</option>
          {(roles ?? []).map((r) => <option key={r}>{r}</option>)}
        </Select>
      </div>
    </Dialog>
  )
}

function InviteResultDialog({ result, title, onClose }: { result: InviteResult; title: string; onClose: () => void }) {
  const { toast } = useToast()
  async function copy() {
    try {
      await navigator.clipboard.writeText(result.invite_link)
      toast({ variant: 'success', title: 'Invite link copied' })
    } catch {
      toast({ variant: 'error', title: 'Could not copy — select the link manually' })
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description={result.user}
      widthClassName="max-w-md"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        <div
          className={cn(
            'rounded-md px-3 py-2 text-small',
            result.email_sent ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700',
          )}
        >
          {result.email_sent
            ? 'An invite email has been sent. You can also share the link below.'
            : 'Email is not configured, so no email was sent. Share this link with them directly.'}
        </div>
        <div>
          <Label>Invite link</Label>
          <div className="flex gap-2">
            <Input readOnly value={result.invite_link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-tiny" />
            <Button variant="secondary" onClick={copy}><Copy className="size-4" strokeWidth={2} />Copy</Button>
          </div>
          <p className="mt-1.5 text-tiny text-neutral-500">The link lets them set a password and sign in. It expires after use or when a new invite is sent.</p>
        </div>
      </div>
    </Dialog>
  )
}

function InviteUserDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast()
  const invite = useInviteUser()
  const { data: roles } = useRoles()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [result, setResult] = useState<InviteResult | null>(null)

  function submit() {
    if (!email.trim() || !name.trim()) return toast({ variant: 'error', title: 'Name and email required' })
    if (!role) return toast({ variant: 'error', title: 'Pick a role' })
    invite.mutate(
      { email, full_name: name, role },
      {
        onSuccess: (r) => setResult(r),
        onError: (err) => toast({ variant: 'error', title: 'Could not invite user', description: err instanceof ApiError ? err.message : undefined }),
      },
    )
  }

  // After a successful invite, swap the form for the link/copy result panel.
  if (result) {
    return <InviteResultDialog result={result} title="Invite sent" onClose={onClose} />
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Invite staff user"
      description="They'll get a link to set a password and sign in with their role."
      widthClassName="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={invite.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={invite.isPending}>{invite.isPending ? 'Inviting…' : 'Send invite'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
        <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div>
          <Label>Role</Label>
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Select a role…</option>
            {(roles ?? []).map((r) => <option key={r}>{r}</option>)}
          </Select>
        </div>
      </div>
    </Dialog>
  )
}

function FormSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className={cn('w-full rounded-lg', i === 0 ? 'h-48' : 'h-40')} />)}
    </div>
  )
}

// ---------------- Branches ----------------

function BranchesTab() {
  const { toast } = useToast()
  const { data, isLoading } = useBranches()
  const setActive = useSetBranchActive()
  const [dialog, setDialog] = useState<{ open: boolean; edit: BranchRow | null }>(
    { open: false, edit: null },
  )

  function onError(err: unknown, title: string) {
    toast({ variant: 'error', title, description: err instanceof ApiError ? err.message : undefined })
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Branches</CardTitle>
        <Button size="sm" onClick={() => setDialog({ open: true, edit: null })}>
          <Plus className="size-4" strokeWidth={2} />
          New branch
        </Button>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {isLoading ? (
          <div className="px-5 py-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : !data || data.length === 0 ? (
          <EmptyState
            title="No branches yet"
            description="Add your gym's locations so members, classes and payments can be scoped per branch."
            action={<Button onClick={() => setDialog({ open: true, edit: null })}><Plus className="size-4" strokeWidth={2} />New branch</Button>}
          />
        ) : (
          <Table>
            <THead>
              <TR><TH>Branch</TH><TH>Phone</TH><TH>Address</TH><TH>Active</TH><TH className="text-right">Actions</TH></TR>
            </THead>
            <TBody>
              {data.map((b) => (
                <TR key={b.name}>
                  <TD><div className="text-neutral-900">{b.branch}</div></TD>
                  <TD className="text-neutral-400">{b.gym_phone || 'Not set'}</TD>
                  <TD className="text-neutral-400">{b.gym_address || 'Not set'}</TD>
                  <TD>
                    <label className="inline-flex items-center">
                      <Checkbox
                        checked={!!b.gym_is_active}
                        disabled={setActive.isPending}
                        onChange={(e) => setActive.mutate({ name: b.name, active: e.target.checked }, { onError: (err) => onError(err, 'Failed') })}
                      />
                    </label>
                  </TD>
                  <TD className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setDialog({ open: true, edit: b })}>Edit</Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
      {dialog.open && (
        <BranchDialog edit={dialog.edit} onClose={() => setDialog({ open: false, edit: null })} />
      )}
    </Card>
  )
}

function BranchDialog({ edit, onClose }: { edit: BranchRow | null; onClose: () => void }) {
  const { toast } = useToast()
  const createBranch = useCreateBranch()
  const updateBranch = useUpdateBranch()
  const isEdit = !!edit
  const [name, setName] = useState(edit?.branch ?? '')
  const [phone, setPhone] = useState(edit?.gym_phone ?? '')
  const [address, setAddress] = useState(edit?.gym_address ?? '')
  const busy = createBranch.isPending || updateBranch.isPending

  function onError(err: unknown, title: string) {
    toast({ variant: 'error', title, description: err instanceof ApiError ? err.message : undefined })
  }

  function submit() {
    if (isEdit) {
      updateBranch.mutate(
        { name: edit.name, gym_phone: phone, gym_address: address },
        { onSuccess: () => { toast({ variant: 'success', title: 'Branch updated' }); onClose() }, onError: (err) => onError(err, 'Could not save branch') },
      )
    } else {
      if (!name.trim()) { toast({ variant: 'error', title: 'Branch name is required' }); return }
      createBranch.mutate(
        { branch: name.trim(), gym_phone: phone, gym_address: address },
        { onSuccess: () => { toast({ variant: 'success', title: 'Branch created' }); onClose() }, onError: (err) => onError(err, 'Could not create branch') },
      )
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? 'Edit branch' : 'New branch'}
      widthClassName="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || (!isEdit && !name.trim())}>
            {busy ? 'Saving' : isEdit ? 'Save' : 'Create branch'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="b-name">Branch name</Label>
          <Input id="b-name" value={name} disabled={isEdit} placeholder="e.g. Westlands" onChange={(e) => setName(e.target.value)} />
          {isEdit && <p className="mt-1 text-tiny text-neutral-400">The branch name can't be changed.</p>}
        </div>
        <div>
          <Label htmlFor="b-phone">Phone</Label>
          <Input id="b-phone" value={phone} placeholder="e.g. 0712 345 678" onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="b-addr">Address</Label>
          <Input id="b-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
      </div>
    </Dialog>
  )
}

function ChangeBranchDialog({ user, onClose }: { user: StaffUser; onClose: () => void }) {
  const { toast } = useToast()
  const { data: branches } = useBranches()
  const setUserBranch = useSetUserBranch()
  const [branch, setBranch] = useState(user.gym_branch ?? '')

  function submit() {
    setUserBranch.mutate(
      { user: user.name, branch: branch || null },
      {
        onSuccess: () => { toast({ variant: 'success', title: 'Branch updated' }); onClose() },
        onError: (err) => toast({ variant: 'error', title: 'Could not set branch', description: err instanceof ApiError ? err.message : undefined }),
      },
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Assign branch"
      description={user.full_name ?? user.name}
      widthClassName="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={setUserBranch.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={setUserBranch.isPending}>{setUserBranch.isPending ? 'Saving' : 'Save'}</Button>
        </>
      }
    >
      <div>
        <Label htmlFor="user-branch">Branch</Label>
        <Select id="user-branch" value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">No branch (all)</option>
          {(branches ?? []).map((b) => <option key={b.name} value={b.name}>{b.branch}</option>)}
        </Select>
        <p className="mt-2 text-tiny text-neutral-500">Receptionists and trainers only see data for their assigned branch.</p>
      </div>
    </Dialog>
  )
}
