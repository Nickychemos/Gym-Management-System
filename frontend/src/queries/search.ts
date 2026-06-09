import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'

export interface SearchItem {
  label: string
  sublabel: string
  route: string
}

export interface SearchGroup {
  key: string
  label: string
  icon: string
  items: SearchItem[]
}

/** Live global search, scoped to the selected branch. Disabled under 2 chars. */
export function useGlobalSearch(query: string, branch?: string) {
  return useQuery({
    queryKey: ['search', query, branch ?? null],
    queryFn: () =>
      api.callMethodGet<{ groups: SearchGroup[] }>(
        'gym_management.search.global_search',
        { query, branch },
      ),
    enabled: query.trim().length >= 2,
    staleTime: 30 * 1000,
  })
}
