import { type InputHTMLAttributes, forwardRef } from 'react'

import { cn } from '@/lib/utils'

/**
 * Styled native checkbox. `accent-neutral-900` paints the native check in our
 * ink color while keeping full native keyboard + a11y behaviour.
 */
export const Checkbox = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      'size-4 rounded border-neutral-300 accent-neutral-900 cursor-pointer',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/20',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Checkbox.displayName = 'Checkbox'
