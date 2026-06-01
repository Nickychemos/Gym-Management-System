import { type TextareaHTMLAttributes, forwardRef } from 'react'

import { cn } from '@/lib/utils'

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-20 w-full rounded-md border border-neutral-200 bg-white',
      'px-3 py-2 text-body text-neutral-900 placeholder:text-neutral-400',
      'transition-colors duration-100 resize-y',
      'hover:border-neutral-300',
      'focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'aria-invalid:border-danger-500 aria-invalid:ring-danger-500/30',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'
