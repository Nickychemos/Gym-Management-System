import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import {
  type DeliveryLogRow,
  type ReportEnvelope,
  type ReportListItem,
  type ReportSchedule,
  type ScheduleOptions,
} from '@/lib/types'

/** The report catalogue for the Reports home. */
export function useReportList() {
  return useQuery({
    queryKey: ['reports', 'list'],
    queryFn: () =>
      api.callMethodGet<ReportListItem[]>('gym_management.reports.list_reports'),
    staleTime: 5 * 60 * 1000,
  })
}

export interface RunReportParams {
  report: string | undefined
  period: string
  branch?: string
  start?: string
  end?: string
}

/** Download a report as pdf / csv / xlsx. Fetches the binary through the API
 *  proxy (session cookie) and saves it via a temporary anchor. */
export async function downloadReport(params: {
  report: string
  format: 'pdf' | 'csv' | 'xlsx'
  period: string
  branch?: string
}) {
  const qs = new URLSearchParams({
    report: params.report,
    format: params.format,
    period: params.period,
  })
  if (params.branch) qs.set('branch', params.branch)
  const res = await fetch(
    `/api/method/gym_management.reports.export_report?${qs.toString()}`,
    { credentials: 'include' },
  )
  if (!res.ok) throw new Error(`Export failed (${res.status})`)
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = `${params.report}_${params.period}.${params.format}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}

/** Run a report and get its generic envelope (kpis/charts/tables). */
export function useRunReport({ report, period, branch, start, end }: RunReportParams) {
  return useQuery({
    queryKey: ['reports', 'run', report, period, branch ?? null, start ?? null, end ?? null],
    queryFn: () =>
      api.callMethodGet<ReportEnvelope>('gym_management.reports.run_report', {
        report,
        period,
        branch,
        start,
        end,
      }),
    enabled: !!report,
  })
}

// ---- Schedules ----

export function useScheduleOptions() {
  return useQuery({
    queryKey: ['reports', 'schedule-options'],
    queryFn: () =>
      api.callMethodGet<ScheduleOptions>('gym_management.reports.schedule_options'),
    staleTime: 10 * 60 * 1000,
  })
}

export function useSchedules() {
  return useQuery({
    queryKey: ['reports', 'schedules'],
    queryFn: () =>
      api.callMethodGet<ReportSchedule[]>('gym_management.reports.list_schedules'),
  })
}

export function useDeliveryLog() {
  return useQuery({
    queryKey: ['reports', 'delivery-log'],
    queryFn: () =>
      api.callMethodGet<DeliveryLogRow[]>('gym_management.reports.delivery_log', {
        limit: 30,
      }),
  })
}

function useScheduleInvalidation() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['reports', 'schedules'] })
}

export interface SaveScheduleInput {
  name?: string
  report_key: string
  title?: string
  frequency: string
  day_of_week?: string
  day_of_month?: number
  send_hour?: number
  period?: string
  branch?: string | null
  recipient_roles: string[]
  formats: string[]
  is_active?: number
}

export function useSaveSchedule() {
  const invalidate = useScheduleInvalidation()
  return useMutation({
    mutationFn: (input: SaveScheduleInput) =>
      api.callMethod<{ name: string }>(
        'gym_management.reports.save_schedule',
        input as unknown as Record<string, unknown>,
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteSchedule() {
  const invalidate = useScheduleInvalidation()
  return useMutation({
    mutationFn: (name: string) =>
      api.callMethod('gym_management.reports.delete_schedule', { name }),
    onSuccess: invalidate,
  })
}

export function useSetScheduleActive() {
  const invalidate = useScheduleInvalidation()
  return useMutation({
    mutationFn: (vars: { name: string; active: number }) =>
      api.callMethod('gym_management.reports.set_schedule_active', vars),
    onSuccess: invalidate,
  })
}

export function useSendScheduleNow() {
  return useMutation({
    mutationFn: (name: string) =>
      api.callMethod<{ sent: number; recipients: number }>(
        'gym_management.reports.send_schedule_now',
        { name },
      ),
  })
}
