import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Smile } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Drawer } from '@/components/ui/drawer'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table'
import { Tabs } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useBranch } from '@/context/BranchContext'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { dateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type MemberRow } from '@/lib/types'
import { MemberPicker } from '@/pages/coaching/Coaching'
import {
  useCreateSurveyTemplate,
  useNpsDashboard,
  useRecordResponse,
  useSetTemplateActive,
  useSurveyResponses,
  useSurveyTemplates,
} from '@/queries/surveys'

const TABS = [
  { value: 'nps', label: 'NPS Dashboard' },
  { value: 'templates', label: 'Templates' },
  { value: 'responses', label: 'Responses' },
]

const CAT_VARIANT: Record<string, NonNullable<BadgeProps['variant']>> = {
  Promoter: 'success',
  Passive: 'neutral',
  Detractor: 'danger',
}

export default function SurveysPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'nps'
  const [recordOpen, setRecordOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-display font-semibold tracking-tight text-neutral-900">Surveys & NPS</h1>
          <p className="text-body text-neutral-500">Member feedback & loyalty</p>
        </div>
        {tab === 'templates' ? (
          <Button onClick={() => setNewOpen(true)}><Plus className="size-4" strokeWidth={2} />New survey</Button>
        ) : (
          <Button onClick={() => setRecordOpen(true)}><Plus className="size-4" strokeWidth={2} />Record response</Button>
        )}
      </div>

      <div className="mb-6"><Tabs tabs={TABS} value={tab} onValueChange={(v) => setParams({ tab: v })} /></div>

      {tab === 'nps' && <NpsTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'responses' && <ResponsesTab />}

      {recordOpen && <RecordResponseDrawer onClose={() => setRecordOpen(false)} />}
      {newOpen && <NewTemplateDrawer onClose={() => setNewOpen(false)} />}
    </div>
  )
}

function npsColor(score: number): string {
  if (score > 50) return 'text-success-700'
  if (score >= 30) return 'text-success-500'
  if (score >= 0) return 'text-warning-700'
  return 'text-danger-700'
}

