import { Clock, Dumbbell, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { type BadgeProps } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { type ClassType } from '@/lib/types'
import { useClassTypes } from '@/queries/schedule'

const INTENSITY_VARIANT: Record<string, NonNullable<BadgeProps['variant']>> = {
  Low: 'success',
  Moderate: 'info',
  High: 'danger',
  Variable: 'warning',
}

export default function ClassesPage() {
  const { data, isLoading, isError, error, refetch } = useClassTypes()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-display font-semibold tracking-tight text-neutral-900">
          Classes
        </h1>
        <p className="text-body text-neutral-500">
          {isLoading ? 'Loading…' : `${data?.length ?? 0} class types`}
        </p>
      </div>

      {isError ? (
        <Card>
          <EmptyState
            icon={Dumbbell}
            title="Couldn't load classes"
            description={error instanceof Error ? error.message : undefined}
            action={
              <button
                onClick={() => refetch()}
                className="text-small text-brand-600 hover:text-brand-700"
              >
                Try again
              </button>
            }
          />
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Dumbbell}
            title="No class types yet"
            description="Class types are the catalog your schedule is built from."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((c) => (
            <ClassCard key={c.name} item={c} />
          ))}
        </div>
      )}
    </div>
  )
}

function ClassCard({ item }: { item: ClassType }) {
  return (
    <Card className="hover:shadow-[var(--shadow-card-hover)] transition-shadow">
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="size-3 rounded-full shrink-0"
              style={{ backgroundColor: item.display_color ?? '#5469d4' }}
            />
            <span className="text-h3 font-semibold text-neutral-900 truncate">
              {item.class_type_name}
            </span>
          </div>
          {!item.is_active && <Badge variant="neutral">Inactive</Badge>}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-neutral-600">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5 text-neutral-400" strokeWidth={2} />
            {item.default_duration_minutes} min
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5 text-neutral-400" strokeWidth={2} />
            {item.default_capacity} cap
          </span>
          {item.intensity_level && (
            <Badge variant={INTENSITY_VARIANT[item.intensity_level] ?? 'neutral'}>
              {item.intensity_level}
            </Badge>
          )}
        </div>

        {item.description && (
          <p className="mt-3 text-small text-neutral-500 line-clamp-2">
            {item.description}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
