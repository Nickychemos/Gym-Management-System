import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import {
  Calendar,
  ClipboardList,
  Dumbbell,
  HeartHandshake,
  Home,
  MessageSquare,
  PanelLeft,
  PanelLeftClose,
  Receipt,
  Settings,
  ShieldCheck,
  Smile,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
import { type LucideIcon } from 'lucide-react'

import { useAuth } from '@/context/AuthContext'
import { canAccess } from '@/lib/roles'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

interface NavGroup {
  label?: string
  items: NavItem[]
}

const groups: NavGroup[] = [
  {
    items: [
      { to: '/', label: 'Dashboard', icon: Home },
      { to: '/members', label: 'Members', icon: Users },
      { to: '/schedule', label: 'Schedule', icon: Calendar },
      { to: '/classes', label: 'Classes', icon: Dumbbell },
      { to: '/pt', label: 'PT Packages', icon: ClipboardList },
      { to: '/payments', label: 'Payments', icon: Wallet },
      { to: '/refunds', label: 'Refunds', icon: Receipt },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/equipment', label: 'Equipment', icon: Wrench },
      { to: '/compliance', label: 'Compliance', icon: ShieldCheck },
    ],
  },
  {
    label: 'Engagement',
    items: [
      { to: '/marketing', label: 'Marketing', icon: MessageSquare },
      { to: '/coaching', label: 'Coaching', icon: HeartHandshake },
      { to: '/surveys', label: 'Surveys & NPS', icon: Smile },
    ],
  },
  {
    label: 'Admin',
    items: [{ to: '/settings', label: 'Settings', icon: Settings }],
  },
]

const STORAGE_KEY = 'benisho:nav-collapsed'

export function Sidebar() {
  const { state } = useAuth()
  const roles = state.status === 'authenticated' ? state.roles : []
  const isAdmin = state.status === 'authenticated' ? state.isAdmin : false

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  function toggle() {
    setCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // ignore storage failures (private mode etc.)
      }
      return next
    })
  }

  // Hide nav items the current role can't reach, then drop now-empty groups
  // (so e.g. the "Admin" header disappears when Settings is filtered out).
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccess(item.to, roles, isAdmin)),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <aside
      className={cn(
        'flex flex-col shrink-0 border-r border-neutral-200 bg-white',
        'transition-[width] duration-200 ease-out',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Brand — clickable, returns to the dashboard */}
      <div
        className={cn(
          'h-14 flex items-center border-b border-neutral-200 shrink-0',
          collapsed ? 'justify-center px-0' : 'px-4',
        )}
      >
        <Link
          to="/"
          title="Benisho home"
          className={cn(
            'flex items-center min-w-0 rounded-md',
            collapsed ? '' : 'gap-2.5',
          )}
        >
          <BrandMark />
          {!collapsed && (
            <span className="font-semibold text-neutral-900 tracking-tight truncate">
              Benisho
            </span>
          )}
        </Link>
      </div>

      {/* Nav */}
      <nav
        className={cn(
          'flex-1 overflow-y-auto py-4 space-y-4',
          collapsed ? 'px-2' : 'px-3',
        )}
      >
        {visibleGroups.map((group, gi) => (
          <div key={gi}>
            {!collapsed && group.label && (
              <div className="px-2 mb-1.5 text-tiny font-medium uppercase tracking-wide text-neutral-400">
                {group.label}
              </div>
            )}
            {collapsed && gi > 0 && (
              <div className="mx-2 mb-3 border-t border-neutral-100" />
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center rounded-md text-body transition-colors duration-100',
                        collapsed
                          ? 'justify-center size-9 mx-auto'
                          : 'gap-2.5 px-2.5 py-1.5',
                        isActive
                          ? 'bg-accent-50 text-accent-700 font-medium'
                          : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900',
                      )
                    }
                  >
                    <item.icon className="size-4 shrink-0" strokeWidth={1.75} />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-neutral-200 p-2 shrink-0">
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex items-center w-full rounded-md text-small text-neutral-500',
            'hover:bg-neutral-100 hover:text-neutral-900 transition-colors',
            collapsed ? 'justify-center h-9' : 'gap-2.5 px-2.5 py-2',
          )}
        >
          {collapsed ? (
            <PanelLeft className="size-4 shrink-0" strokeWidth={1.75} />
          ) : (
            <PanelLeftClose className="size-4 shrink-0" strokeWidth={1.75} />
          )}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}

function BrandMark() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-neutral-900">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-accent-500)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6.5 6.5 11 11" />
        <path d="m21 21-1-1" />
        <path d="m3 3 1 1" />
        <path d="m18 22 4-4" />
        <path d="m2 6 4-4" />
        <path d="m3 10 7-7" />
        <path d="m14 21 7-7" />
      </svg>
    </span>
  )
}
