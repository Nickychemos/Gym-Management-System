import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api } from '@/lib/api'
import {
  type RefundListResult,
  type RefundSummary,
} from '@/lib/types'

const RR =
  'gym_management.gym_management.doctype.refund_request.refund_request'

export interface RefundListParams {
  status?: string
  search?: string
  branch?: string
  page?: number
  pageLength?: number
}

export function useRefunds(params: RefundListParams) {
  const { status, search, branch, page = 1, pageLength = 25 } = params
  const limit_start = (page - 1) * pageLength
  return useQuery({
    queryKey: [
      'refunds',
      'list',
      { status, search, branch, limit_start, pageLength },
    ],
    queryFn: () =>
      api.callMethodGet<RefundListResult>('gym_management.refunds.list_refunds', {
        status,
        search,
        branch,
        limit_start,
        limit_page_length: pageLength,
      }),
    placeholderData: keepPreviousData,
  })
}

export function useRefundSummary(branch?: string) {
  return useQuery({
    queryKey: ['refunds', 'summary', branch ?? null],
    queryFn: () =>
      api.callMethodGet<RefundSummary>('gym_management.refunds.summary', {
        branch,
      }),
  })
}

export interface CreateRefundInput {
  customer: string
  refund_reason: string
  source_type: string
  original_amount_paid: number
  requested_refund_amount: number
  refund_method: string
  justification: string
  refund_account_phone?: string
  bank_details?: string
}

export function useCreateRefund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRefundInput) =>
      api.callMethod<{ ok: boolean; refund: string; status: string }>(
        'gym_management.refunds.create_refund',
        { ...input },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['refunds'] }),
  })
}

/** The transition methods available, keyed by workflow action. Each maps to a
 *  whitelisted method on the Refund Request controller. */
export const REFUND_ACTIONS = {
  submit: 'submit_for_approval',
  approveManager: 'approve_as_manager',
  approveOwner: 'approve_as_owner',
  reject: 'reject',
  initiate: 'initiate_refund',
  complete: 'mark_refund_completed',
  fail: 'mark_failed',
} as const

export type RefundAction = keyof typeof REFUND_ACTIONS

/** One mutation that drives any state transition. Pass the refund name, the
 *  action, and any extra args (e.g. {reason} for reject/fail). */
export function useRefundTransition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: {
      refund: string
      action: RefundAction
      args?: Record<string, unknown>
    }) =>
      api.callMethod<{ ok: boolean; new_status: string }>(
        `${RR}.${REFUND_ACTIONS[vars.action]}`,
        { refund_request: vars.refund, ...(vars.args ?? {}) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['refunds'] }),
  })
}
