import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api } from '@/lib/api'
import {
  type PtFormOptions,
  type PtPackageDetail,
  type PtPackageListResult,
} from '@/lib/types'

const PTS = 'gym_management.gym_management.doctype.pt_session.pt_session'

export interface PtListParams {
  status?: string
  search?: string
  trainer?: string
  branch?: string
  page?: number
  pageLength?: number
}

export function usePtPackages(params: PtListParams) {
  const { status, search, trainer, branch, page = 1, pageLength = 25 } = params
  const limit_start = (page - 1) * pageLength
  return useQuery({
    queryKey: [
      'pt',
      'list',
      { status, search, trainer, branch, limit_start, pageLength },
    ],
    queryFn: () =>
      api.callMethodGet<PtPackageListResult>('gym_management.pt.list_packages', {
        status,
        search,
        trainer,
        branch,
        limit_start,
        limit_page_length: pageLength,
      }),
    placeholderData: keepPreviousData,
  })
}

export function usePtPackage(name: string | undefined) {
  return useQuery({
    queryKey: ['pt', 'package', name],
    queryFn: () =>
      api.callMethodGet<PtPackageDetail>('gym_management.pt.package_detail', {
        pt_package: name,
      }),
    enabled: !!name,
  })
}

export function usePtFormOptions() {
  return useQuery({
    queryKey: ['pt', 'form-options'],
    queryFn: () =>
      api.callMethodGet<PtFormOptions>('gym_management.pt.form_options'),
    staleTime: 5 * 60 * 1000,
  })
}

export interface SellPackageInput {
  customer: string
  trainer: string
  membership_plan: string
  goals?: string
}

export function useSellPackage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SellPackageInput) =>
      api.callMethod<{ ok: boolean; package: string; sessions: number }>(
        'gym_management.pt.sell_package',
        { ...input },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pt'] }),
  })
}

/** Invalidate the list + a specific package after a session change. */
function usePtInvalidation(pkg?: string) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['pt', 'list'] })
    if (pkg) qc.invalidateQueries({ queryKey: ['pt', 'package', pkg] })
  }
}

export function useScheduleSession(pkg?: string) {
  const invalidate = usePtInvalidation(pkg)
  return useMutation({
    mutationFn: (vars: {
      scheduled_at: string
      room?: string
      workout_focus?: string
    }) =>
      api.callMethod('gym_management.pt.schedule_session', {
        pt_package: pkg,
        ...vars,
      }),
    onSuccess: invalidate,
  })
}

export function useCompleteSession(pkg?: string) {
  const invalidate = usePtInvalidation(pkg)
  return useMutation({
    mutationFn: (session: string) =>
      api.callMethod(`${PTS}.mark_completed`, { pt_session: session }),
    onSuccess: invalidate,
  })
}

export function useNoShowSession(pkg?: string) {
  const invalidate = usePtInvalidation(pkg)
  return useMutation({
    mutationFn: (session: string) =>
      api.callMethod(`${PTS}.mark_no_show`, { pt_session: session }),
    onSuccess: invalidate,
  })
}

export function useCancelSession(pkg?: string) {
  const invalidate = usePtInvalidation(pkg)
  return useMutation({
    mutationFn: (session: string) =>
      api.callMethod('gym_management.pt.cancel_session', { pt_session: session }),
    onSuccess: invalidate,
  })
}
