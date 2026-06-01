import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import {
  type CertRow,
  type ComplianceListResult,
  type ComplianceSummary,
} from '@/lib/types'

export function useCompliance(params: { bucket?: string; search?: string }) {
  const { bucket, search } = params
  return useQuery({
    queryKey: ['compliance', 'items', { bucket, search }],
    queryFn: () =>
      api.callMethodGet<ComplianceListResult>(
        'gym_management.compliance.list_compliance',
        { bucket, search },
      ),
  })
}

export function useCertifications(params: { bucket?: string; search?: string }) {
  const { bucket, search } = params
  return useQuery({
    queryKey: ['compliance', 'certs', { bucket, search }],
    queryFn: () =>
      api.callMethodGet<CertRow[]>(
        'gym_management.compliance.list_certifications',
        { bucket, search },
      ),
  })
}

export function useComplianceSummary() {
  return useQuery({
    queryKey: ['compliance', 'summary'],
    queryFn: () =>
      api.callMethodGet<ComplianceSummary>('gym_management.compliance.summary'),
  })
}
