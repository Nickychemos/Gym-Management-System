import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import {
  type CoachingNote,
  type DietItem,
  type DietMeal,
  type DietPlanDetail,
  type DietPlanRow,
  type ExerciseSet,
  type TrainingPlanDetail,
  type TrainingPlanRow,
} from '@/lib/types'

function useCoachingInvalidation() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['coaching'] })
}

export function useCoachingTrainers() {
  return useQuery({
    queryKey: ['coaching', 'trainers'],
    queryFn: () =>
      api.callMethodGet<{ value: string; label: string }[]>(
        'gym_management.coaching.coaching_trainers',
      ),
    staleTime: 5 * 60 * 1000,
  })
}

// ---- Diet ----

export function useDietPlans(member?: string) {
  return useQuery({
    queryKey: ['coaching', 'diet-plans', member ?? null],
    queryFn: () =>
      api.callMethodGet<DietPlanRow[]>('gym_management.coaching.list_diet_plans', { member }),
  })
}

export function useDietPlan(name: string | undefined) {
  return useQuery({
    queryKey: ['coaching', 'diet-plan', name],
    queryFn: () =>
      api.callMethodGet<DietPlanDetail>('gym_management.coaching.get_diet_plan', { name }),
    enabled: !!name && name !== 'new',
  })
}

export interface DietPlanPayload {
  name?: string
  plan_name: string
  member: string
  trainer?: string
  status?: string
  start_date?: string
  end_date?: string
  daily_kcal_target?: number
  daily_protein_g?: number
  daily_carbs_g?: number
  daily_fat_g?: number
  meals: DietMeal[]
  items: DietItem[]
}

export function useSaveDietPlan() {
  const invalidate = useCoachingInvalidation()
  return useMutation({
    mutationFn: (plan: DietPlanPayload) =>
      api.callMethod<{ ok: boolean; name: string }>('gym_management.coaching.save_diet_plan', { plan }),
    onSuccess: invalidate,
  })
}

// ---- Training ----

export function useTrainingPlans(member?: string) {
  return useQuery({
    queryKey: ['coaching', 'training-plans', member ?? null],
    queryFn: () =>
      api.callMethodGet<TrainingPlanRow[]>('gym_management.coaching.list_training_plans', { member }),
  })
}

export function useTrainingPlan(name: string | undefined) {
  return useQuery({
    queryKey: ['coaching', 'training-plan', name],
    queryFn: () =>
      api.callMethodGet<TrainingPlanDetail>('gym_management.coaching.get_training_plan', { name }),
    enabled: !!name && name !== 'new',
  })
}

export interface TrainingPlanPayload {
  name?: string
  plan_name: string
  member: string
  trainer?: string
  goal?: string
  status?: string
  start_date?: string
  end_date?: string
  exercise_sets: ExerciseSet[]
}

export function useSaveTrainingPlan() {
  const invalidate = useCoachingInvalidation()
  return useMutation({
    mutationFn: (plan: TrainingPlanPayload) =>
      api.callMethod<{ ok: boolean; name: string }>('gym_management.coaching.save_training_plan', { plan }),
    onSuccess: invalidate,
  })
}

// ---- Notes ----

export function useCoachingNotes(member?: string) {
  return useQuery({
    queryKey: ['coaching', 'notes', member ?? null],
    queryFn: () =>
      api.callMethodGet<CoachingNote[]>('gym_management.coaching.list_coaching_notes', { member }),
  })
}

export function useCreateCoachingNote() {
  const invalidate = useCoachingInvalidation()
  return useMutation({
    mutationFn: (input: {
      member: string
      note_text: string
      category: string
      trainer?: string
    }) => api.callMethod('gym_management.coaching.create_coaching_note', { ...input }),
    onSuccess: invalidate,
  })
}