function NpsTab() {
  const { branchParam } = useBranch()
  const { data, isLoading } = useNpsDashboard(30, branchParam)
  if (isLoading) return <div className="grid grid-cols-1 lg:grid-cols-3 gap-4"><Skeleton className="h-64 rounded-lg" /><Skeleton className="h-64 rounded-lg lg:col-span-2" /></div>
  const score = data?.score
  if (!data?.template || !score || score.nps_score === null) {
    return <Card><EmptyState icon={Smile} title="No NPS data yet" description="Create an active NPS survey and record responses to see the score." /></Card>
  }
  const total = score.total_responses || 1
  const segs = [
    { label: 'Promoters', n: score.promoters, cls: 'bg-success-500' },
    { label: 'Passives', n: score.passives, cls: 'bg-neutral-300' },
    { label: 'Detractors', n: score.detractors, cls: 'bg-danger-500' },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader><CardTitle>Net Promoter Score</CardTitle><span className="text-small text-neutral-500">{score.window_days}d</span></CardHeader>
        <CardContent className="text-center py-6">
          <div className={cn('text-[64px] leading-none font-semibold tabular-nums', npsColor(score.nps_score))}>{score.nps_score}</div>
          <div className="mt-3 text-small text-neutral-500">{score.total_responses} responses</div>
          {/* stacked bar */}
          <div className="mt-5 flex h-2.5 rounded-full overflow-hidden bg-neutral-100">
            {segs.map((s) => <div key={s.label} className={s.cls} style={{ width: `${(s.n / total) * 100}%` }} />)}
          </div>
          <div className="mt-3 flex justify-between text-tiny">
            {segs.map((s) => (
              <div key={s.label} className="text-center">
                <div className="font-semibold tabular-nums text-neutral-900">{s.n}</div>
                <div className="text-neutral-400">{s.label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Recent responses</CardTitle><span className="text-small text-neutral-500">{data.template}</span></CardHeader>
        <CardContent className="px-0 py-0">
          {!data.recent || data.recent.length === 0 ? (
            <EmptyState title="No responses yet" />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {data.recent.map((r) => (
                <li key={r.name} className="flex items-start gap-3 px-5 py-3">
                  <span className={cn('mt-0.5 inline-flex size-8 items-center justify-center rounded-full text-small font-semibold tabular-nums', r.nps_category === 'Promoter' ? 'bg-success-50 text-success-700' : r.nps_category === 'Detractor' ? 'bg-danger-50 text-danger-700' : 'bg-neutral-100 text-neutral-600')}>{r.nps_score ?? '—'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-small font-medium text-neutral-900">{r.member_name}</span>
                      {r.nps_category && <Badge variant={CAT_VARIANT[r.nps_category] ?? 'neutral'}>{r.nps_category}</Badge>}
                      <span className="text-tiny text-neutral-400 ml-auto">{dateTime(r.submitted_on)}</span>
                    </div>
                    {r.comment && <p className="text-small text-neutral-600 mt-0.5">{r.comment}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function TemplatesTab() {
  const { toast } = useToast()
  const { data, isLoading } = useSurveyTemplates()
  const setActive = useSetTemplateActive()
  return (
    <Card className="overflow-hidden">
      {isLoading ? <RowsSkeleton /> : !data || data.length === 0 ? (
        <EmptyState icon={Smile} title="No surveys yet" description="Create an NPS or feedback survey." />
      ) : (
        <Table>
          <THead><TR><TH>Survey</TH><TH>Type</TH><TH>Trigger</TH><TH>Questions</TH><TH>Responses</TH><TH>Active</TH></TR></THead>
          <TBody>
            {data.map((t) => (
              <TR key={t.name}>
                <TD className="text-neutral-900">{t.survey_name}</TD>
                <TD><Badge variant={t.survey_type === 'NPS' ? 'brand' : 'neutral'}>{t.survey_type}</Badge></TD>
                <TD className="text-neutral-600">{t.trigger_event ?? '—'}</TD>
                <TD className="tabular-nums">{t.question_count}</TD>
                <TD className="tabular-nums">{t.response_count}</TD>
                <TD>
                  <Checkbox checked={!!t.is_active} disabled={setActive.isPending} onChange={(e) => setActive.mutate({ name: t.name, active: e.target.checked }, { onError: (err) => toast({ variant: 'error', title: 'Failed', description: err instanceof ApiError ? err.message : undefined }) })} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  )
}

function ResponsesTab() {
  const { branchParam } = useBranch()
  const { data, isLoading } = useSurveyResponses(undefined, branchParam)
  return (
    <Card className="overflow-hidden">
      <CardContent className="px-0 py-0">
        {isLoading ? <RowsSkeleton /> : !data || data.length === 0 ? (
          <EmptyState icon={Smile} title="No responses yet" />
        ) : (
          <Table>
            <THead><TR><TH>Member</TH><TH>Survey</TH><TH>Score</TH><TH>Category</TH><TH>Via</TH><TH>When</TH></TR></THead>
            <TBody>
              {data.map((r) => (
                <TR key={r.name}>
                  <TD className="text-neutral-900">{r.member_name}</TD>
                  <TD className="text-neutral-600">{r.survey_template}</TD>
                  <TD className="tabular-nums">{r.nps_score ?? '—'}</TD>
                  <TD>{r.nps_category ? <Badge variant={CAT_VARIANT[r.nps_category] ?? 'neutral'}>{r.nps_category}</Badge> : '—'}</TD>
                  <TD className="text-neutral-500">{r.submitted_via}</TD>
                  <TD className="text-neutral-500 whitespace-nowrap">{dateTime(r.submitted_on)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function RecordResponseDrawer({ onClose }: { onClose: () => void }) {
  const { toast } = useToast()
  const record = useRecordResponse()
  const { data: templates } = useSurveyTemplates()
  const [member, setMember] = useState<MemberRow | null>(null)
  const [template, setTemplate] = useState('')
  const [score, setScore] = useState('')
  const [comment, setComment] = useState('')

  function submit() {
    if (!member) return toast({ variant: 'error', title: 'Pick a member' })
    if (!template) return toast({ variant: 'error', title: 'Pick a survey' })
    record.mutate(
      { survey_template: template, member: member.member, nps_score: score === '' ? undefined : Number(score), comment: comment || undefined },
      { onSuccess: () => { toast({ variant: 'success', title: 'Response recorded' }); onClose() }, onError: (err) => toast({ variant: 'error', title: 'Failed', description: err instanceof ApiError ? err.message : undefined }) },
    )
  }

  return (
    <Drawer open onClose={onClose} title="Record response" description="Log a member's survey answer." footer={<><Button variant="secondary" onClick={onClose} disabled={record.isPending}>Cancel</Button><Button onClick={submit} disabled={record.isPending}>{record.isPending ? 'Saving…' : 'Record'}</Button></>}>
      <div className="space-y-5">
        <div>
          <Label>Member</Label>
          {member ? (
            <div className="flex items-center gap-3 rounded-md border border-neutral-200 px-3 py-2">
              <Avatar name={member.full_name} size="size-8" />
              <span className="flex-1 min-w-0 text-small text-neutral-900 truncate">{member.full_name}</span>
              <Button variant="ghost" size="sm" onClick={() => setMember(null)}>Change</Button>
            </div>
          ) : <MemberPicker onPick={setMember} />}
        </div>
        <div><Label>Survey</Label><Select value={template} onChange={(e) => setTemplate(e.target.value)}><option value="">Select…</option>{(templates ?? []).map((t) => <option key={t.name} value={t.name}>{t.survey_name}</option>)}</Select></div>
        <div>
          <Label>NPS score (0–10)</Label>
          <div className="flex gap-1">
            {Array.from({ length: 11 }).map((_, i) => (
              <button key={i} type="button" onClick={() => setScore(String(i))} className={cn('flex-1 rounded-md border py-1.5 text-tiny font-medium tabular-nums transition-colors', String(i) === score ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50')}>{i}</button>
            ))}
          </div>
        </div>
        <div><Label>Comment (optional)</Label><Textarea value={comment} onChange={(e) => setComment(e.target.value)} /></div>
      </div>
    </Drawer>
  )
}

function NewTemplateDrawer({ onClose }: { onClose: () => void }) {
  const { toast } = useToast()
  const create = useCreateSurveyTemplate()
  const [name, setName] = useState('')
  const [type, setType] = useState('NPS')
  const [trigger, setTrigger] = useState('Manual')

  function submit() {
    if (!name.trim()) return toast({ variant: 'error', title: 'Name the survey' })
    create.mutate(
      { survey_name: name, survey_type: type, trigger_event: trigger },
      { onSuccess: () => { toast({ variant: 'success', title: 'Survey created' }); onClose() }, onError: (err) => toast({ variant: 'error', title: 'Failed', description: err instanceof ApiError ? err.message : undefined }) },
    )
  }

  return (
    <Drawer open onClose={onClose} title="New survey" description="NPS surveys auto-include the 0–10 question." footer={<><Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button><Button onClick={submit} disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create'}</Button></>}>
      <div className="space-y-5">
        <div><Label>Survey name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q3 NPS Check-in" autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Type</Label><Select value={type} onChange={(e) => setType(e.target.value)}>{['NPS', 'CSAT', 'Post-Class Feedback', 'Custom'].map((c) => <option key={c}>{c}</option>)}</Select></div>
          <div><Label>Trigger</Label><Select value={trigger} onChange={(e) => setTrigger(e.target.value)}>{['Manual', 'After First Class', 'After Renewal', 'After Cancellation', 'Quarterly', 'After 30 Days'].map((c) => <option key={c}>{c}</option>)}</Select></div>
        </div>
      </div>
    </Drawer>
  )
}

function RowsSkeleton() {
  return <div className="divide-y divide-neutral-100">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="px-5 py-3"><Skeleton className="h-6 w-full" /></div>)}</div>
}
