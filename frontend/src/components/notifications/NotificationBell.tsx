import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'

import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type NotificationRow,
} from '@/queries/notifications'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Accent dot per notification kind. */
const KIND_DOT: Record<NotificationRow['kind'], string> = {
  info: 'bg-info-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
}

/**
 * Live notifications bell. Polls every 60s (in the query) and also opens a
 * Frappe socketio connection: when the backend pushes a `gym_notification`
 * event to this user's room we invalidate the query for an instant refresh.
 * The poll is the fallback so notifications still arrive if the socket can't
 * connect (e.g. socketio not running in a given dev setup).
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data } = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()

  const items = data ?? []
  const unread = items.filter((n) => !n.is_read).length

  // Real-time push: invalidate on the user's gym_notification event.
  useEffect(() => {
    let socket: Socket | null = null
    try {
      socket = io('/', {
        path: '/socket.io',
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
      })
      const refresh = () =>
        qc.invalidateQueries({ queryKey: ['notifications'] })
      socket.on('gym_notification', refresh)
    } catch {
      // No socket in this environment; polling keeps us current.
    }
    return () => {
      socket?.off('gym_notification')
      socket?.disconnect()
    }
  }, [qc])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function openItem(n: NotificationRow) {
    if (!n.is_read) markRead.mutate(n.name)
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex items-center justify-center size-8 rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
      >
        <Bell className="size-4" strokeWidth={1.75} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-[16px] h-4 place-items-center rounded-full bg-danger-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-[var(--shadow-overlay)] origin-top-right"
        >
          <div className="flex items-center justify-between px-2.5 py-1.5">
            <span className="text-small font-semibold text-neutral-900">
              Notifications
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                className="inline-flex items-center gap-1 text-tiny font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
              >
                <CheckCheck className="size-3.5" strokeWidth={2} />
                Mark all read
              </button>
            )}
          </div>
          <div className="my-1 h-px bg-neutral-100" />

          {items.length === 0 ? (
            <div className="px-3 py-10 text-center text-small text-neutral-500">
              You&rsquo;re all caught up.
            </div>
          ) : (
            <div className="max-h-[22rem] overflow-y-auto">
              {items.map((n) => (
                <button
                  key={n.name}
                  type="button"
                  onClick={() => openItem(n)}
                  className={cn(
                    'flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-neutral-100',
                    !n.is_read && 'bg-accent-50/50',
                  )}
                >
                  <span
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      n.is_read ? 'bg-neutral-300' : KIND_DOT[n.kind],
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        'text-small leading-snug',
                        n.is_read
                          ? 'text-neutral-600'
                          : 'font-medium text-neutral-900',
                      )}
                    >
                      {n.title}
                    </div>
                    {n.body && (
                      <div className="mt-0.5 truncate text-tiny text-neutral-500">
                        {n.body}
                      </div>
                    )}
                    <div className="mt-0.5 text-tiny text-neutral-400">
                      {relativeTime(n.creation)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
