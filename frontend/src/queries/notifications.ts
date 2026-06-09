import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export interface NotificationRow {
  name: string
  title: string
  body: string | null
  kind: 'info' | 'success' | 'warning' | 'danger'
  link: string | null
  is_read: 0 | 1
  creation: string
}

/** The caller's notifications. Polls every 60s as a fallback; the socket push
 *  invalidates this for instant updates. */
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () =>
      api.callMethodGet<NotificationRow[]>(
        'gym_management.notifications.list_notifications',
        { limit: 20 },
      ),
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      api.callMethod('gym_management.notifications.mark_read', { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.callMethod('gym_management.notifications.mark_all_read'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
