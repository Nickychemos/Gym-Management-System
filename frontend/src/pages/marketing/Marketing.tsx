import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Megaphone, MessageSquare, Plus, Search, Send } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Drawer } from '@/components/ui/drawer'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table'
import { Tabs } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/context/ToastContext'
import { useDebounce } from '@/hooks/useDebounce'
import { ApiError } from '@/lib/api'
import { ksh, relativeDay } from '@/lib/format'
import { campaignVariant, referralVariant, templateVariant } from '@/lib/status'
import {
  type ChatbotFlowRow,
  type MemberRow,
  type ReferralRow,
} from '@/lib/types'
import { useMembers } from '@/queries/members'
import {
  useCampaigns,
  useChatbotFlows,
  useChatbotSessions,
  useCreateCampaign,
  useCreateReferral,
  useCreateTemplate,
  useFlowDetail,
  useMarketingSummary,
  useReferralAction,
  useReferrals,
  useRunRenewalReminders,
  useSubmitTemplate,
  useSyncTemplate,
  useTemplates,
} from '@/queries/marketing'

const TABS = [
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'templates', label: 'WhatsApp Templates' },
  { value: 'chatbot', label: 'Chatbot' },
  { value: 'referrals', label: 'Referrals' },
]

export default function MarketingPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'campaigns'
  const summary = useMarketingSummary()
  const s = summary.data

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-display font-semibold tracking-tight text-neutral-900">Marketing</h1>
        <p className="text-body text-neutral-500">Campaigns, templates, chatbot & referrals</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Campaigns sent" value={s?.campaigns_sent} loading={summary.isLoading} />
        <Kpi label="Approved templates" value={s?.templates_approved} loading={summary.isLoading} />
        <Kpi label="Active referrals" value={s?.active_referrals} loading={summary.isLoading} />
        <Kpi label="Chatbot sessions" value={s?.chatbot_sessions} loading={summary.isLoading} />
      </div>

      <div className="mb-6"><Tabs tabs={TABS} value={tab} onValueChange={(v) => setParams({ tab: v })} /></div>

      {tab === 'campaigns' && <CampaignsTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'chatbot' && <ChatbotTab />}
      {tab === 'referrals' && <ReferralsTab />}
    </div>
  )
}

// ---------------- Campaigns ----------------

