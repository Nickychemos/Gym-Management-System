import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { type DietItem, type DietPlanDetail, type MemberRow } from '@/lib/types'
import { useDietPlan, useSaveDietPlan } from '@/queries/coaching'
import { MemberPicker } from './Coaching'

interface MealState {
  meal_slot: string
  target_time: string
  target_kcal: number
  items: DietItem[]
}

function emptyItem(slot: string): DietItem {
  return { meal_slot: slot, food_name: '', portion_qty: 0, portion_unit: 'g', kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
}

function fromDetail(d: DietPlanDetail): MealState[] {
  return d.meals.map((m) => ({
    meal_slot: m.meal_slot,
    target_time: m.target_time?.slice(0, 5) ?? '',
    target_kcal: m.target_kcal,
    items: d.items.filter((i) => i.meal_slot === m.meal_slot),
  }))
}

export default function DietPlanBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'
  const { data, isLoading } = useDietPlan(id)

  if (!isNew && (isLoading || !data)) {
    return <BuilderSkeleton />
  }
  return <Builder existing={isNew ? null : data!} />
}

function Builder({ existing }: { existing: DietPlanDetail | null }) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const save = useSaveDietPlan()

  const [planName, setPlanName] = useState(existing?.plan_name ?? '')
  const [member, setMember] = useState<MemberRow | null>(null)
  const [targets, setTargets] = useState({
    kcal: existing?.daily_kcal_target ?? 2000,
    protein: existing?.daily_protein_g ?? 150,
    carbs: existing?.daily_carbs_g ?? 200,
    fat: existing?.daily_fat_g ?? 60,
  })
  const [meals, setMeals] = useState<MealState[]>(
    existing ? fromDetail(existing) : [{ meal_slot: 'Breakfast', target_time: '07:00', target_kcal: 0, items: [emptyItem('Breakfast')] }],
  )

  const memberName = existing?.member_name ?? member?.full_name

  function updateMeal(mi: number, patch: Partial<MealState>) {
    setMeals((s) => s.map((m, i) => (i === mi ? { ...m, ...patch } : m)))
  }
  function updateItem(mi: number, ii: number, patch: Partial<DietItem>) {
    setMeals((s) => s.map((m, i) => (i === mi ? { ...m, items: m.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) } : m)))
  }
  function addItem(mi: number) {
    setMeals((s) => s.map((m, i) => (i === mi ? { ...m, items: [...m.items, emptyItem(m.meal_slot)] } : m)))
  }
  function removeItem(mi: number, ii: number) {
    setMeals((s) => s.map((m, i) => (i === mi ? { ...m, items: m.items.filter((_, j) => j !== ii) } : m)))
  }
  function addMeal() {
    const slot = `Meal ${meals.length + 1}`
    setMeals((s) => [...s, { meal_slot: slot, target_time: '', target_kcal: 0, items: [emptyItem(slot)] }])
  }
  function removeMeal(mi: number) {
    setMeals((s) => s.filter((_, i) => i !== mi))
  }

  const totals = meals.flatMap((m) => m.items).reduce(
    (t, i) => ({ kcal: t.kcal + (i.kcal || 0), protein: t.protein + (i.protein_g || 0), carbs: t.carbs + (i.carbs_g || 0), fat: t.fat + (i.fat_g || 0) }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )

  function submit() {
    if (!planName.trim()) return toast({ variant: 'error', title: 'Name the plan' })
    const memberId = existing?.member ?? member?.member
    if (!memberId) return toast({ variant: 'error', title: 'Pick a member' })
    save.mutate(
      {
        name: existing?.name,
        plan_name: planName,
        member: memberId,
        daily_kcal_target: targets.kcal,
        daily_protein_g: targets.protein,
        daily_carbs_g: targets.carbs,
        daily_fat_g: targets.fat,
        meals: meals.map((m) => ({ meal_slot: m.meal_slot, target_time: m.target_time ? `${m.target_time}:00` : null, target_kcal: m.target_kcal })),
        items: meals.flatMap((m) => m.items.filter((i) => i.food_name.trim()).map((i) => ({ ...i, meal_slot: m.meal_slot }))),
      },
      {
        onSuccess: (r) => { toast({ variant: 'success', title: 'Diet plan saved' }); navigate(`/coaching/diet/${encodeURIComponent(r.name)}`) },
        onError: (err) => toast({ variant: 'error', title: 'Could not save', description: err instanceof ApiError ? err.message : undefined }),
      },
    )
  }

  const pct = targets.kcal ? Math.min(100, (totals.kcal / targets.kcal) * 100) : 0

  return (
    <div>
      <Link to="/coaching" className="inline-flex items-center gap-1.5 text-small text-neutral-500 hover:text-neutral-900 transition-colors mb-4">
        <ArrowLeft className="size-3.5" strokeWidth={2} />Coaching
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0 flex-1">
          <Input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Plan name (e.g. Cut Phase 1)" className="text-h2 font-semibold h-auto py-1 border-0 px-0 focus:ring-0 shadow-none" />
          <div className="mt-1">
            {existing ? (
              <span className="text-small text-neutral-500">{memberName} · <span className="font-mono">{existing.name}</span></span>
            ) : member ? (
              <span className="text-small text-neutral-500">{member.full_name} <button className="text-brand-600 ml-2" onClick={() => setMember(null)}>change</button></span>
            ) : (
              <div className="max-w-xs mt-1"><MemberPicker onPick={setMember} /></div>
            )}
          </div>
        </div>
        <Button onClick={submit} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save plan'}</Button>
      </div>

      {/* Macro targets */}
      <Card className="mb-4">
        <CardContent className="py-4">
          <div className="text-tiny font-medium uppercase tracking-wide text-neutral-400 mb-3">Daily Macro Targets</div>
          <div className="grid grid-cols-4 gap-3">
            <Target label="kcal" value={targets.kcal} onChange={(v) => setTargets((t) => ({ ...t, kcal: v }))} />
            <Target label="Protein (g)" value={targets.protein} onChange={(v) => setTargets((t) => ({ ...t, protein: v }))} />
            <Target label="Carbs (g)" value={targets.carbs} onChange={(v) => setTargets((t) => ({ ...t, carbs: v }))} />
            <Target label="Fat (g)" value={targets.fat} onChange={(v) => setTargets((t) => ({ ...t, fat: v }))} />
          </div>
        </CardContent>
      </Card>

      {/* Meals */}
      <div className="space-y-4">
        {meals.map((meal, mi) => {
          const sub = meal.items.reduce((t, i) => ({ kcal: t.kcal + (i.kcal || 0), p: t.p + (i.protein_g || 0), c: t.c + (i.carbs_g || 0), f: t.f + (i.fat_g || 0) }), { kcal: 0, p: 0, c: 0, f: 0 })
          return (
            <Card key={mi}>
              <CardContent className="py-4">
                <div className="flex items-center gap-3 mb-3">
                  <Input value={meal.meal_slot} onChange={(e) => updateMeal(mi, { meal_slot: e.target.value })} className="w-40 font-medium" placeholder="Meal" />
                  <Input type="time" value={meal.target_time} onChange={(e) => updateMeal(mi, { target_time: e.target.value })} className="w-32" />
                  <span className="ml-auto text-small text-neutral-500 tabular-nums">{sub.kcal} kcal · P{sub.p} C{sub.c} F{sub.f}</span>
                  <Button variant="ghost" size="sm" onClick={() => removeMeal(mi)} aria-label="Remove meal"><Trash2 className="size-3.5" strokeWidth={2} /></Button>
                </div>

                <div className="space-y-2">
                  <div className="hidden sm:grid grid-cols-[1fr_70px_60px_60px_60px_60px_32px] gap-2 text-tiny text-neutral-400 px-1">
                    <span>Food</span><span>Qty</span><span>kcal</span><span>P</span><span>C</span><span>F</span><span />
                  </div>
                  {meal.items.map((item, ii) => (
                    <div key={ii} className="grid grid-cols-[1fr_70px_60px_60px_60px_60px_32px] gap-2 items-center">
                      <Input value={item.food_name} onChange={(e) => updateItem(mi, ii, { food_name: e.target.value })} placeholder="Food" />
                      <Input type="number" value={item.portion_qty || ''} onChange={(e) => updateItem(mi, ii, { portion_qty: Number(e.target.value) })} placeholder="0" />
                      <Input type="number" value={item.kcal || ''} onChange={(e) => updateItem(mi, ii, { kcal: Number(e.target.value) })} placeholder="0" />
                      <Input type="number" value={item.protein_g || ''} onChange={(e) => updateItem(mi, ii, { protein_g: Number(e.target.value) })} placeholder="0" />
                      <Input type="number" value={item.carbs_g || ''} onChange={(e) => updateItem(mi, ii, { carbs_g: Number(e.target.value) })} placeholder="0" />
                      <Input type="number" value={item.fat_g || ''} onChange={(e) => updateItem(mi, ii, { fat_g: Number(e.target.value) })} placeholder="0" />
                      <Button variant="ghost" size="sm" onClick={() => removeItem(mi, ii)} aria-label="Remove"><Trash2 className="size-3.5 text-neutral-400" strokeWidth={2} /></Button>
                    </div>
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => addItem(mi)}><Plus className="size-3.5" strokeWidth={2} />Add food</Button>
              </CardContent>
            </Card>
          )
        })}
        <Button variant="secondary" onClick={addMeal}><Plus className="size-4" strokeWidth={2} />Add meal</Button>
      </div>

      {/* Daily total */}
      <Card className="mt-4 sticky bottom-4 shadow-[var(--shadow-overlay)]">
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-small font-medium text-neutral-900">Daily total</span>
            <span className="text-small tabular-nums text-neutral-700">
              {totals.kcal} / {targets.kcal} kcal · P{totals.protein} C{totals.carbs} F{totals.fat}
            </span>
          </div>
          <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
            <div className={cn('h-full transition-all', pct > 105 ? 'bg-danger-500' : pct >= 90 ? 'bg-success-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Target({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="number" value={value || ''} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

function BuilderSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-24 mb-4" />
      <Skeleton className="h-10 w-72 mb-6" />
      <Skeleton className="h-24 w-full rounded-lg mb-4" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  )
}
