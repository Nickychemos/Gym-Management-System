import { type InputHTMLAttributes, forwardRef } from 'react'

import { cn } from '@/lib/utils'

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-9 w-full rounded-md border border-neutral-200 bg-white',
      'px-3 text-body text-neutral-900 placeholder:text-neutral-400',
      'transition-colors duration-100',
      'hover:border-neutral-300',
      'focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'aria-invalid:border-danger-500 aria-invalid:ring-danger-500/30',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'
