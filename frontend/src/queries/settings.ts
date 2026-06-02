import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import {
  type IntegrationsStatus,
  type PlanRow,
  type SettingsData,
  type StaffUser,
} from '@/lib/types'

function useSettingsInvalidation() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['settings'] })
    qc.invalidateQueries({ queryKey: ['membership-plans'] })
  }
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings', 'config'],
    queryFn: () =>
      api.callMethodGet<SettingsData>('gym_management.settings.get_settings'),
  })
}

export function useUpdateGymSettings() {
  const invalidate = useSettingsInvalidation()
  return useMutation({
    mutationFn: (fields: Record<string, unknown>) =>
      api.callMethod('gym_management.settings.update_gym_settings', fields),
    onSuccess: invalidate,
  })
}

export function useUpdateBrandSettings() {
  const invalidate = useSettingsInvalidation()
  return useMutation({
    mutationFn: (fields: Record<string, unknown>) =>
      api.callMethod('gym_management.settings.update_brand_settings', fields),
    onSuccess: invalidate,
  })
}

// ---- Plans ----

export function usePlans() {
  return useQuery({
    queryKey: ['settings', 'plans'],
    queryFn: () =>
      api.callMethodGet<PlanRow[]>('gym_management.settings.list_plans'),
  })
}

export interface PlanInput {
  plan_name: string
  plan_type: string
  price: number
  duration_days?: number
  session_count?: number
  billing_frequency?: string
  auto_renew?: boolean
  max_freeze_days_per_year?: number
  description?: string
}

export function useCreatePlan() {
  const invalidate = useSettingsInvalidation()
  return useMutation({
    mutationFn: (input: PlanInput) =>
      api.callMethod('gym_management.settings.create_plan', {
        ...input,
        auto_renew: input.auto_renew ? 1 : 0,
      }),
    onSuccess: invalidate,
  })
}

export function useUpdatePlan() {
  const invalidate = useSettingsInvalidation()
  return useMutation({
    mutationFn: (vars: { name: string } & Partial<PlanInput>) =>
      api.callMethod('gym_management.settings.update_plan', {
        ...vars,
        auto_renew:
          vars.auto_renew === undefined ? undefined : vars.auto_renew ? 1 : 0,
      }),
    onSuccess: invalidate,
  })
}

export function useSetPlanActive() {
  const invalidate = useSettingsInvalidation()
  return useMutation({
    mutationFn: (vars: { name: string; active: boolean }) =>
      api.callMethod('gym_management.settings.set_plan_active', {
        name: vars.name,
        active: vars.active ? 1 : 0,
      }),
    onSuccess: invalidate,
  })
}

// ---- Integrations + users ----

export function useIntegrationsStatus() {
  return useQuery({
    queryKey: ['settings', 'integrations'],
    queryFn: () =>
      api.callMethodGet<IntegrationsStatus>(
        'gym_management.settings.integrations_status',
      ),
  })
}

export function useStaff() {
  return useQuery({
    queryKey: ['settings', 'staff'],
    queryFn: () =>
      api.callMethodGet<StaffUser[]>('gym_management.settings.list_staff'),
  })
}

export function useRoles() {
  return useQuery({
    queryKey: ['settings', 'roles'],
    queryFn: () =>
      api.callMethodGet<string[]>('gym_management.settings.list_roles'),
    staleTime: 10 * 60 * 1000,
  })
}

export function useAddStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { email: string; full_name: string; role?: string }) =>
      api.callMethod('gym_management.settings.add_staff', vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'staff'] }),
  })
}
