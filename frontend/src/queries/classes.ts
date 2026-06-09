import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { type ClassFormOptions, type ClassScheduleRow } from '@/lib/types'

function useClassInvalidation() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['class-types'] })
    qc.invalidateQueries({ queryKey: ['class-schedules'] })
    qc.invalidateQueries({ queryKey: ['schedule'] }) // grid may have new sessions
  }
}

export function useClassFormOptions() {
  return useQuery({
    queryKey: ['class-form-options'],
    queryFn: () =>
      api.callMethodGet<ClassFormOptions>('gym_management.classes.class_form_options'),
    staleTime: 5 * 60 * 1000,
  })
}

// ---- Class Types ----

export interface ClassTypeInput {
  class_type_name: string
  default_duration_minutes: number
  default_capacity: number
  display_color?: string
  intensity_level?: string
  description?: string
  short_code?: string
}

export function useCreateClassType() {
  const invalidate = useClassInvalidation()
  return useMutation({
    mutationFn: (input: ClassTypeInput) =>
      api.callMethod('gym_management.classes.create_class_type', { ...input }),
    onSuccess: invalidate,
  })
}

export function useUpdateClassType() {
  const invalidate = useClassInvalidation()
  return useMutation({
    mutationFn: (vars: { name: string } & Partial<ClassTypeInput>) =>
      api.callMethod('gym_management.classes.update_class_type', { ...vars }),
    onSuccess: invalidate,
  })
}

export function useSetClassTypeActive() {
  const invalidate = useClassInvalidation()
  return useMutation({
    mutationFn: (vars: { name: string; active: boolean }) =>
      api.callMethod('gym_management.classes.set_class_type_active', {
        name: vars.name,
        active: vars.active ? 1 : 0,
      }),
    onSuccess: invalidate,
  })
}

// ---- Class Schedules ----

export function useClassSchedules(branch?: string) {
  return useQuery({
    queryKey: ['class-schedules', branch ?? null],
    queryFn: () =>
      api.callMethodGet<ClassScheduleRow[]>(
        'gym_management.classes.list_class_schedules',
        { branch },
      ),
  })
}

export interface ScheduleInput {
  class_type: string
  trainer: string
  branch: string
  start_time: string
  days: string[]
  effective_from?: string
  effective_until?: string
  room?: string
  schedule_name?: string
  capacity?: number
}

export function useCreateClassSchedule() {
  const invalidate = useClassInvalidation()
  return useMutation({
    mutationFn: (input: ScheduleInput) =>
      api.callMethod('gym_management.classes.create_class_schedule', { ...input }),
    onSuccess: invalidate,
  })
}

export function useUpdateClassSchedule() {
  const invalidate = useClassInvalidation()
  return useMutation({
    mutationFn: (vars: {
      name: string
      trainer?: string
      branch?: string
      room?: string
      start_time?: string
      capacity?: number
      effective_from?: string
      effective_until?: string
      days?: string[]
      is_active?: number
    }) => api.callMethod('gym_management.classes.update_class_schedule', { ...vars }),
    onSuccess: invalidate,
  })
}

export function useSetClassScheduleActive() {
  const invalidate = useClassInvalidation()
  return useMutation({
    mutationFn: (vars: { name: string; active: boolean }) =>
      api.callMethod('gym_management.classes.set_class_schedule_active', {
        name: vars.name,
        active: vars.active ? 1 : 0,
      }),
    onSuccess: invalidate,
  })
}
