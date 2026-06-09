import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api } from '@/lib/api'
import {
  type AssetOption,
  type EquipmentDetail,
  type EquipmentListResult,
  type EquipmentSummary,
  type TicketListResult,
  type TicketSummary,
} from '@/lib/types'

const EMT =
  'gym_management.gym_management.doctype.equipment_maintenance_ticket.equipment_maintenance_ticket'

function useEquipInvalidation() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['equipment'] })
}

// ---- Equipment register ----

export function useEquipment(params: {
  search?: string
  op_status?: string
  category?: string
  branch?: string
}) {
  const { search, op_status, category, branch } = params
  return useQuery({
    queryKey: [
      'equipment',
      'register',
      { search, op_status, category, branch },
    ],
    queryFn: () =>
      api.callMethodGet<EquipmentListResult>(
        'gym_management.equipment.list_equipment',
        { search, op_status, category, branch },
      ),
    placeholderData: keepPreviousData,
  })
}

export function useEquipmentSummary(branch?: string) {
  return useQuery({
    queryKey: ['equipment', 'register-summary', branch ?? null],
    queryFn: () =>
      api.callMethodGet<EquipmentSummary>(
        'gym_management.equipment.equipment_summary',
        { branch },
      ),
  })
}

export function useEquipmentDetail(asset: string | undefined) {
  return useQuery({
    queryKey: ['equipment', 'detail', asset],
    queryFn: () =>
      api.callMethodGet<EquipmentDetail>(
        'gym_management.equipment.equipment_detail',
        { asset },
      ),
    enabled: !!asset,
  })
}

export function useEquipmentCategories() {
  return useQuery({
    queryKey: ['equipment', 'categories'],
    queryFn: () =>
      api.callMethodGet<string[]>('gym_management.equipment.list_categories'),
    staleTime: 5 * 60 * 1000,
  })
}

export interface CreateEquipmentInput {
  asset_name: string
  category: string
  branch?: string
  purchase_date?: string
  cost?: number
}

export function useCreateEquipment() {
  const invalidate = useEquipInvalidation()
  return useMutation({
    mutationFn: (input: CreateEquipmentInput) =>
      api.callMethod<{ ok: boolean; asset: string }>(
        'gym_management.equipment.create_equipment',
        { ...input },
      ),
    onSuccess: invalidate,
  })
}

export interface CreateScheduleInput {
  asset: string
  frequency: string
  task_type?: string
  assigned_to?: string
  estimated_cost_per_run?: number
  last_performed_on?: string
}

export function useCreateSchedule() {
  const invalidate = useEquipInvalidation()
  return useMutation({
    mutationFn: (input: CreateScheduleInput) =>
      api.callMethod('gym_management.equipment.create_schedule', { ...input }),
    onSuccess: invalidate,
  })
}

export function useMarkServiced() {
  const invalidate = useEquipInvalidation()
  return useMutation({
    mutationFn: (schedule: string) =>
      api.callMethod('gym_management.equipment.mark_serviced', { schedule }),
    onSuccess: invalidate,
  })
}

export interface TicketListParams {
  status?: string
  search?: string
  branch?: string
  page?: number
  pageLength?: number
}

export function useTickets(params: TicketListParams) {
  const { status, search, branch, page = 1, pageLength = 25 } = params
  const limit_start = (page - 1) * pageLength
  return useQuery({
    queryKey: [
      'equipment',
      'tickets',
      { status, search, branch, limit_start, pageLength },
    ],
    queryFn: () =>
      api.callMethodGet<TicketListResult>('gym_management.equipment.list_tickets', {
        status,
        search,
        branch,
        limit_start,
        limit_page_length: pageLength,
      }),
    placeholderData: keepPreviousData,
  })
}

export function useTicketSummary(branch?: string) {
  return useQuery({
    queryKey: ['equipment', 'summary', branch ?? null],
    queryFn: () =>
      api.callMethodGet<TicketSummary>('gym_management.equipment.ticket_summary', {
        branch,
      }),
  })
}

export function useAssets(search: string) {
  return useQuery({
    queryKey: ['equipment', 'assets', search],
    queryFn: () =>
      api.callMethodGet<AssetOption[]>('gym_management.equipment.list_assets', {
        search: search || undefined,
      }),
  })
}

function useTicketInvalidation() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['equipment'] })
}

export interface CreateTicketInput {
  title: string
  asset: string
  priority: string
  description?: string
  ticket_type?: string
  out_of_service?: boolean
}

export function useCreateTicket() {
  const invalidate = useTicketInvalidation()
  return useMutation({
    mutationFn: (input: CreateTicketInput) =>
      api.callMethod('gym_management.equipment.create_ticket', {
        ...input,
        out_of_service: input.out_of_service ? 1 : 0,
      }),
    onSuccess: invalidate,
  })
}

export function useSetTicketStatus() {
  const invalidate = useTicketInvalidation()
  return useMutation({
    mutationFn: (vars: { ticket: string; status: string }) =>
      api.callMethod('gym_management.equipment.set_ticket_status', vars),
    onSuccess: invalidate,
  })
}

export function useResolveTicket() {
  const invalidate = useTicketInvalidation()
  return useMutation({
    mutationFn: (vars: { ticket: string; resolution_notes?: string; cost?: number }) =>
      api.callMethod(`${EMT}.mark_resolved`, vars),
    onSuccess: invalidate,
  })
}
