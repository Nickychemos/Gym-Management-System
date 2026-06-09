import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import {
  type CashSession,
  type DrawerOptions,
  type DrawerSummary,
} from '@/lib/types'

const CDS = 'gym_management.gym_management.doctype.cash_drawer_session.cash_drawer_session'

function useDrawerInvalidation() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['cashdrawer'] })
}

export function useCashSessions(branch?: string) {
  return useQuery({
    queryKey: ['cashdrawer', 'sessions', branch ?? null],
    queryFn: () =>
      api.callMethodGet<CashSession[]>('gym_management.cashdrawer.list_sessions', {
        branch,
      }),
  })
}

export function useDrawerSummary(branch?: string) {
  return useQuery({
    queryKey: ['cashdrawer', 'summary', branch ?? null],
    queryFn: () =>
      api.callMethodGet<DrawerSummary>('gym_management.cashdrawer.drawer_summary', {
        branch,
      }),
  })
}

export function useDrawerOptions() {
  return useQuery({
    queryKey: ['cashdrawer', 'options'],
    queryFn: () =>
      api.callMethodGet<DrawerOptions>('gym_management.cashdrawer.drawer_options'),
    staleTime: 5 * 60 * 1000,
  })
}

export function useOpenDrawer() {
  const invalidate = useDrawerInvalidation()
  return useMutation({
    mutationFn: (input: {
      branch: string
      cashier: string
      opening_float: number
      opening_notes?: string
    }) => api.callMethod<{ ok: boolean; session: string }>(`${CDS}.open_session`, { ...input }),
    onSuccess: invalidate,
  })
}

export function useCloseDrawer() {
  const invalidate = useDrawerInvalidation()
  return useMutation({
    mutationFn: (input: {
      session_name: string
      actual_cash_counted: number
      expected_cash_sales?: number
      transaction_count?: number
      cash_drops?: number
      cash_pickups?: number
      variance_explanation?: string
      supervisor_witness?: string
    }) =>
      api.callMethod<{ ok: boolean; variance: number; variance_acceptable: boolean }>(
        `${CDS}.close_session`,
        { ...input },
      ),
    onSuccess: invalidate,
  })
}
