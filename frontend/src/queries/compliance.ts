import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api } from '@/lib/api'
import {
  type CertRow,
  type ComplianceListResult,
  type ComplianceSummary,
  type EmployeeOption,
} from '@/lib/types'

function useComplianceInvalidation() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['compliance'] })
}

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

export function useAuthorities() {
  return useQuery({
    queryKey: ['compliance', 'authorities'],
    queryFn: () =>
      api.callMethodGet<string[]>('gym_management.compliance.list_authorities'),
    staleTime: 5 * 60 * 1000,
  })
}

export function useComplianceEmployees() {
  return useQuery({
    queryKey: ['compliance', 'employees'],
    queryFn: () =>
      api.callMethodGet<EmployeeOption[]>(
        'gym_management.compliance.list_employees',
      ),
    staleTime: 5 * 60 * 1000,
  })
}

// ---- Mutations ----

export interface ComplianceItemInput {
  compliance_name: string
  compliance_authority: string
  expires_on: string
  compliance_category?: string
  branch?: string
  issued_on?: string
  reference_number?: string
  cost?: number
}

export function useCreateComplianceItem() {
  const invalidate = useComplianceInvalidation()
  return useMutation({
    mutationFn: (input: ComplianceItemInput) =>
      api.callMethod('gym_management.compliance.create_compliance_item', {
        ...input,
      }),
    onSuccess: invalidate,
  })
}

export function useUpdateComplianceItem() {
  const invalidate = useComplianceInvalidation()
  return useMutation({
    mutationFn: (vars: { name: string } & Partial<ComplianceItemInput>) =>
      api.callMethod('gym_management.compliance.update_compliance_item', {
        ...vars,
      }),
    onSuccess: invalidate,
  })
}

export interface RenewInput {
  compliance_item: string
  new_expiry_date: string
  renewed_on?: string
  cost_paid?: number
  payment_method?: string
  new_reference_number?: string
}

export function useRenewCompliance() {
  const invalidate = useComplianceInvalidation()
  return useMutation({
    mutationFn: (input: RenewInput) =>
      api.callMethod('gym_management.compliance.renew_compliance', { ...input }),
    onSuccess: invalidate,
  })
}

export interface CertInput {
  employee: string
  certification_name: string
  issuing_body: string
  issued_on: string
  expires_on: string
  certification_number?: string
  verified_by_hr?: boolean
}

export function useCreateCertification() {
  const invalidate = useComplianceInvalidation()
  return useMutation({
    mutationFn: (input: CertInput) =>
      api.callMethod('gym_management.compliance.create_certification', {
        ...input,
        verified_by_hr: input.verified_by_hr ? 1 : 0,
      }),
    onSuccess: invalidate,
  })
}

export function useUpdateCertification() {
  const invalidate = useComplianceInvalidation()
  return useMutation({
    mutationFn: (vars: { name: string } & Partial<CertInput>) =>
      api.callMethod('gym_management.compliance.update_certification', {
        ...vars,
        verified_by_hr:
          vars.verified_by_hr === undefined
            ? undefined
            : vars.verified_by_hr
              ? 1
              : 0,
      }),
    onSuccess: invalidate,
  })
}
