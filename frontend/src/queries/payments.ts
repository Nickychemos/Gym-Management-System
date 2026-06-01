import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api } from '@/lib/api'
import {
  type MemberPayment,
  type PaymentStreamResult,
  type PaymentSummary,
  type StkPushResult,
} from '@/lib/types'

export interface PaymentStreamParams {
  status?: string
  direction?: string
  search?: string
  page?: number
  pageLength?: number
}

/** Enriched, paginated M-Pesa transaction feed. Auto-refreshes so STK pushes
 *  flip Pending → Success in near-real-time without a manual reload. */
export function usePaymentStream(params: PaymentStreamParams) {
  const { status, direction, search, page = 1, pageLength = 25 } = params
  const limit_start = (page - 1) * pageLength
  return useQuery({
    queryKey: [
      'payments',
      'stream',
      { status, direction, search, limit_start, pageLength },
    ],
    queryFn: () =>
      api.callMethodGet<PaymentStreamResult>('gym_management.payments.stream', {
        status,
        direction,
        search,
        limit_start,
        limit_page_length: pageLength,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 20 * 1000,
  })
}

export function usePaymentSummary(branch?: string) {
  return useQuery({
    queryKey: ['payments', 'summary', branch ?? null],
    queryFn: () =>
      api.callMethodGet<PaymentSummary>('gym_management.payments.summary', {
        branch,
      }),
    refetchInterval: 30 * 1000,
  })
}

/** A member's transactions (Member 360 Payments tab). */
export function useMemberPayments(member: string | undefined) {
  return useQuery({
    queryKey: ['payments', 'member', member],
    queryFn: () =>
      api.callMethodGet<MemberPayment[]>(
        'gym_management.payments.member_payments',
        { member },
      ),
    enabled: !!member,
  })
}

export interface StkPushInput {
  customer: string
  amount: number
  phone_number: string
  account_reference?: string
  description?: string
}

export function useSendStkPush() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: StkPushInput) =>
      api.callMethod<StkPushResult>('gym_management.payments.send_stk_push', {
        ...input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] })
    },
  })
}
