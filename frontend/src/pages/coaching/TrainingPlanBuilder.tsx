import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { type ExerciseSet, type MemberRow, type TrainingPlanDetail } from '@/lib/types'
import { useSaveTrainingPlan, useTrainingPlan } from '@/queries/coaching'
import { MemberPicker } from './Coaching'

const GOALS = ['Lose Weight', 'Build Muscle', 'General Fitness', 'Strength', 'Endurance', 'Rehab', 'Mobility', 'Other']

interface SessionState {
  session_name: string
  exercises: ExerciseSet[]
}

function emptyExercise(session: string): ExerciseSet {
  return { session_name: session, exercise_name: '', sets: 3, reps: '10', weight_kg: 0, rest_seconds: 90, tempo: null }
}

function fromDetail(d: TrainingPlanDetail): SessionState[] {
  const names: string[] = []
  for (const e of d.exercise_sets) if (!names.includes(e.session_name)) names.push(e.session_name)
  return (names.length ? names : ['Session 1']).map((n) => ({ session_name: n, exercises: d.exercise_sets.filter((e) => e.session_name === n) }))
}

export default function TrainingPlanBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'
  const { data, isLoading } = useTrainingPlan(id)
  if (!isNew && (isLoading || !data)) return <BuilderSkeleton />
  return <Builder existing={isNew ? null : data!} />
}

function Builder({ existing }: { existing: TrainingPlanDetail | null }) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const save = useSaveTrainingPlan()

  const [planName, setPlanName] = useState(existing?.plan_name ?? '')
  const [member, setMember] = useState<MemberRow | null>(null)
  const [goal, setGoal] = useState(existing?.goal ?? 'Build Muscle')
  const [sessions, setSessions] = useState<SessionState[]>(
    existing ? fromDetail(existing) : [{ session_name: 'Session 1', exercises: [emptyExercise('Session 1')] }],
  )

  function updateSession(si: number, name: string) {
    setSessions((s) => s.map((ss, i) => (i === si ? { ...ss, session_name: name, exercises: ss.exercises.map((e) => ({ ...e, session_name: name })) } : ss)))
  }
  function updateExercise(si: number, ei: number, patch: Partial<ExerciseSet>) {
    setSessions((s) => s.map((ss, i) => (i === si ? { ...ss, exercises: ss.exercises.map((e, j) => (j === ei ? { ...e, ...patch } : e)) } : ss)))
  }
  function addExercise(si: number) {
    setSessions((s) => s.map((ss, i) => (i === si ? { ...ss, exercises: [...ss.exercises, emptyExercise(ss.session_name)] } : ss)))
  }
  function removeExercise(si: number, ei: number) {
    setSessions((s) => s.map((ss, i) => (i === si ? { ...ss, exercises: ss.exercises.filter((_, j) => j !== ei) } : ss)))
  }
  function addSession() {
    const n = `Session ${sessions.length + 1}`
    setSessions((s) => [...s, { session_name: n, exercises: [emptyExercise(n)] }])
  }
  function removeSession(si: number) {
    setSessions((s) => s.filter((_, i) => i !== si))
  }

  function submit() {
    if (!planName.trim()) return toast({ variant: 'error', title: 'Name the plan' })
    const memberId = existing?.member ?? member?.member
    if (!memberId) return toast({ variant: 'error', title: 'Pick a member' })
    save.mutate(
      {
        name: existing?.name,
        plan_name: planName,
        member: memberId,
        goal,
        exercise_sets: sessions.flatMap((ss) => ss.exercises.filter((e) => e.exercise_name.trim()).map((e) => ({ ...e, session_name: ss.session_name }))),
      },
      {
        onSuccess: (r) => { toast({ variant: 'success', title: 'Training plan saved' }); navigate(`/coaching/training/${encodeURIComponent(r.name)}`) },
        onError: (err) => toast({ variant: 'error', title: 'Could not save', description: err instanceof ApiError ? err.message : undefined }),
      },
    )
  }

  return (
    <div>
      <Link to="/coaching" className="inline-flex items-center gap-1.5 text-small text-neutral-500 hover:text-neutral-900 transition-colors mb-4">
        <ArrowLeft className="size-3.5" strokeWidth={2} />Coaching
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0 flex-1">
          <Input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Plan name (e.g. Strength Block A)" className="text-h2 font-semibold h-auto py-1 border-0 px-0 focus:ring-0 shadow-none" />
          <div className="mt-1 flex items-center gap-3">
            {existing ? (
              <span className="text-small text-neutral-500">{existing.member_name} · <span className="font-mono">{existing.name}</span></span>
            ) : member ? (
              <span className="text-small text-neutral-500">{member.full_name} <button className="text-brand-600 ml-2" onClick={() => setMember(null)}>change</button></span>
            ) : (
              <div className="max-w-xs"><MemberPicker onPick={setMember} /></div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44"><Select value={goal} onChange={(e) => setGoal(e.target.value)}>{GOALS.map((g) => <option key={g}>{g}</option>)}</Select></div>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save plan'}</Button>
        </div>
      </div>

      <div className="space-y-4">
        {sessions.map((session, si) => (
          <Card key={si}>
            <CardContent className="py-4">
              <div className="flex items-center gap-3 mb-3">
                <Input value={session.session_name} onChange={(e) => updateSession(si, e.target.value)} className="w-48 font-medium" placeholder="Session" />
                <span className="text-small text-neutral-400 ml-auto">{session.exercises.length} exercises</span>
                <Button variant="ghost" size="sm" onClick={() => removeSession(si)} aria-label="Remove session"><Trash2 className="size-3.5" strokeWidth={2} /></Button>
              </div>
              <div className="space-y-2">
                <div className="hidden sm:grid grid-cols-[1fr_56px_70px_70px_70px_32px] gap-2 text-tiny text-neutral-400 px-1">
                  <span>Exercise</span><span>Sets</span><span>Reps</span><span>Weight</span><span>Rest s</span><span />
                </div>
                {session.exercises.map((ex, ei) => (
                  <div key={ei} className="grid grid-cols-[1fr_56px_70px_70px_70px_32px] gap-2 items-center">
                    <Input value={ex.exercise_name} onChange={(e) => updateExercise(si, ei, { exercise_name: e.target.value })} placeholder="Exercise" />
                    <Input type="number" value={ex.sets || ''} onChange={(e) => updateExercise(si, ei, { sets: Number(e.target.value) })} placeholder="3" />
                    <Input value={ex.reps ?? ''} onChange={(e) => updateExercise(si, ei, { reps: e.target.value })} placeholder="10" />
                    <Input type="number" value={ex.weight_kg || ''} onChange={(e) => updateExercise(si, ei, { weight_kg: Number(e.target.value) })} placeholder="0" />
                    <Input type="number" value={ex.rest_seconds || ''} onChange={(e) => updateExercise(si, ei, { rest_seconds: Number(e.target.value) })} placeholder="90" />
                    <Button variant="ghost" size="sm" onClick={() => removeExercise(si, ei)} aria-label="Remove"><Trash2 className="size-3.5 text-neutral-400" strokeWidth={2} /></Button>
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => addExercise(si)}><Plus className="size-3.5" strokeWidth={2} />Add exercise</Button>
            </CardContent>
          </Card>
        ))}
        <Button variant="secondary" onClick={addSession}><Plus className="size-4" strokeWidth={2} />Add session</Button>
      </div>
    </div>
  )
}

function BuilderSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-24 mb-4" />
      <Skeleton className="h-10 w-72 mb-6" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  )
}
