import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import {
  type NpsDashboardData,
  type SurveyResponseRow,
  type SurveyTemplateRow,
} from '@/lib/types'

function useSurveyInvalidation() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['surveys'] })
}

export function useNpsDashboard(days = 30) {
  return useQuery({
    queryKey: ['surveys', 'nps', days],
    queryFn: () =>
      api.callMethodGet<NpsDashboardData>('gym_management.surveys.nps_dashboard', { days }),
  })
}

export function useSurveyTemplates() {
  return useQuery({
    queryKey: ['surveys', 'templates'],
    queryFn: () =>
      api.callMethodGet<SurveyTemplateRow[]>('gym_management.surveys.list_templates'),
  })
}

export function useSurveyResponses(survey_template?: string) {
  return useQuery({
    queryKey: ['surveys', 'responses', survey_template ?? null],
    queryFn: () =>
      api.callMethodGet<SurveyResponseRow[]>('gym_management.surveys.list_responses', {
        survey_template,
      }),
  })
}

export function useCreateSurveyTemplate() {
  const invalidate = useSurveyInvalidation()
  return useMutation({
    mutationFn: (input: {
      survey_name: string
      survey_type: string
      trigger_event?: string
      channels?: string
      intro_message?: string
      thank_you_message?: string
    }) => api.callMethod('gym_management.surveys.create_template', { ...input }),
    onSuccess: invalidate,
  })
}

export function useSetTemplateActive() {
  const invalidate = useSurveyInvalidation()
  return useMutation({
    mutationFn: (vars: { name: string; active: boolean }) =>
      api.callMethod('gym_management.surveys.set_template_active', {
        name: vars.name,
        active: vars.active ? 1 : 0,
      }),
    onSuccess: invalidate,
  })
}

export function useRecordResponse() {
  const invalidate = useSurveyInvalidation()
  return useMutation({
    mutationFn: (input: {
      survey_template: string
      member: string
      nps_score?: number
      comment?: string
      submitted_via?: string
    }) => api.callMethod('gym_management.surveys.record_response', { ...input }),
    onSuccess: invalidate,
  })
}
