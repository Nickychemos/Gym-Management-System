import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api } from '@/lib/api'
import {
  type ActivityItem,
  type MemberListResult,
  type MemberOverview,
} from '@/lib/types'

export interface MemberListParams {
  search?: string
  status?: string
  branch?: string
  plan?: string
  page?: number
  pageLength?: number
}

/** Enriched, paginated member list. Keeps previous page visible while the
 *  next loads so pagination feels instant (no flash to empty). */
export function useMembers(params: MemberListParams) {
  const { search, status, branch, plan, page = 1, pageLength = 20 } = params
  const limit_start = (page - 1) * pageLength
  return useQuery({
    queryKey: [
      'members',
      'list',
      { search, status, branch, plan, limit_start, pageLength },
    ],
    queryFn: () =>
      api.callMethodGet<MemberListResult>('gym_management.members.list_members', {
        search,
        status,
        branch,
        plan,
        limit_start,
        limit_page_length: pageLength,
      }),
    placeholderData: keepPreviousData,
  })
}

/** Member 360 header + current subscription + at-a-glance. */
export function useMemberOverview(member: string | undefined) {
  return useQuery({
    queryKey: ['members', 'overview', member],
    queryFn: () =>
      api.callMethodGet<MemberOverview>(
        'gym_management.members.member_overview',
        { member },
      ),
    enabled: !!member,
  })
}

/** Unified activity timeline for a member. */
export function useMemberActivity(member: string | undefined, limit = 20) {
  return useQuery({
    queryKey: ['members', 'activity', member, limit],
    queryFn: () =>
      api.callMethodGet<ActivityItem[]>(
        'gym_management.members.member_activity',
        { member, limit },
      ),
    enabled: !!member,
  })
}

export interface CreateMemberInput {
  full_name: string
  phone: string
  emergency_contact_name: string
  emergency_contact_phone: string
  email?: string
  gender?: string
  date_of_birth?: string
  home_branch?: string
  source?: string
  emergency_contact_relationship?: string
  tax_id?: string
}

/** Create a Customer + Member Profile. Invalidates the list on success. */
export function useCreateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateMemberInput) =>
      api.callMethod<{ member: string; customer: string }>(
        'gym_management.members.create_member',
        input as unknown as Record<string, unknown>,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', 'list'] })
    },
  })
}
