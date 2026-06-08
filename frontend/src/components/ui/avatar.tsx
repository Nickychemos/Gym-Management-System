import { cn } from '@/lib/utils'

interface AvatarProps {
  name?: string | null
  src?: string | null
  /** Tailwind size-* class. Default size-9. */
  size?: string
  className?: string
}

function initials(name?: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Member/trainer avatar — photo when available, initials fallback otherwise. */
export function Avatar({ name, src, size = 'size-9', className }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name ?? ''}
        className={cn('rounded-full object-cover bg-neutral-100', size, className)}
      />
    )
  }
  return (
    <div
      aria-hidden
      className={cn(
        'inline-flex items-center justify-center rounded-full',
        'bg-neutral-200 text-neutral-700 font-medium text-small select-none',
        size,
        className,
      )}
    >
      {initials(name)}
    </div>
  )
}
