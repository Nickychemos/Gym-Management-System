import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export interface BranchSummary {
  name: string
  branch: string
  gym_phone: string | null
  gym_address: string | null
}

export interface BranchContext {
  can_switch: boolean
  multi_branch: boolean
  default: string | null
  branches: BranchSummary[]
}

export interface BranchRow extends BranchSummary {
  gym_is_active: 0 | 1
}

/** The caller's allowed branches + whether they can switch (drives the topbar). */
export function useBranchContext() {
  return useQuery({
    queryKey: ['branches', 'context'],
    queryFn: () =>
      api.callMethodGet<BranchContext>('gym_management.branches.branch_context'),
    staleTime: 5 * 60 * 1000,
  })
}

/** Full branch list for management (Owner/Manager). */
export function useBranches() {
  return useQuery({
    queryKey: ['branches', 'all'],
    queryFn: () =>
      api.callMethodGet<BranchRow[]>('gym_management.branches.list_branches'),
  })
}

function useBranchInvalidation() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['branches'] })
  }
}

export function useCreateBranch() {
  const invalidate = useBranchInvalidation()
  return useMutation({
    mutationFn: (fields: {
      branch: string
      gym_phone?: string
      gym_address?: string
    }) => api.callMethod('gym_management.branches.create_branch', fields),
    onSuccess: invalidate,
  })
}

export function useUpdateBranch() {
  const invalidate = useBranchInvalidation()
  return useMutation({
    mutationFn: (fields: {
      name: string
      gym_phone?: string
      gym_address?: string
    }) => api.callMethod('gym_management.branches.update_branch', fields),
    onSuccess: invalidate,
  })
}

export function useSetBranchActive() {
  const invalidate = useBranchInvalidation()
  return useMutation({
    mutationFn: (vars: { name: string; active: boolean }) =>
      api.callMethod('gym_management.branches.set_branch_active', vars),
    onSuccess: invalidate,
  })
}

export function useSetUserBranch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { user: string; branch: string | null }) =>
      api.callMethod('gym_management.branches.set_user_branch', vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'staff'] }),
  })
}