function CampaignsTab() {
  const { toast } = useToast()
  const { data, isLoading } = useCampaigns()
  const runReminders = useRunRenewalReminders()
  const [newOpen, setNewOpen] = useState(false)

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
        <span className="text-h3 font-semibold text-neutral-900">Campaigns</span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={runReminders.isPending}
            onClick={() =>
              runReminders.mutate(undefined, {
                onSuccess: (r) => toast({ variant: r.ok ? 'success' : 'info', title: r.ok ? 'Renewal reminders run' : 'Not sent', description: r.ok ? undefined : r.reason }),
                onError: (err) => toast({ variant: 'error', title: 'Failed', description: err instanceof ApiError ? err.message : undefined }),
              })
            }
          >
            <Send className="size-3.5" strokeWidth={2} />
            Run renewal reminders
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="size-4" strokeWidth={2} />New campaign</Button>
        </div>
      </div>
      <CardContent className="px-0 py-0">
        {isLoading ? (
          <RowsSkeleton />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={Megaphone} title="No campaigns yet" description="Create a campaign or run the renewal reminders." action={<Button onClick={() => setNewOpen(true)}><Plus className="size-4" strokeWidth={2} />New campaign</Button>} />
        ) : (
          <Table>
            <THead><TR><TH>Campaign</TH><TH>Channel</TH><TH>Segment</TH><TH>Target</TH><TH>Status</TH><TH className="text-right">Delivered</TH></TR></THead>
            <TBody>
              {data.map((c) => (
                <TR key={c.name}>
                  <TD className="text-neutral-900">{c.campaign_name}</TD>
                  <TD>{c.channel}</TD>
                  <TD className="text-neutral-500">{c.segment ?? '—'}</TD>
                  <TD className="tabular-nums">{c.target_count}</TD>
                  <TD><Badge variant={campaignVariant(c.status)}>{c.status}</Badge></TD>
                  <TD className="text-right tabular-nums text-neutral-600">{c.delivered}{c.target_count > 0 ? ` (${Math.round(c.delivery_rate)}%)` : ''}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
      {newOpen && <NewCampaignDrawer onClose={() => setNewOpen(false)} />}
    </Card>
  )
}

function NewCampaignDrawer({ onClose }: { onClose: () => void }) {
  const { toast } = useToast()
  const create = useCreateCampaign()
  const { data: templates } = useTemplates()
  const [name, setName] = useState('')
  const [channel, setChannel] = useState('WhatsApp')
  const [segment, setSegment] = useState('')
  const [target, setTarget] = useState('')
  const [template, setTemplate] = useState('')

  function submit() {
    if (!name.trim()) return toast({ variant: 'error', title: 'Name the campaign' })
    create.mutate(
      { campaign_name: name, channel, segment: segment || undefined, target_count: Number(target) || 0, linked_whatsapp_template: template || undefined },
      { onSuccess: () => { toast({ variant: 'success', title: 'Campaign created' }); onClose() }, onError: (err) => toast({ variant: 'error', title: 'Failed', description: err instanceof ApiError ? err.message : undefined }) },
    )
  }

  return (
    <Drawer open onClose={onClose} title="New campaign" description="A messaging campaign to a member segment." footer={<><Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button><Button onClick={submit} disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create'}</Button></>}>
      <div className="space-y-5">
        <div><Label>Campaign name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. June Renewal Push" autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Channel</Label><Select value={channel} onChange={(e) => setChannel(e.target.value)}>{['WhatsApp', 'SMS', 'Email', 'Push', 'In-App'].map((c) => <option key={c}>{c}</option>)}</Select></div>
          <div><Label>Target count</Label><Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0" /></div>
        </div>
        <div><Label>Segment</Label><Input value={segment} onChange={(e) => setSegment(e.target.value)} placeholder="e.g. Expiring this month" /></div>
        <div>
          <Label>WhatsApp template (optional)</Label>
          <Select value={template} onChange={(e) => setTemplate(e.target.value)}>
            <option value="">None</option>
            {(templates ?? []).map((t) => <option key={t.name} value={t.template_name}>{t.template_name}</option>)}
          </Select>
        </div>
      </div>
    </Drawer>
  )
}

// ---------------- Templates ----------------

function TemplatesTab() {
  const { toast } = useToast()
  const { data, isLoading } = useTemplates()
  const submit = useSubmitTemplate()
  const sync = useSyncTemplate()
  const [newOpen, setNewOpen] = useState(false)
  const busy = submit.isPending || sync.isPending
  const onErr = (err: unknown) => toast({ variant: 'error', title: 'Action failed', description: err instanceof ApiError ? err.message : undefined })

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
        <span className="text-h3 font-semibold text-neutral-900">WhatsApp Templates</span>
        <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="size-4" strokeWidth={2} />New template</Button>
      </div>
      <CardContent className="px-0 py-0">
        {isLoading ? (
          <RowsSkeleton />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={MessageSquare} title="No templates yet" description="Create a WhatsApp message template and submit it to Meta." action={<Button onClick={() => setNewOpen(true)}><Plus className="size-4" strokeWidth={2} />New template</Button>} />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {data.map((t) => (
              <li key={t.name} className="px-5 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-body font-medium text-neutral-900">{t.template_name}</span>
                  <Badge variant={templateVariant(t.status)}>{t.status}</Badge>
                  <Badge variant="neutral">{t.category}</Badge>
                  <span className="ml-auto flex gap-1.5">
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => submit.mutate(t.template_name, { onSuccess: () => toast({ variant: 'success', title: 'Submitted to Meta' }), onError: onErr })}>Submit to Meta</Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => sync.mutate(t.template_name, { onSuccess: () => toast({ title: 'Synced' }), onError: onErr })}>Sync</Button>
                  </span>
                </div>
                <p className="text-small text-neutral-600 whitespace-pre-wrap">{t.body_text}</p>
                {t.rejection_reason && <p className="text-tiny text-danger-700 mt-1">{t.rejection_reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {newOpen && <NewTemplateDrawer onClose={() => setNewOpen(false)} />}
    </Card>
  )
}

function NewTemplateDrawer({ onClose }: { onClose: () => void }) {
  const { toast } = useToast()
  const create = useCreateTemplate()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('UTILITY')
  const [language, setLanguage] = useState('en')
  const [header, setHeader] = useState('')
  const [body, setBody] = useState('')
  const [footer, setFooter] = useState('')

  function submit() {
    if (!name.trim()) return toast({ variant: 'error', title: 'Name the template' })
    if (!body.trim()) return toast({ variant: 'error', title: 'Add the body text' })
    create.mutate(
      { template_name: name.trim().toLowerCase().replace(/\s+/g, '_'), body_text: body, category, language, header_text: header || undefined, footer_text: footer || undefined },
      { onSuccess: () => { toast({ variant: 'success', title: 'Template created' }); onClose() }, onError: (err) => toast({ variant: 'error', title: 'Failed', description: err instanceof ApiError ? err.message : undefined }) },
    )
  }

  return (
    <Drawer open onClose={onClose} title="New WhatsApp template" description="Use {{1}}, {{2}}… for placeholders." footer={<><Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button><Button onClick={submit} disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create'}</Button></>}>
      <div className="space-y-5">
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="renewal_reminder" autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Category</Label><Select value={category} onChange={(e) => setCategory(e.target.value)}>{['UTILITY', 'MARKETING', 'AUTHENTICATION'].map((c) => <option key={c}>{c}</option>)}</Select></div>
          <div><Label>Language</Label><Input value={language} onChange={(e) => setLanguage(e.target.value)} /></div>
        </div>
        <div><Label>Header (optional)</Label><Input value={header} onChange={(e) => setHeader(e.target.value)} /></div>
        <div><Label>Body</Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Hi {{1}}, your {{2}} membership expires on {{3}}." /></div>
        <div><Label>Footer (optional)</Label><Input value={footer} onChange={(e) => setFooter(e.target.value)} /></div>
      </div>
    </Drawer>
  )
}

// ---------------- Chatbot ----------------

function ChatbotTab() {
  const flows = useChatbotFlows()
  const sessions = useChatbotSessions()
  const [flow, setFlow] = useState<ChatbotFlowRow | null>(null)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-100"><span className="text-h3 font-semibold text-neutral-900">Flows</span></div>
        <CardContent className="px-0 py-0">
          {flows.isLoading ? <RowsSkeleton /> : !flows.data || flows.data.length === 0 ? (
            <EmptyState icon={MessageSquare} title="No chatbot flows" />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {flows.data.map((f) => (
                <li key={f.name}>
                  <button type="button" onClick={() => setFlow(f)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-neutral-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-small font-medium text-neutral-900">{f.flow_name}</div>
                      <div className="text-tiny text-neutral-500">{f.channel} · {f.node_count} nodes</div>
                    </div>
                    <Badge variant={f.is_active ? 'success' : 'neutral'}>{f.is_active ? 'Active' : 'Off'}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-100"><span className="text-h3 font-semibold text-neutral-900">Recent conversations</span></div>
        <CardContent className="px-0 py-0">
          {sessions.isLoading ? <RowsSkeleton /> : !sessions.data || sessions.data.length === 0 ? (
            <EmptyState icon={MessageSquare} title="No conversations yet" />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {sessions.data.map((s) => (
                <li key={s.name} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-small text-neutral-900">{s.customer_name ?? s.phone_number}</div>
                    <div className="text-tiny text-neutral-500">{s.turn_count} turns · {s.last_message_at ? relativeDay(s.last_message_at) : ''}</div>
                  </div>
                  <Badge variant={s.status === 'Active' ? 'brand' : s.status === 'Handed Over' ? 'warning' : 'neutral'}>{s.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {flow && <FlowDialog flow={flow.name} onClose={() => setFlow(null)} />}
    </div>
  )
}

function FlowDialog({ flow, onClose }: { flow: string; onClose: () => void }) {
  const { data, isLoading } = useFlowDetail(flow)
  return (
    <Dialog open onClose={onClose} title={data?.flow_name ?? 'Flow'} description={data ? `${data.channel} · starts at "${data.start_node_key ?? '—'}"` : undefined} widthClassName="max-w-lg">
      {isLoading || !data ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : (
        <ol className="space-y-2">
          {data.nodes.map((n) => (
            <li key={n.node_key} className="rounded-md border border-neutral-200 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-tiny text-neutral-500">{n.node_key}</span>
                <Badge variant="neutral">{n.node_type}</Badge>
                {n.next_node_key && <span className="text-tiny text-neutral-400">→ {n.next_node_key}</span>}
              </div>
              {n.prompt_text && <p className="text-small text-neutral-700 mt-1">{n.prompt_text}</p>}
              {n.linked_action && <p className="text-tiny text-brand-600 mt-0.5">action: {n.linked_action}</p>}
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  )
}

// ---------------- Referrals ----------------

function ReferralsTab() {
  const { data, isLoading } = useReferrals()
  const [newOpen, setNewOpen] = useState(false)

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
        <span className="text-h3 font-semibold text-neutral-900">Referrals</span>
        <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="size-4" strokeWidth={2} />New referral</Button>
      </div>
      <CardContent className="px-0 py-0">
        {isLoading ? <RowsSkeleton /> : !data || data.length === 0 ? (
          <EmptyState icon={Megaphone} title="No referrals yet" description="Track member referrals and rewards." action={<Button onClick={() => setNewOpen(true)}><Plus className="size-4" strokeWidth={2} />New referral</Button>} />
        ) : (
          <Table>
            <THead><TR><TH>Referrer</TH><TH>Referred</TH><TH>Reward</TH><TH>Status</TH><TH className="text-right">Action</TH></TR></THead>
            <TBody>
              {data.map((r) => (
                <TR key={r.name}>
                  <TD className="text-neutral-900">{r.referrer_name}</TD>
                  <TD>{r.referred_name}</TD>
                  <TD className="text-neutral-600">{r.reward_type ? `${r.reward_type}${r.reward_value ? ` · ${r.reward_type === 'Cash Credit' ? ksh(r.reward_value) : r.reward_value}` : ''}` : '—'}</TD>
                  <TD><Badge variant={referralVariant(r.status)}>{r.status}</Badge></TD>
                  <TD className="text-right"><ReferralAction referral={r} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
      {newOpen && <NewReferralDrawer onClose={() => setNewOpen(false)} />}
    </Card>
  )
}

function ReferralAction({ referral }: { referral: ReferralRow }) {
  const { toast } = useToast()
  const act = useReferralAction()
  const onErr = (err: unknown) => toast({ variant: 'error', title: 'Action failed', description: err instanceof ApiError ? err.message : undefined })

  const next: { label: string; action: 'mark_signed_up' | 'mark_first_payment' | 'mark_reward_paid'; args?: Record<string, unknown> } | null =
    referral.status === 'Pending' ? { label: 'Mark signed up', action: 'mark_signed_up' }
    : referral.status === 'Signed Up' ? { label: 'Mark first payment', action: 'mark_first_payment' }
    : referral.status === 'First Payment' || referral.status === 'Reward Earned'
      ? { label: 'Mark reward paid', action: 'mark_reward_paid', args: { reward_type: referral.reward_type ?? 'Free Days', reward_value: referral.reward_value || 0 } }
      : null

  if (!next) return <span className="text-tiny text-neutral-400">—</span>
  return (
    <Button variant="secondary" size="sm" disabled={act.isPending}
      onClick={() => act.mutate({ referral: referral.name, action: next.action, args: next.args }, { onSuccess: (r) => toast({ variant: 'success', title: `Now ${r.new_status}` }), onError: onErr })}>
      {next.label}
    </Button>
  )
}

function NewReferralDrawer({ onClose }: { onClose: () => void }) {
  const { toast } = useToast()
  const create = useCreateReferral()
  const [referrer, setReferrer] = useState<MemberRow | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [channel, setChannel] = useState('WhatsApp')
  const [rewardType, setRewardType] = useState('Free Days')
  const [rewardValue, setRewardValue] = useState('')

  function submit() {
    if (!referrer?.customer) return toast({ variant: 'error', title: 'Pick the referring member' })
    if (!name.trim()) return toast({ variant: 'error', title: "Enter the referred person's name" })
    create.mutate(
      { referrer_customer: referrer.customer, referred_name: name, referred_phone: phone || undefined, channel, reward_type: rewardType, reward_value: Number(rewardValue) || 0 },
      { onSuccess: () => { toast({ variant: 'success', title: 'Referral logged' }); onClose() }, onError: (err) => toast({ variant: 'error', title: 'Failed', description: err instanceof ApiError ? err.message : undefined }) },
    )
  }

  return (
    <Drawer open onClose={onClose} title="New referral" description="A member referring a new prospect." footer={<><Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button><Button onClick={submit} disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Log referral'}</Button></>}>
      <div className="space-y-5">
        <div>
          <Label>Referring member</Label>
          {referrer ? (
            <div className="flex items-center gap-3 rounded-md border border-neutral-200 px-3 py-2">
              <Avatar name={referrer.full_name} size="size-8" />
              <span className="flex-1 min-w-0 text-small text-neutral-900 truncate">{referrer.full_name}</span>
              <Button variant="ghost" size="sm" onClick={() => setReferrer(null)}>Change</Button>
            </div>
          ) : <MemberPicker onPick={setReferrer} />}
        </div>
        <div><Label>Referred person</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Phone</Label><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="2547…" /></div>
          <div><Label>Channel</Label><Select value={channel} onChange={(e) => setChannel(e.target.value)}>{['WhatsApp', 'SMS', 'Word of Mouth', 'Social Share', 'Email', 'In-Person', 'Other'].map((c) => <option key={c}>{c}</option>)}</Select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Reward type</Label><Select value={rewardType} onChange={(e) => setRewardType(e.target.value)}>{['Free Days', 'Discount', 'Cash Credit', 'Free Class', 'Merchandise', 'Free PT Session'].map((c) => <option key={c}>{c}</option>)}</Select></div>
          <div><Label>Reward value</Label><Input type="number" value={rewardValue} onChange={(e) => setRewardValue(e.target.value)} placeholder="0" /></div>
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
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" strokeWidth={2} />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members…" className="pl-9" />
      </div>
      {results.length > 0 && (
        <ul className="mt-2 rounded-md border border-neutral-200 divide-y divide-neutral-100 max-h-52 overflow-y-auto">
          {results.map((m) => (
            <li key={m.member}>
              <button type="button" onClick={() => onPick(m)} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-neutral-50 transition-colors">
                <Avatar name={m.full_name} size="size-7" />
                <span className="flex-1 min-w-0 text-small text-neutral-900 truncate">{m.full_name}</span>
                <span className="text-tiny text-neutral-400 font-mono">{m.member}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Kpi({ label, value, loading }: { label: string; value: number | undefined; loading?: boolean }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-small text-neutral-500 mb-1">{label}</div>
        {loading ? <Skeleton className="h-7 w-12" /> : <div className="text-h2 font-semibold tabular-nums text-neutral-900">{value ?? '—'}</div>}
      </CardContent>
    </Card>
  )
}

function RowsSkeleton() {
  return <div className="divide-y divide-neutral-100">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="px-5 py-3"><Skeleton className="h-6 w-full" /></div>)}</div>
}
