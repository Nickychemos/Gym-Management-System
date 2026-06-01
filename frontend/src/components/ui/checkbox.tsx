import { type InputHTMLAttributes, forwardRef } from 'react'

import { cn } from '@/lib/utils'

/**
 * Styled native checkbox. `accent-brand-500` paints the native check in our
 * brand color while keeping full native keyboard + a11y behaviour.
 */
export const Checkbox = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      'size-4 rounded border-neutral-300 accent-brand-500 cursor-pointer',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Checkbox.displayName = 'Checkbox'
