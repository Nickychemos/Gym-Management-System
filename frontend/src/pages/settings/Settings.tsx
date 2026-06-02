import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Plus, UserPlus, XCircle } from 'lucide-react'

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
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { ksh, relativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type PlanRow } from '@/lib/types'
import {
  useAddStaff,
  useIntegrationsStatus,
  usePlans,
  useRoles,
  useSetPlanActive,
  useSettings,
  useStaff,
  useUpdateBrandSettings,
  useUpdateGymSettings,
} from '@/queries/settings'
import { PlanDrawer } from './PlanDrawer'

const TABS = [
  { value: 'plans', label: 'Plans' },
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

function UsersTab() {
  const { data, isLoading } = useStaff()
  const [addOpen, setAddOpen] = useState(false)

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Staff & Users</CardTitle>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <UserPlus className="size-4" strokeWidth={2} />
          Add user
        </Button>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {isLoading ? (
          <div className="px-5 py-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : !data || data.length === 0 ? (
          <EmptyState title="No staff users yet" description="Add receptionists, trainers and managers." action={<Button onClick={() => setAddOpen(true)}><UserPlus className="size-4" strokeWidth={2} />Add user</Button>} />
        ) : (
          <Table>
            <THead><TR><TH>Name</TH><TH>Email</TH><TH>Roles</TH><TH>Last login</TH><TH>Status</TH></TR></THead>
            <TBody>
              {data.map((u) => (
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
                  <TD><Badge variant={u.enabled ? 'success' : 'neutral'}>{u.enabled ? 'Active' : 'Disabled'}</Badge></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
      {addOpen && <AddUserDialog onClose={() => setAddOpen(false)} />}
    </Card>
  )
}

function AddUserDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast()
  const add = useAddStaff()
  const { data: roles } = useRoles()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')

  function submit() {
    if (!email.trim() || !name.trim()) return toast({ variant: 'error', title: 'Name and email required' })
    add.mutate(
      { email, full_name: name, role: role || undefined },
      {
        onSuccess: () => { toast({ variant: 'success', title: 'User added' }); onClose() },
        onError: (err) => toast({ variant: 'error', title: 'Could not add user', description: err instanceof ApiError ? err.message : undefined }),
      },
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add staff user"
      description="They'll set a password via 'Forgot password' to sign in."
      widthClassName="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={add.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={add.isPending}>{add.isPending ? 'Adding…' : 'Add user'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
        <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div>
          <Label>Role</Label>
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">No role (basic access)</option>
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
