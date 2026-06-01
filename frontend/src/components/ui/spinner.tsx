import { cn } from '@/lib/utils'

interface SpinnerProps {
  className?: string
  /** Diameter via Tailwind size-* class, e.g. "size-4". Default size-5. */
  size?: string
  label?: string
}

/** Brand-colored ring spinner. Prefer <Skeleton> for full-surface loads. */
export function Spinner({ className, size = 'size-5', label }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label ?? 'Loading'}
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-neutral-200 border-t-brand-500',
        size,
        className,
      )}
    />
  )
}
