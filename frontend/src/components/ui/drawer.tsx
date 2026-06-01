import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  /** Sticky footer area, usually the primary/secondary action buttons. */
  footer?: ReactNode
  /** Drawer width. Default max-w-md. */
  widthClassName?: string
}

/**
 * Right-hand slide-out panel for quick edits without leaving the page (Stripe
 * uses these everywhere). Overlay click + Escape close it; body scroll locks
 * while open. Rendered through a portal so it escapes the layout's stacking
 * context.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  widthClassName = 'max-w-md',
}: DrawerProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-neutral-900/30 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative h-full w-full bg-white shadow-[var(--shadow-overlay)]',
          'flex flex-col',
          widthClassName,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-neutral-100">
          <div className="min-w-0">
            {title && (
              <h2 className="text-h3 font-semibold text-neutral-900 truncate">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-small text-neutral-500 mt-0.5">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 inline-flex size-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="border-t border-neutral-100 px-6 py-4 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
