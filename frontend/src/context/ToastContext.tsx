import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

type ToastVariant = 'success' | 'error' | 'warning' | 'info'

interface ToastOptions {
  title: string
  description?: string
  variant?: ToastVariant
  /** Auto-dismiss after this many ms. Default 4000; pass 0 to persist. */
  duration?: number
  /** Adds an "Undo" affordance; called if the user clicks it. */
  onUndo?: () => void
}

interface Toast extends ToastOptions {
  id: number
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => void
  /** Convenience: an undoable success toast (5s window, per the plan). */
  undoable: (title: string, onUndo: () => void, description?: string) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const ICONS: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const ICON_COLOR: Record<ToastVariant, string> = {
  success: 'text-success-500',
  error: 'text-danger-500',
  warning: 'text-warning-500',
  info: 'text-info-500',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback(
    (opts: ToastOptions) => {
      const id = ++seq.current
      const duration = opts.duration ?? 4000
      setToasts((t) => [...t, { ...opts, id }])
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        )
      }
    },
    [dismiss],
  )

  const undoable = useCallback(
    (title: string, onUndo: () => void, description?: string) => {
      toast({
        title,
        description,
        variant: 'info',
        duration: 5000,
        onUndo,
      })
    },
    [toast],
  )

  return (
    <ToastContext.Provider value={{ toast, undoable, dismiss }}>
      {children}
      {createPortal(
        <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
          {toasts.map((t) => {
            const variant = t.variant ?? 'info'
            const Icon = ICONS[variant]
            return (
              <div
                key={t.id}
                role="status"
                className={cn(
                  'flex items-start gap-3 rounded-lg border border-neutral-200 bg-white',
                  'px-4 py-3 shadow-[var(--shadow-overlay)]',
                )}
              >
                <Icon
                  className={cn('size-4 mt-0.5 shrink-0', ICON_COLOR[variant])}
                  strokeWidth={2}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-small font-medium text-neutral-900">
                    {t.title}
                  </p>
                  {t.description && (
                    <p className="text-small text-neutral-500 mt-0.5">
                      {t.description}
                    </p>
                  )}
                  {t.onUndo && (
                    <button
                      type="button"
                      onClick={() => {
                        t.onUndo?.()
                        dismiss(t.id)
                      }}
                      className="mt-1.5 text-small font-medium text-neutral-700 hover:text-neutral-900"
                    >
                      Undo
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                  className="shrink-0 -mr-1 inline-flex size-6 items-center justify-center rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                >
                  <X className="size-3.5" strokeWidth={2} />
                </button>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider, matching AuthContext
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
