import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  widthClassName?: string
}

/**
 * Centered modal for focused tasks (booking, payment recording, confirmations).
 * Escape + overlay click close it. For routine destructive actions prefer an
 * undoable toast over a confirm dialog.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  widthClassName = 'max-w-lg',
}: DialogProps) {
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
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative w-full rounded-lg bg-white shadow-[var(--shadow-overlay)]',
          widthClassName,
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-neutral-100">
            <div className="min-w-0">
              {title && (
                <h2 className="text-h3 font-semibold text-neutral-900">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-small text-neutral-500 mt-0.5">
                  {description}
                </p>
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
        )}

        {children && <div className="px-6 py-5">{children}</div>}

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
