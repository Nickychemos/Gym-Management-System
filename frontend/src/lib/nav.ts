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
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export interface NavGroup {
  label?: string
  items: NavItem[]
}

/**
 * Single source of truth for the app's primary navigation. The sidebar renders
 * it, and the command palette derives its "Pages" search results from it — so
 * adding or removing a page here updates both automatically.
 */
export const NAV_GROUPS: NavGroup[] = [
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

/** Flat list of every nav destination (used by global search). */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)
