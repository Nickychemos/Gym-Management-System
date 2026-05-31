import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Tailwind class merger — accepts arrays/objects/conditional strings and
 * resolves conflicts (e.g. `cn('p-2', 'p-4')` → `'p-4'`). Used by every
 * styled component below.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
