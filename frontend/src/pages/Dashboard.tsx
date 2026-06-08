import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ksh, kshCompact } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type DashboardSummary } from '@/lib/types'
import { useDashboardSummary } from '@/queries/dashboard'

export default function DashboardPage() {
  const { data, isLoading, isError, error, refetch } = useDashboardSummary()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-display font-semibold tracking-tight text-neutral-900">
          Dashboard
        </h1>
        <p className="text-body text-neutral-500">
          Today,{' '}
          {new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {isError ? (
        <Card>
          <EmptyState
            title="Couldn't load the dashboard"
            description={error instanceof Error ? error.message : undefined}
            action={
              <Button variant="secondary" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : isLoading || !data ? (
        <DashboardSkeleton />
      ) : (
        <DashboardContent data={data} />
      )}
    </div>
  )
}

function DashboardContent({ data }: { data: DashboardSummary }) {
  const k = data.kpis
  const canFinance = data.can_see_financials
  const kpis = [
    { label: 'Active Members', value: k.active_members.toLocaleString() },
    { label: 'New This Month', value: k.new_this_month.toLocaleString() },
    {
      label: 'Renewals Due',
      value: k.renewals_due.toLocaleString(),
      hint: 'Next 7 days',
    },
    ...(canFinance
      ? [
          {
            label: "Today's Revenue",
            value: kshCompact(k.todays_revenue ?? 0),
            hint: `${k.todays_payment_count ?? 0} paid`,
          },
          { label: 'MTD Revenue', value: kshCompact(k.mtd_revenue ?? 0) },
        ]
      : []),
  ]

  return (
    <>
      {/* KPI row */}
      <div
        className={cn(
          'grid grid-cols-2 gap-4 mb-6',
          canFinance ? 'lg:grid-cols-5' : 'lg:grid-cols-3',
        )}
      >
        {kpis.map((kpi) => (
          <Card
            key={kpi.label}
            className="hover:shadow-[var(--shadow-card-hover)] transition-shadow"
          >
            <CardContent className="py-4">
              <div className="text-small text-neutral-500 mb-1">{kpi.label}</div>
              <div className="text-h2 font-semibold tabular-nums text-neutral-900">
                {kpi.value}
              </div>
              <div className="mt-1 text-tiny text-neutral-400">
                {kpi.hint ?? ' '}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Classes + payments */}
      <div
        className={cn(
          'grid grid-cols-1 gap-4 mb-4',
          canFinance && 'lg:grid-cols-2',
        )}
      >
        <Card>
          <CardHeader>
            <CardTitle>Today's Classes</CardTitle>
            <span className="text-small text-neutral-500">
              {data.todays_classes.length} scheduled
            </span>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {data.todays_classes.length === 0 ? (
              <EmptyState title="No classes today" />
            ) : (
              <ul className="divide-y divide-neutral-100">
                {data.todays_classes.map((c) => {
                  const pct = c.capacity ? (c.booked / c.capacity) * 100 : 0
                  const time = new Date(
                    c.start_time.replace(' ', 'T'),
                  ).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                  return (
                    <li
                      key={c.name}
                      className="px-5 py-3 flex items-center gap-4 hover:bg-neutral-50 transition-colors"
                    >
                      <span className="font-mono text-small tabular-nums text-neutral-600 w-14">
                        {time}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-body font-medium text-neutral-900">
                          {c.class_type}
                        </div>
                        <div className="text-tiny text-neutral-500">
                          {c.trainer ?? 'No trainer'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-small tabular-nums text-neutral-700">
                          {c.booked}/{c.capacity}
                        </div>
                        <div className="mt-1 h-1 w-16 rounded-full bg-neutral-100 overflow-hidden">
                          <div
                            className={cn(
                              'h-full transition-all',
                              pct >= 100
                                ? 'bg-danger-500'
                                : pct >= 75
                                  ? 'bg-warning-500'
                                  : 'bg-neutral-900',
                            )}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {canFinance && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Payments</CardTitle>
            <Link
              to="/payments"
              className="text-small font-medium text-neutral-700 hover:text-neutral-900"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {data.recent_payments.length === 0 ? (
              <EmptyState title="No payments yet" />
            ) : (
              <ul className="divide-y divide-neutral-100">
                {data.recent_payments.map((p) => (
                  <li
                    key={p.name}
                    className="px-5 py-3 flex items-center gap-4 hover:bg-neutral-50 transition-colors"
                  >
                    <span
                      className={cn(
                        'size-2 rounded-full shrink-0',
                        p.status === 'Success'
                          ? 'bg-success-500'
                          : p.status === 'Pending'
                            ? 'bg-warning-500'
                            : 'bg-danger-500',
                      )}
                    />
                    <span className="flex-1 text-body text-neutral-900 truncate">
                      {p.customer_name ?? 'Unknown'}
                    </span>
                    <span className="font-mono text-small tabular-nums text-neutral-900">
                      {ksh(p.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        )}
      </div>

      {/* Alerts + NPS */}
      <div
        className={cn(
          'grid grid-cols-1 gap-4',
          canFinance && 'lg:grid-cols-2',
        )}
      >
        <Card>
          <CardHeader>
            <CardTitle>Alerts</CardTitle>
            {data.alerts.length > 0 && (
              <Badge variant="warning">{data.alerts.length} active</Badge>
            )}
          </CardHeader>
          <CardContent className="px-0 py-0">
            {data.alerts.length === 0 ? (
              <EmptyState title="All clear" description="No active alerts." />
            ) : (
              <ul className="divide-y divide-neutral-100">
                {data.alerts.map((a, i) => (
                  <li key={i} className="px-5 py-3 flex items-start gap-3">
                    <span
                      className={cn(
                        'mt-1.5 size-2 rounded-full shrink-0',
                        a.kind === 'danger'
                          ? 'bg-danger-500'
                          : a.kind === 'warning'
                            ? 'bg-warning-500'
                            : 'bg-info-500',
                      )}
                    />
                    <span className="text-small text-neutral-700">{a.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {canFinance && (
        <Card>
          <CardHeader>
            <CardTitle>Net Promoter Score</CardTitle>
            <span className="text-small text-neutral-500">Rolling 30 days</span>
          </CardHeader>
          <CardContent className="text-center py-8">
            {!data.nps || data.nps.nps_score === null ? (
              <div className="py-4">
                <p className="text-h3 font-medium text-neutral-400">No data yet</p>
                <p className="text-small text-neutral-500 mt-1">
                  NPS appears once survey responses come in.
                </p>
              </div>
            ) : (
              <>
                <div className="text-display font-semibold tabular-nums text-neutral-900">
                  {data.nps.nps_score}
                </div>
                <div className="mt-4 text-small text-neutral-500">
                  {data.nps.promoters} Promoters · {data.nps.passives} Passives ·{' '}
                  {data.nps.detractors} Detractors
                </div>
                <div className="mt-1 text-tiny text-neutral-400">
                  {data.nps.total_responses} responses
                </div>
              </>
            )}
          </CardContent>
        </Card>
        )}
      </div>
    </>
  )
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="py-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-2.5 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Skeleton className="h-56 w-full rounded-lg" />
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </>
  )
}
