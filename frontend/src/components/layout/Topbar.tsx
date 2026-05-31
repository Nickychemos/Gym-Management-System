import { Bell, ChevronDown, LogOut, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'

export function Topbar() {
  const { state, logout } = useAuth()
  const userLabel =
    state.status === 'authenticated' ? state.user : 'Loading…'

  return (
    <header className="h-14 shrink-0 border-b border-neutral-200 bg-white flex items-center px-5 gap-4">
      {/* Branch switcher placeholder */}
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 h-8 text-small text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
      >
        <span className="size-2 rounded-full bg-success-500" />
        <span>Westlands Branch</span>
        <ChevronDown className="size-3.5 text-neutral-400" strokeWidth={2} />
      </button>

      {/* ⌘K search — visually present, command palette wires up in week 16 */}
      <button
        type="button"
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
        <button
          type="button"
          aria-label="Notifications"
          className="relative inline-flex items-center justify-center size-8 rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
        >
          <Bell className="size-4" strokeWidth={1.75} />
          <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-danger-500" />
        </button>

        <div className="ml-1 flex items-center gap-2 pl-3 border-l border-neutral-200">
          <div className="size-7 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-small font-medium">
            {userLabel.slice(0, 1).toUpperCase()}
          </div>
          <span className="text-small text-neutral-700">{userLabel}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout()}
            aria-label="Sign out"
            className="ml-1"
          >
            <LogOut className="size-3.5" strokeWidth={2} />
          </Button>
        </div>
      </div>
    </header>
  )
}
