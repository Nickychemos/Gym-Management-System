import { cn } from '@/lib/utils'

export interface TabDef {
  value: string
  label: string
}

interface TabsProps {
  tabs: TabDef[]
  value: string
  onValueChange: (value: string) => void
  className?: string
}

/**
 * Controlled tab strip. State lives wherever the parent keeps it — pages wire
 * `value`/`onValueChange` to a URL search param (?tab=payments) so tabs are
 * back-button-friendly and shareable. Content is rendered by the parent.
 */
export function Tabs({ tabs, value, onValueChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center gap-1 border-b border-neutral-200',
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onValueChange(tab.value)}
            className={cn(
              'relative px-3 py-2 text-small font-medium transition-colors',
              '-mb-px border-b-2',
              active
                ? 'border-accent-500 text-accent-700'
                : 'border-transparent text-neutral-500 hover:text-neutral-900',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
