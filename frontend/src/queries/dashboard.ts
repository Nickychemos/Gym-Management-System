import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { type DashboardSummary } from '@/lib/types'

/** Everything the dashboard renders, in one round-trip. */
export function useDashboardSummary(branch?: string) {
  return useQuery({
    queryKey: ['dashboard', 'summary', branch ?? null],
    queryFn: () =>
      api.callMethodGet<DashboardSummary>('gym_management.dashboard.summary', {
        branch,
      }),
    // Dashboard is a glanceable landing screen — keep it reasonably fresh.
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  })
}
