import { type LabelHTMLAttributes, forwardRef } from 'react'

import { cn } from '@/lib/utils'

export const Label = forwardRef<
  HTMLLabelElement,
  LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      'block text-small font-medium text-neutral-700 mb-1.5',
      'peer-disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Label.displayName = 'Label'
