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
