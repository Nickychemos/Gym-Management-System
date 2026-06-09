import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Apple, Dumbbell, NotebookPen, Plus, Search } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { useDebounce } from '@/hooks/useDebounce'
import { ApiError } from '@/lib/api'
import { dateTime } from '@/lib/format'
import { subscriptionVariant } from '@/lib/status'
import { type MemberRow } from '@/lib/types'
import { useMembers } from '@/queries/members'
import {
  useCoachingNotes,
  useCoachingTrainers,
  useCreateCoachingNote,
  useDietPlans,
  useTrainingPlans,
} from '@/queries/coaching'

const TABS = [
  { value: 'diet', label: 'Diet Plans' },
  { value: 'training', label: 'Training Plans' },
  { value: 'notes', label: 'Notes' },
]

const CATEGORY_VARIANT: Record<string, NonNullable<BadgeProps['variant']>> = {
  Progress: 'success',
  Concern: 'warning',
  Injury: 'danger',
  Adjustment: 'info',
  Behavior: 'warning',
  General: 'neutral',
}

export default function CoachingPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const tab = params.get('tab') ?? 'diet'
  const [noteOpen, setNoteOpen] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-display font-semibold tracking-tight text-neutral-900">Coaching</h1>
          <p className="text-body text-neutral-500">Diet & training plans, progress notes</p>
        </div>
        {tab === 'diet' && <Button onClick={() => navigate('/coaching/diet/new')}><Plus className="size-4" strokeWidth={2} />New diet plan</Button>}
        {tab === 'training' && <Button onClick={() => navigate('/coaching/training/new')}><Plus className="size-4" strokeWidth={2} />New training plan</Button>}
        {tab === 'notes' && <Button onClick={() => setNoteOpen(true)}><Plus className="size-4" strokeWidth={2} />Add note</Button>}
      </div>

      <div className="mb-6"><Tabs tabs={TABS} value={tab} onValueChange={(v) => setParams({ tab: v })} /></div>

      {tab === 'diet' && <DietTab />}
      {tab === 'training' && <TrainingTab />}
      {tab === 'notes' && <NotesTab />}

      {noteOpen && <AddNoteDrawer onClose={() => setNoteOpen(false)} />}
    </div>
  )
}

