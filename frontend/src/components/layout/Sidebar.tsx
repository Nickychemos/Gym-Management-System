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
      {/* Brand + collapse toggle. Collapsed: the logo doubles as the expand
          control, swapping to a panel icon on hover (no labels anywhere). */}
      <div
        className={cn(
          'h-14 flex items-center border-b border-neutral-200 shrink-0',
          collapsed ? 'justify-center px-0' : 'px-4 gap-2',
        )}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={toggle}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="group grid size-9 place-items-center rounded-md hover:bg-neutral-100 transition-colors"
          >
            <BrandMark className="group-hover:hidden" />
            <PanelLeft
              className="hidden size-4 text-neutral-600 group-hover:block"
              strokeWidth={1.75}
            />
          </button>
        ) : (
          <>
            <Link
              to="/"
              title="Benisho home"
              className="flex items-center gap-2.5 min-w-0 flex-1 rounded-md"
            >
              <BrandMark />
              <span className="font-semibold text-neutral-900 tracking-tight truncate">
                Benisho
              </span>
            </Link>
            <button
              type="button"
              onClick={toggle}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              className="grid size-8 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
            >
              <PanelLeftClose className="size-4" strokeWidth={1.75} />
            </button>
          </>
        )}
      </div>

      {/* Nav — grouped sections separated by hairlines, with quiet section
          labels and soft rounded item pills. */}
      <nav
        className={cn(
          'flex-1 overflow-y-auto py-3',
          collapsed ? 'px-2' : 'px-3',
        )}
      >
        {visibleGroups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && (
              <div
                className={cn(
                  'border-t border-neutral-100',
                  collapsed ? 'mx-2 my-2' : 'mx-3 my-3',
                )}
              />
            )}
            {!collapsed && group.label && (
              <div className="px-3 mb-1 text-tiny font-semibold uppercase tracking-wider text-neutral-400">
                {group.label}
              </div>
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
                        'group/nav flex items-center rounded-lg transition-colors duration-100',
                        collapsed
                          ? 'justify-center size-9 mx-auto'
                          : 'gap-3 px-3 py-2 text-small font-medium',
                        isActive
                          ? 'bg-accent-50 text-accent-700'
                          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          className={cn(
                            'size-[18px] shrink-0 transition-colors',
                            !isActive &&
                              'text-neutral-400 group-hover/nav:text-neutral-500',
                          )}
                          strokeWidth={1.75}
                        />
                        {!collapsed && <span>{item.label}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-md bg-neutral-900',
        className,
      )}
    >
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
