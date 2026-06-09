import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  ClipboardList,
  Clock,
  Dumbbell,
  Receipt,
  Search,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

import { useAuth } from '@/context/AuthContext'
import { useBranch } from '@/context/BranchContext'
import { NAV_ITEMS } from '@/lib/nav'
import { canAccess } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { useGlobalSearch } from '@/queries/search'

// Backend groups carry an icon key; map it to a lucide icon here.
const ICONS: Record<string, LucideIcon> = {
  users: Users,
  badge: BadgeCheck,
  dumbbell: Dumbbell,
  clipboard: ClipboardList,
  wrench: Wrench,
  receipt: Receipt,
}

interface Row {
  label: string
  sublabel: string
  /** Navigate here when selected (data + page results). */
  route?: string
  /** Re-run this search term when selected (recent searches). */
  query?: string
  Icon: LucideIcon
}
interface Group {
  label: string
  rows: Row[]
}

const RECENT_KEY = 'benisho:recent-searches'

function loadRecentQueries(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  } catch {
    return []
  }
}
function pushRecentQuery(q: string) {
  const term = q.trim()
  if (term.length < 2) return
  const next = [
    term,
    ...loadRecentQueries().filter((x) => x.toLowerCase() !== term.toLowerCase()),
  ].slice(0, 6)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

// --------------------------------------------------------------- provider ---

const Ctx = createContext<{ open: () => void } | null>(null)

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key.toLowerCase()
      // Cmd/Ctrl+K (modern) and Ctrl+G (ERPNext muscle memory).
      if (((e.metaKey || e.ctrlKey) && k === 'k') || (e.ctrlKey && k === 'g')) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Ctx.Provider value={{ open: () => setOpen(true) }}>
      {children}
      {open && <Palette onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider
export function useCommandPalette() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCommandPalette must be used within its provider')
  return ctx
}

// ----------------------------------------------------------------- modal ----

function Palette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { state } = useAuth()
  const { branchParam } = useBranch()
  const roles = useMemo(
    () => (state.status === 'authenticated' ? state.roles : []),
    [state],
  )
  const isAdmin = state.status === 'authenticated' && state.isAdmin

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 150)
    return () => clearTimeout(t)
  }, [query])

  const { data } = useGlobalSearch(debounced, branchParam)

  // Page navigation results from the shared nav registry (role-gated).
  const pageRows: Row[] = useMemo(() => {
    const q = debounced.toLowerCase()
    return NAV_ITEMS.filter(
      (i) =>
        canAccess(i.to, roles, isAdmin) &&
        (!q || i.label.toLowerCase().includes(q)),
    ).map((i) => ({
      label: i.label,
      sublabel: 'Page',
      route: i.to,
      Icon: i.icon,
    }))
  }, [debounced, roles, isAdmin])

  const groups: Group[] = useMemo(() => {
    if (debounced.length < 2) {
      const recent: Row[] = loadRecentQueries().map((q) => ({
        label: q,
        sublabel: '',
        query: q,
        Icon: Clock,
      }))
      const out: Group[] = []
      if (recent.length) out.push({ label: 'Recent searches', rows: recent })
      out.push({ label: 'Go to', rows: pageRows.slice(0, 7) })
      return out
    }
    const out: Group[] = []
    if (pageRows.length) out.push({ label: 'Pages', rows: pageRows })
    for (const g of data?.groups ?? []) {
      const Icon = ICONS[g.icon] ?? ArrowRight
      out.push({
        label: g.label,
        rows: g.items.map((it) => ({ ...it, Icon })),
      })
    }
    return out
  }, [debounced, pageRows, data])

  // Flatten for keyboard navigation.
  const flat = useMemo(() => groups.flatMap((g) => g.rows), [groups])

  function select(row: Row) {
    // Recent-search rows re-run the term instead of navigating.
    if (row.query !== undefined) {
      setQuery(row.query)
      setActive(0)
      return
    }
    if (!row.route) return
    pushRecentQuery(query)
    onClose()
    navigate(row.route)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flat[active]) select(flat[active])
    }
  }

  // Keep the active row in view.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  let idx = -1

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]">
      <div
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[var(--shadow-overlay)]"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 border-b border-neutral-100 px-4">
          <Search className="size-4 shrink-0 text-neutral-400" strokeWidth={2} />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder="Search members, plans, equipment, pages…"
            className="h-12 w-full bg-transparent text-body text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          />
          <kbd className="rounded border border-neutral-200 px-1.5 py-0.5 text-tiny font-medium text-neutral-400">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {flat.length === 0 ? (
            <div className="px-3 py-10 text-center text-small text-neutral-500">
              {debounced.length < 2
                ? 'Type to search.'
                : `No results for "${debounced}".`}
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="mb-1.5 last:mb-0">
                <div className="px-3 pb-1 pt-2 text-tiny font-semibold uppercase tracking-wider text-neutral-400">
                  {g.label}
                </div>
                {g.rows.map((row) => {
                  idx++
                  const isActive = idx === active
                  const here = idx
                  return (
                    <button
                      key={`${g.label}-${row.route ?? row.query}-${row.label}`}
                      type="button"
                      data-active={isActive}
                      onMouseMove={() => setActive(here)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => select(row)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left',
                        isActive ? 'bg-neutral-100' : 'hover:bg-neutral-50',
                      )}
                    >
                      <row.Icon
                        className="size-4 shrink-0 text-neutral-400"
                        strokeWidth={1.75}
                      />
                      <span className="min-w-0 flex-1 truncate text-small text-neutral-900">
                        {row.label}
                      </span>
                      <span className="shrink-0 truncate text-tiny text-neutral-400">
                        {row.sublabel}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
