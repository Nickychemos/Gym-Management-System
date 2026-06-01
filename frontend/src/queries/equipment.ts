import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api } from '@/lib/api'
import {
  type AssetOption,
  type TicketListResult,
  type TicketSummary,
} from '@/lib/types'

const EMT =
  'gym_management.gym_management.doctype.equipment_maintenance_ticket.equipment_maintenance_ticket'

export interface TicketListParams {
  status?: string
  search?: string
  page?: number
  pageLength?: number
}

export function useTickets(params: TicketListParams) {
  const { status, search, page = 1, pageLength = 25 } = params
  const limit_start = (page - 1) * pageLength
  return useQuery({
    queryKey: ['equipment', 'tickets', { status, search, limit_start, pageLength }],
    queryFn: () =>
      api.callMethodGet<TicketListResult>('gym_management.equipment.list_tickets', {
        status,
        search,
        limit_start,
        limit_page_length: pageLength,
      }),
    placeholderData: keepPreviousData,
  })
}

export function useTicketSummary() {
  return useQuery({
    queryKey: ['equipment', 'summary'],
    queryFn: () =>
      api.callMethodGet<TicketSummary>('gym_management.equipment.ticket_summary'),
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
