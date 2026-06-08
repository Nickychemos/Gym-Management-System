import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge that our custom type-scale tokens (text-tiny ... text-display)
// are font sizes, not text colors. Without this it treats e.g. `text-h3` as a color
// and silently drops a real `text-white` / `text-neutral-x` set on the same element.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['tiny', 'small', 'body', 'h3', 'h2', 'display'] }],
    },
  },
})

/**
 * Tailwind class merger — accepts arrays/objects/conditional strings and
 * resolves conflicts (e.g. `cn('p-2', 'p-4')` → `'p-4'`). Used by every
 * styled component below.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
