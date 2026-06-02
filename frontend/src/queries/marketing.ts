import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import {
  type CampaignRow,
  type ChatbotFlowDetail,
  type ChatbotFlowRow,
  type ChatbotSessionRow,
  type MarketingSummary,
  type ReferralRow,
  type TemplateRow,
} from '@/lib/types'

const WT = 'gym_management.gym_management.doctype.whatsapp_template.whatsapp_template'
const REF = 'gym_management.gym_management.doctype.referral.referral'

function useMktInvalidation() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['marketing'] })
}

export function useMarketingSummary() {
  return useQuery({
    queryKey: ['marketing', 'summary'],
    queryFn: () =>
      api.callMethodGet<MarketingSummary>('gym_management.marketing.marketing_summary'),
  })
}

// ---- Campaigns ----

export function useCampaigns() {
  return useQuery({
    queryKey: ['marketing', 'campaigns'],
    queryFn: () =>
      api.callMethodGet<CampaignRow[]>('gym_management.marketing.list_campaigns'),
  })
}

export function useCreateCampaign() {
  const invalidate = useMktInvalidation()
  return useMutation({
    mutationFn: (input: {
      campaign_name: string
      channel: string
      segment?: string
      target_count?: number
      linked_whatsapp_template?: string
    }) => api.callMethod('gym_management.marketing.create_campaign', { ...input }),
    onSuccess: invalidate,
  })
}

export function useRunRenewalReminders() {
  const invalidate = useMktInvalidation()
  return useMutation({
    mutationFn: () =>
      api.callMethod<{ ok: boolean; result?: unknown; reason?: string }>(
        'gym_management.marketing.run_renewal_reminders',
      ),
    onSuccess: invalidate,
  })
}

// ---- Templates ----

export function useTemplates() {
  return useQuery({
    queryKey: ['marketing', 'templates'],
    queryFn: () =>
      api.callMethodGet<TemplateRow[]>('gym_management.marketing.list_templates'),
  })
}

export function useCreateTemplate() {
  const invalidate = useMktInvalidation()
  return useMutation({
    mutationFn: (input: {
      template_name: string
      body_text: string
      category: string
      language: string
      header_text?: string
      footer_text?: string
    }) => api.callMethod('gym_management.marketing.create_template', { ...input }),
    onSuccess: invalidate,
  })
}

export function useSubmitTemplate() {
  const invalidate = useMktInvalidation()
  return useMutation({
    mutationFn: (template_name: string) =>
      api.callMethod(`${WT}.submit`, { template_name }),
    onSuccess: invalidate,
  })
}

export function useSyncTemplate() {
  const invalidate = useMktInvalidation()
  return useMutation({
    mutationFn: (template_name: string) =>
      api.callMethod(`${WT}.sync_status_from_meta`, { template_name }),
    onSuccess: invalidate,
  })
}

// ---- Chatbot ----

export function useChatbotFlows() {
  return useQuery({
    queryKey: ['marketing', 'flows'],
    queryFn: () =>
      api.callMethodGet<ChatbotFlowRow[]>('gym_management.marketing.list_chatbot_flows'),
  })
}

export function useFlowDetail(flow: string | undefined) {
  return useQuery({
    queryKey: ['marketing', 'flow', flow],
    queryFn: () =>
      api.callMethodGet<ChatbotFlowDetail>('gym_management.marketing.flow_detail', { flow }),
    enabled: !!flow,
  })
}

export function useChatbotSessions() {
  return useQuery({
    queryKey: ['marketing', 'sessions'],
    queryFn: () =>
      api.callMethodGet<ChatbotSessionRow[]>('gym_management.marketing.list_chatbot_sessions'),
  })
}

// ---- Referrals ----

export function useReferrals() {
  return useQuery({
    queryKey: ['marketing', 'referrals'],
    queryFn: () =>
      api.callMethodGet<ReferralRow[]>('gym_management.marketing.list_referrals'),
  })
}

export function useCreateReferral() {
  const invalidate = useMktInvalidation()
  return useMutation({
    mutationFn: (input: {
      referrer_customer: string
      referred_name?: string
      referred_phone?: string
      channel?: string
      reward_type?: string
      reward_value?: number
    }) => api.callMethod('gym_management.marketing.create_referral', { ...input }),
    onSuccess: invalidate,
  })
}

/** Advance a referral through its reward workflow. */
export function useReferralAction() {
  const invalidate = useMktInvalidation()
  return useMutation({
    mutationFn: (vars: {
      referral: string
      action: 'mark_signed_up' | 'mark_first_payment' | 'mark_reward_paid'
      args?: Record<string, unknown>
    }) =>
      api.callMethod<{ ok: boolean; new_status: string }>(
        `${REF}.${vars.action}`,
        { referral: vars.referral, ...(vars.args ?? {}) },
      ),
    onSuccess: invalidate,
  })
}
