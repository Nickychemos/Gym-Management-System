import { type LucideIcon, Inbox } from 'lucide-react'
import { type ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  /** A teaching sentence — "No members yet — add your first one →". */
  description?: string
  /** Primary action (usually a <Button>). */
  action?: ReactNode
  className?: string
}

/**
 * First-use experience for any empty list. Never a blank screen — an empty
 * state should teach the next action.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('py-16 text-center', className)}>
      <div className="inline-flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 mb-4">
        <Icon className="size-6" strokeWidth={1.75} />
      </div>
      <p className="text-h3 font-medium text-neutral-900 mb-1">{title}</p>
      {description && (
        <p className="text-small text-neutral-500 max-w-sm mx-auto">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
