import { NavLink } from 'react-router-dom'
import {
  Calendar,
  ClipboardList,
  Dumbbell,
  HeartHandshake,
  Home,
  MessageSquare,
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

export function Sidebar() {
  const { state } = useAuth()
  const roles = state.status === 'authenticated' ? state.roles : []
  const isAdmin = state.status === 'authenticated' ? state.isAdmin : false

  // Hide nav items the current role can't reach, then drop now-empty groups
  // (so e.g. the "Admin" header disappears when Settings is filtered out).
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccess(item.to, roles, isAdmin)),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <aside className="w-60 shrink-0 border-r border-neutral-200 bg-white">
      <div className="h-14 flex items-center gap-2 px-5 border-b border-neutral-200">
        <div className="grid size-7 place-items-center rounded-md bg-neutral-900">
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
        </div>
        <span className="font-semibold text-neutral-900 tracking-tight">
          Benisho
        </span>
      </div>

      <nav className="px-3 py-4 space-y-6">
        {visibleGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <div className="px-2 mb-2 text-tiny font-medium uppercase tracking-wide text-neutral-400">
                {group.label}
              </div>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-body',
                        'transition-colors duration-100',
                        isActive
                          ? 'bg-brand-50 text-brand-700 font-medium'
                          : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900',
                      )
                    }
                  >
                    <item.icon className="size-4" strokeWidth={1.75} />
                    <span>{item.label}</span>
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
