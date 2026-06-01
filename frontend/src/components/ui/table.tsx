import {
  type HTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
  forwardRef,
} from 'react'

import { cn } from '@/lib/utils'

/**
 * Thin table primitives. Composable rather than a do-everything DataGrid:
 * pages assemble <Table><THead/><TBody/></Table> and own their columns. A
 * sticky header + hover rows come for free.
 */

export const Table = forwardRef<
  HTMLTableElement,
  HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="w-full overflow-x-auto">
    <table
      ref={ref}
      className={cn('w-full border-collapse text-left', className)}
      {...props}
    />
  </div>
))
Table.displayName = 'Table'

export const THead = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      'sticky top-0 z-10 bg-neutral-50/90 backdrop-blur',
      'text-tiny font-medium uppercase tracking-wide text-neutral-500',
      className,
    )}
    {...props}
  />
))
THead.displayName = 'THead'

export const TBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn('divide-y divide-neutral-100', className)}
    {...props}
  />
))
TBody.displayName = 'TBody'

interface TRProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Adds hover styling + pointer affordance for row-click navigation. */
  clickable?: boolean
}

export const TR = forwardRef<HTMLTableRowElement, TRProps>(
  ({ className, clickable, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        clickable && 'cursor-pointer hover:bg-neutral-50 transition-colors',
        className,
      )}
      {...props}
    />
  ),
)
TR.displayName = 'TR'

export const TH = forwardRef<
  HTMLTableCellElement,
  ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn('px-4 py-2.5 font-medium whitespace-nowrap', className)}
    {...props}
  />
))
TH.displayName = 'TH'

export const TD = forwardRef<
  HTMLTableCellElement,
  TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn('px-4 py-3 text-small text-neutral-700 align-middle', className)}
    {...props}
  />
))
TD.displayName = 'TD'
