import { type SelectHTMLAttributes, forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Styled native <select>. Native is intentional: it's accessible for free,
 * keyboard-friendly, and renders the OS picker on mobile. The chevron is a
 * decorative overlay; the real control sits transparently on top.
 */
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative inline-flex w-full">
    <select
      ref={ref}
      className={cn(
        'h-9 w-full appearance-none rounded-md border border-neutral-200 bg-white',
        'pl-3 pr-8 text-body text-neutral-900',
        'transition-colors duration-100 cursor-pointer',
        'hover:border-neutral-300',
        'focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-danger-500 aria-invalid:ring-danger-500/30',
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400"
      strokeWidth={2}
    />
  </div>
))
Select.displayName = 'Select'
