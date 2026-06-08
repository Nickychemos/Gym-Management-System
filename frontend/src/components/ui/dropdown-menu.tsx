import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

interface DropdownMenuProps {
  /** Trigger contents (rendered inside a button). */
  trigger: ReactNode
  children: ReactNode
  /** Horizontal alignment of the panel relative to the trigger. */
  align?: 'start' | 'end'
  /** Classes for the trigger button. */
  className?: string
  triggerLabel?: string
}

/**
 * Minimal accessible dropdown. Opens on click, closes on outside click, Escape,
 * or when any item inside is clicked. No external dependency — we only need a
 * single popover, so a focused component beats pulling in a menu library.
 */
export function DropdownMenu({
  trigger,
  children,
  align = 'end',
  className,
  triggerLabel,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => setOpen((o) => !o)}
        className={className}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className={cn(
            'absolute z-50 mt-2 min-w-56 rounded-xl border border-neutral-200 bg-white p-1.5',
            'shadow-[var(--shadow-overlay)] origin-top',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}

const itemClasses =
  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-small text-left ' +
  'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors'

interface DropdownItemProps {
  children: ReactNode
  icon?: LucideIcon
  /** Render as a router link when set, otherwise a button. */
  to?: string
  onClick?: () => void
  danger?: boolean
}

export function DropdownItem({
  children,
  icon: Icon,
  to,
  onClick,
  danger,
}: DropdownItemProps) {
  const cls = cn(
    itemClasses,
    danger && 'text-danger-700 hover:bg-danger-50 hover:text-danger-700',
  )
  const inner = (
    <>
      {Icon && <Icon className="size-4 shrink-0" strokeWidth={1.75} />}
      <span className="truncate">{children}</span>
    </>
  )
  if (to) {
    return (
      <Link to={to} role="menuitem" className={cls}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" role="menuitem" onClick={onClick} className={cls}>
      {inner}
    </button>
  )
}

export function DropdownSeparator() {
  return <div className="my-1.5 h-px bg-neutral-100" />
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 py-1.5">{children}</div>
}