function DietTab() {
  const navigate = useNavigate()
  const { branchParam } = useBranch()
  const { data, isLoading } = useDietPlans(undefined, branchParam)
  return (
    <Card className="overflow-hidden">
      {isLoading ? <RowsSkeleton /> : !data || data.length === 0 ? (
        <EmptyState icon={Apple} title="No diet plans yet" description="Build a nutrition plan for a member." action={<Button onClick={() => navigate('/coaching/diet/new')}><Plus className="size-4" strokeWidth={2} />New diet plan</Button>} />
      ) : (
        <Table>
          <THead><TR><TH>Plan</TH><TH>Member</TH><TH>Status</TH><TH>Target</TH><TH className="text-right">Foods</TH></TR></THead>
          <TBody>
            {data.map((p) => (
              <TR key={p.name} clickable onClick={() => navigate(`/coaching/diet/${encodeURIComponent(p.name)}`)}>
                <TD className="text-neutral-900">{p.plan_name}</TD>
                <TD>{p.member_name}</TD>
                <TD><Badge variant={subscriptionVariant(p.status)}>{p.status}</Badge></TD>
                <TD className="tabular-nums text-neutral-600">{p.daily_kcal_target ? `${p.daily_kcal_target} kcal` : '—'}</TD>
                <TD className="text-right tabular-nums">{p.item_count}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  )
}

function TrainingTab() {
  const navigate = useNavigate()
  const { branchParam } = useBranch()
  const { data, isLoading } = useTrainingPlans(undefined, branchParam)
  return (
    <Card className="overflow-hidden">
      {isLoading ? <RowsSkeleton /> : !data || data.length === 0 ? (
        <EmptyState icon={Dumbbell} title="No training plans yet" description="Build a workout program for a member." action={<Button onClick={() => navigate('/coaching/training/new')}><Plus className="size-4" strokeWidth={2} />New training plan</Button>} />
      ) : (
        <Table>
          <THead><TR><TH>Plan</TH><TH>Member</TH><TH>Goal</TH><TH>Status</TH><TH className="text-right">Exercises</TH></TR></THead>
          <TBody>
            {data.map((p) => (
              <TR key={p.name} clickable onClick={() => navigate(`/coaching/training/${encodeURIComponent(p.name)}`)}>
                <TD className="text-neutral-900">{p.plan_name}</TD>
                <TD>{p.member_name}</TD>
                <TD className="text-neutral-600">{p.goal ?? '—'}</TD>
                <TD><Badge variant={subscriptionVariant(p.status)}>{p.status}</Badge></TD>
                <TD className="text-right tabular-nums">{p.set_count}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  )
}

function NotesTab() {
  const { branchParam } = useBranch()
  const { data, isLoading } = useCoachingNotes(undefined, branchParam)
  return (
    <Card className="overflow-hidden">
      <CardContent className="px-0 py-0">
        {isLoading ? <RowsSkeleton /> : !data || data.length === 0 ? (
          <EmptyState icon={NotebookPen} title="No notes yet" description="Log progress, concerns and adjustments." />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {data.map((n) => (
              <li key={n.name} className="px-5 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={CATEGORY_VARIANT[n.category] ?? 'neutral'}>{n.category}</Badge>
                  <span className="text-small font-medium text-neutral-900">{n.member_name}</span>
                  <span className="text-tiny text-neutral-400 ml-auto">{dateTime(n.note_date)}{n.trainer_name ? ` · ${n.trainer_name}` : ''}</span>
                </div>
                <p className="text-small text-neutral-700 whitespace-pre-wrap">{n.note_text}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function AddNoteDrawer({ onClose, presetMember }: { onClose: () => void; presetMember?: MemberRow | null }) {
  const { toast } = useToast()
  const create = useCreateCoachingNote()
  const { data: trainers } = useCoachingTrainers()
  const [member, setMember] = useState<MemberRow | null>(presetMember ?? null)
  const [category, setCategory] = useState('Progress')
  const [trainer, setTrainer] = useState('')
  const [text, setText] = useState('')

  function submit() {
    if (!member) return toast({ variant: 'error', title: 'Pick a member' })
    if (!text.trim()) return toast({ variant: 'error', title: 'Write the note' })
    create.mutate(
      { member: member.member, note_text: text, category, trainer: trainer || undefined },
      { onSuccess: () => { toast({ variant: 'success', title: 'Note added' }); onClose() }, onError: (err) => toast({ variant: 'error', title: 'Failed', description: err instanceof ApiError ? err.message : undefined }) },
    )
  }

  return (
    <Drawer open onClose={onClose} title="Add coaching note" footer={<><Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button><Button onClick={submit} disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Save note'}</Button></>}>
      <div className="space-y-5">
        <div>
          <Label>Member</Label>
          {member ? (
            <div className="flex items-center gap-3 rounded-md border border-neutral-200 px-3 py-2">
              <Avatar name={member.full_name} size="size-8" />
              <span className="flex-1 min-w-0 text-small text-neutral-900 truncate">{member.full_name}</span>
              {!presetMember && <Button variant="ghost" size="sm" onClick={() => setMember(null)}>Change</Button>}
            </div>
          ) : <MemberPicker onPick={setMember} />}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Category</Label><Select value={category} onChange={(e) => setCategory(e.target.value)}>{['Progress', 'Concern', 'Adjustment', 'Injury', 'Behavior', 'General'].map((c) => <option key={c}>{c}</option>)}</Select></div>
          <div><Label>Trainer</Label><Select value={trainer} onChange={(e) => setTrainer(e.target.value)}><option value="">—</option>{(trainers ?? []).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></div>
        </div>
        <div><Label>Note</Label><Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened, what to adjust…" className="min-h-28" /></div>
      </div>
    </Drawer>
  )
}

export function MemberPicker({ onPick }: { onPick: (m: MemberRow) => void }) {
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

function RowsSkeleton() {
  return <div className="divide-y divide-neutral-100">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="px-5 py-3"><Skeleton className="h-6 w-full" /></div>)}</div>
}
