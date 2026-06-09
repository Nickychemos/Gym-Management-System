import { ChevronDown, LogOut, Search, Settings, User } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import {
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSeparator,
} from '@/components/ui/dropdown-menu'
import { useCommandPalette } from '@/components/search/CommandPalette'
import { useAuth } from '@/context/AuthContext'
import { ALL_BRANCHES, useBranch } from '@/context/BranchContext'
import { canAccess } from '@/lib/roles'

/** Friendly label for the caller's top role, for the account menu header. */
function primaryRole(roles: string[], isAdmin: boolean): string {
  if (isAdmin) return 'Administrator'
  const known = [
    'Gym Owner',
    'Gym Manager',
    'Receptionist',
    'Trainer',
  ]
  return known.find((r) => roles.includes(r)) ?? 'Staff'
}

/** Branch selector. Owners/managers switch freely (incl. an all-branches view);
 *  restricted staff see a static chip pinned to their branch. */
function BranchSwitcher() {
  const { selected, canSwitch, multiBranch, branches, setBranch } = useBranch()
  const label = selected === ALL_BRANCHES ? 'All branches' : selected

  // Single-branch gyms have no use for a branch control.
  if (!multiBranch) return null

  if (!canSwitch) {
    return (
      <div className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-small text-neutral-700">
        <span className="size-2 rounded-full bg-success-500" />
        <span>{label}</span>
      </div>
    )
  }

  return (
    <DropdownMenu
      align="start"
      triggerLabel="Switch branch"
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-small text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
      trigger={
        <>
          <span className="size-2 rounded-full bg-success-500" />
          <span>{label}</span>
          <ChevronDown className="size-3.5 text-neutral-400" strokeWidth={2} />
        </>
      }
    >
      <DropdownItem onClick={() => setBranch(ALL_BRANCHES)}>
        All branches
      </DropdownItem>
      {branches.length > 0 && <DropdownSeparator />}
      {branches.map((b) => (
        <DropdownItem key={b.name} onClick={() => setBranch(b.name)}>
          {b.branch}
        </DropdownItem>
      ))}
    </DropdownMenu>
  )
}

export function Topbar() {
  const { state, logout } = useAuth()
  const palette = useCommandPalette()
  const authed = state.status === 'authenticated'
  const fullName = authed ? state.fullName || state.user : 'Loading'
  const email = authed ? state.user : ''
  const roles = authed ? state.roles : []
  const isAdmin = authed ? state.isAdmin : false
  const canSettings = canAccess('/settings', roles, isAdmin)
  const initial = (fullName || 'U').slice(0, 1).toUpperCase()

  return (
    <header className="h-14 shrink-0 border-b border-neutral-200/80 bg-white shadow-[0_1px_2px_rgb(15_17_21/0.03)] flex items-center px-5 gap-4">
      <BranchSwitcher />

      {/* Command palette trigger (also opens via Cmd/Ctrl+K and Ctrl+G). */}
      <button
        type="button"
        onClick={() => palette.open()}
        className="flex items-center gap-2 max-w-md flex-1 rounded-md border border-neutral-200 px-3 h-8 text-small text-neutral-500 hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
        aria-label="Open command palette"
      >
        <Search className="size-3.5" strokeWidth={2} />
        <span>Search members, payments, settings…</span>
        <span className="ml-auto rounded border border-neutral-200 px-1.5 py-0.5 text-tiny text-neutral-500 font-mono">
          ⌘K
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <NotificationBell />

        <div className="ml-1 pl-2 border-l border-neutral-200">
          <DropdownMenu
            triggerLabel="Account menu"
            className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-neutral-100 transition-colors"
            trigger={
              <>
                <span className="size-7 rounded-full bg-neutral-900 text-white grid place-items-center text-small font-medium">
                  {initial}
                </span>
                <span className="text-small text-neutral-700 max-w-[14ch] truncate">
                  {fullName}
                </span>
                <ChevronDown className="size-3.5 text-neutral-400" strokeWidth={2} />
              </>
            }
          >
            <DropdownLabel>
              <div className="flex items-center gap-2">
                <span className="size-9 rounded-full bg-neutral-900 text-white grid place-items-center text-body font-medium">
                  {initial}
                </span>
                <div className="min-w-0">
                  <div className="text-small font-medium text-neutral-900 truncate">
                    {fullName}
                  </div>
                  <div className="text-tiny text-neutral-500 truncate">{email}</div>
                </div>
              </div>
              <div className="mt-2">
                <Badge variant="brand">{primaryRole(roles, isAdmin)}</Badge>
              </div>
            </DropdownLabel>
            <DropdownSeparator />
            <DropdownItem to="/profile" icon={User}>
              Your profile
            </DropdownItem>
            {canSettings && (
              <DropdownItem to="/settings" icon={Settings}>
                Company settings
              </DropdownItem>
            )}
            <DropdownSeparator />
            <DropdownItem onClick={() => logout()} icon={LogOut} danger>
              Sign out
            </DropdownItem>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
