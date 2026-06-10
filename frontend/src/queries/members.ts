import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api } from '@/lib/api'
import {
  type ActivityItem,
  type MemberAnalytics,
  type MemberClassRow,
  type MemberListResult,
  type MemberOverview,
  type MemberSubscriptionRow,
  type MembershipPlanOption,
} from '@/lib/types'

function useMemberInvalidation(member?: string) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['members', 'list'] })
    if (member) {
      qc.invalidateQueries({ queryKey: ['members', 'overview', member] })
      qc.invalidateQueries({ queryKey: ['members', 'subscriptions', member] })
      qc.invalidateQueries({ queryKey: ['members', 'activity', member] })
      qc.invalidateQueries({ queryKey: ['members', 'analytics', member] })
    }
  }
}

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

/** All subscriptions for a member (Subscriptions tab). */
export function useMemberSubscriptions(member: string | undefined) {
  return useQuery({
    queryKey: ['members', 'subscriptions', member],
    queryFn: () =>
      api.callMethodGet<MemberSubscriptionRow[]>(
        'gym_management.members.member_subscriptions',
        { member },
      ),
    enabled: !!member,
  })
}

/** Per-member analytics (Analytics tab): visits, engagement, retention, spend. */
export function useMemberAnalytics(member: string | undefined) {
  return useQuery({
    queryKey: ['members', 'analytics', member],
    queryFn: () =>
      api.callMethodGet<MemberAnalytics>(
        'gym_management.members.member_analytics',
        { member },
      ),
    enabled: !!member,
  })
}

/** A member's class bookings (Classes tab). */
export function useMemberClasses(member: string | undefined) {
  return useQuery({
    queryKey: ['members', 'classes', member],
    queryFn: () =>
      api.callMethodGet<MemberClassRow[]>(
        'gym_management.members.member_classes',
        { member },
      ),
    enabled: !!member,
  })
}

/** Active non-PT plans for subscribe/upgrade pickers. */
export function useMembershipPlans() {
  return useQuery({
    queryKey: ['membership-plans'],
    queryFn: () =>
      api.callMethodGet<MembershipPlanOption[]>(
        'gym_management.members.list_membership_plans',
      ),
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateMember(member?: string) {
  const invalidate = useMemberInvalidation(member)
  return useMutation({
    mutationFn: (fields: Record<string, unknown>) =>
      api.callMethod('gym_management.members.update_member', {
        member,
        ...fields,
      }),
    onSuccess: invalidate,
  })
}

export function useFreezeSubscription(member?: string) {
  const invalidate = useMemberInvalidation(member)
  return useMutation({
    mutationFn: (vars: {
      subscription: string
      freeze_start_date: string
      freeze_end_date: string
      reason: string
      reason_notes?: string
    }) =>
      api.callMethod<{ ok: boolean; freeze: string; freeze_days: number }>(
        'gym_management.members.freeze_subscription',
        vars,
      ),
    onSuccess: invalidate,
  })
}

export function useUnfreezeSubscription(member?: string) {
  const invalidate = useMemberInvalidation(member)
  return useMutation({
    mutationFn: (subscription: string) =>
      api.callMethod('gym_management.members.unfreeze_subscription', { subscription }),
    onSuccess: invalidate,
  })
}

export function useRenewSubscription(member?: string) {
  const invalidate = useMemberInvalidation(member)
  return useMutation({
    mutationFn: (subscription: string) =>
      api.callMethod<{
        ok: boolean
        subscription: string
        status: string
        start_date: string
      }>('gym_management.members.renew_subscription', { subscription }),
    onSuccess: invalidate,
  })
}

export function useUpgradeSubscription(member?: string) {
  const invalidate = useMemberInvalidation(member)
  return useMutation({
    mutationFn: (vars: { subscription: string; new_plan: string }) =>
      api.callMethod<{
        ok: boolean
        subscription: string
        status: string
        start_date: string
      }>('gym_management.members.upgrade_subscription', vars),
    onSuccess: invalidate,
  })
}

/** Delete a subscription added in error (manager/owner only; backend refuses
 *  if anything financial/operational is attached). */
export function useRemoveSubscription(member?: string) {
  const invalidate = useMemberInvalidation(member)
  return useMutation({
    mutationFn: (subscription: string) =>
      api.callMethod<{ ok: boolean; removed: string }>(
        'gym_management.members.remove_subscription',
        { subscription },
      ),
    onSuccess: invalidate,
  })
}

export function useCreateSubscription(member?: string) {
  const invalidate = useMemberInvalidation(member)
  return useMutation({
    mutationFn: (vars: { member: string; membership_plan: string }) =>
      api.callMethod('gym_management.members.create_subscription', vars),
    onSuccess: invalidate,
  })
}

export interface CreateMemberInput {
  full_name: string
  phone: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
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
