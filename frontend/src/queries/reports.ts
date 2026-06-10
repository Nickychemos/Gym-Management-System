import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { type ReportEnvelope, type ReportListItem } from '@/lib/types'

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
