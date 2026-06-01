import { type HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

/**
 * Loading placeholder. Render skeletons in the *shape* of the incoming
 * content (not a spinner) so the page feels twice as fast — per the plan's
 * "skeletons, not spinners" rule.
 */
export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-neutral-100', className)}
      {...props}
    />
  )
}
