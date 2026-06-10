import { type ReactNode } from 'react'
import { Activity, CalendarClock, Dumbbell, TrendingUp } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  MiniBars,
  ProgressBar,
  TrendChart,
} from '@/components/charts/ChartKit'
import { CHART, type ChartPoint } from '@/components/charts/theme'
import { dateTime, ksh } from '@/lib/format'
import {
  type ClassEngagement,
  type PtEngagement,
  type RetentionRisk,
  type RiskLevel,
} from '@/lib/types'
import { useMemberAnalytics } from '@/queries/members'

const RISK_VARIANT: Record<RiskLevel, 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
}
const RISK_LABEL: Record<RiskLevel, string> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
}

function weekLabel(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' })
}

function tenureLabel(days: number | null): string {
  if (days == null) return '—'
  if (days < 45) return `${days}d`
  if (days < 365) return `${Math.round(days / 30)} mo`
  return `${(days / 365).toFixed(1)} yr`
}

export default function MemberAnalyticsTab({ member }: { member: string }) {
  const { data, isLoading, isError } = useMemberAnalytics(member)

  if (isError) {
    return (
      <Card>
        <EmptyState
          icon={Activity}
          title="Couldn't load analytics"
          description="Try refreshing the page."
        />
      </Card>
    )
  }
  if (isLoading || !data) return <AnalyticsSkeleton />

  const { visits, classes, pt, retention } = data
  const hasVisits = visits.total > 0
  const classTotal =
    classes.attended + classes.no_shows + classes.cancelled + classes.booked

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          label="Visits this month"
          value={String(visits.this_month)}
          hint={`${visits.total} all-time`}
        />
        <Kpi
          label="Avg / week"
          value={visits.avg_per_week != null ? String(visits.avg_per_week) : '—'}
          hint="since joining"
        />
        <Kpi
          label="Attendance rate"
          value={
            classes.attendance_rate != null
              ? `${classes.attendance_rate}%`
              : '—'
          }
          hint="classes attended vs no-show"
        />
        <Kpi
          label="Tenure"
          value={tenureLabel(retention.tenure_days)}
          hint="as a member"
        />
      </div>

      {/* Visit frequency + weekday pattern */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Visit Frequency</CardTitle>
            <span className="text-tiny text-neutral-400">Last 12 weeks</span>
          </CardHeader>
          <CardContent>
            {hasVisits ? (
              <TrendChart
                data={visits.trend.map<ChartPoint>((p) => ({
                  label: weekLabel(p.week_start),
                  value: p.count,
                }))}
                tickInterval={1}
              />
            ) : (
              <EmptyState
                icon={CalendarClock}
                title="No visits yet"
                description="Check-ins will plot here once this member starts coming in."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferred Days</CardTitle>
          </CardHeader>
          <CardContent>
            {hasVisits ? (
              <MiniBars
                data={visits.weekday.map<ChartPoint>((w) => ({
                  label: w.label,
                  value: w.count,
                }))}
                highlightMax
              />
            ) : (
              <div className="grid h-[150px] place-items-center text-small text-neutral-400">
                No pattern yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Retention & risk */}
      <RetentionCard retention={retention} lastVisit={visits.last_visit} />

      {/* Classes + PT engagement */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Class Engagement</CardTitle>
          </CardHeader>
          <CardContent>
            {classTotal > 0 ? (
              <ClassEngagementBody classes={classes} />
            ) : (
              <EmptyState
                icon={CalendarClock}
                title="No class bookings"
                description="Booking outcomes appear here once this member books a class."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Personal Training</CardTitle>
          </CardHeader>
          <CardContent>
            {pt.packages > 0 ? (
              <PtBody pt={pt} />
            ) : (
              <EmptyState
                icon={Dumbbell}
                title="No PT packages"
                description="Session utilisation shows here once this member buys PT."
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Spend — managers/owners only */}
      {data.can_see_financials && data.financials && (
        <Card>
          <CardHeader>
            <CardTitle>Spend</CardTitle>
            <span className="text-tiny text-neutral-400">Last 6 months</span>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-3 gap-4">
              <Kpi label="Lifetime" value={ksh(data.financials.lifetime_spend)} bare />
              <Kpi
                label="Avg payment"
                value={
                  data.financials.avg_transaction != null
                    ? ksh(data.financials.avg_transaction)
                    : '—'
                }
                bare
              />
              <Kpi
                label="Outstanding"
                value={ksh(data.financials.outstanding)}
                bare
              />
            </div>
            <TrendChart
              data={data.financials.trend.map<ChartPoint>((p) => ({
                label: monthLabel(p.month),
                value: p.amount,
              }))}
              color={CHART.ink}
              format={(n) => ksh(n)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function RetentionCard({
  retention,
  lastVisit,
}: {
  retention: RetentionRisk
  lastVisit: string | null
}) {
  const d = retention.days_to_expiry
  const renewal =
    d == null
      ? 'No active plan'
      : d < 0
        ? `Expired ${Math.abs(d)} day(s) ago`
        : d === 0
          ? 'Expires today'
          : `${d} day(s) left${retention.auto_renew ? ' · auto-renew' : ''}`

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retention &amp; Risk</CardTitle>
        <Badge variant={RISK_VARIANT[retention.risk_level]}>
          {RISK_LABEL[retention.risk_level]}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Membership" value={retention.subscription_status ?? '—'} />
          <Stat label="Renewal" value={renewal} />
          <Stat
            label="Last visit"
            value={
              retention.days_since_visit != null
                ? `${retention.days_since_visit}d ago`
                : lastVisit
                  ? dateTime(lastVisit)
                  : 'Never'
            }
          />
          <Stat
            label="NPS"
            value={
              retention.nps_score != null
                ? `${retention.nps_score} · ${retention.nps_category}`
                : '—'
            }
          />
        </div>
        {retention.risk_reasons.length > 0 && (
          <ul className="mt-4 space-y-1.5 border-t border-neutral-100 pt-3">
            {retention.risk_reasons.map((r, i) => (
              <li
                key={i}
                className="flex items-center gap-2 text-small text-neutral-700"
              >
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{
                    background:
                      retention.risk_level === 'high'
                        ? 'var(--color-danger-500)'
                        : 'var(--color-warning-500)',
                  }}
                />
                {r}
              </li>
            ))}
          </ul>
        )}
        {retention.risk_level === 'low' &&
          retention.risk_reasons.length === 0 && (
            <p className="mt-4 flex items-center gap-2 border-t border-neutral-100 pt-3 text-small text-neutral-500">
              <TrendingUp className="size-4 text-success-600" strokeWidth={2} />
              Engaged and on track. No risk signals.
            </p>
          )}
      </CardContent>
    </Card>
  )
}

function ClassEngagementBody({ classes }: { classes: ClassEngagement }) {
  const bars: ChartPoint[] = [
    { label: 'Attended', value: classes.attended },
    { label: 'No-show', value: classes.no_shows },
    { label: 'Cancelled', value: classes.cancelled },
    { label: 'Booked', value: classes.booked },
  ]
  return (
    <div className="space-y-4">
      <MiniBars data={bars} />
      {classes.top_types.length > 0 && (
        <div>
          <div className="mb-1.5 text-tiny font-medium uppercase tracking-wide text-neutral-400">
            Favourite classes
          </div>
          <div className="flex flex-wrap gap-1.5">
            {classes.top_types.map((t) => (
              <Badge key={t.class_type} variant="neutral">
                {t.class_type} · {t.count}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PtBody({ pt }: { pt: PtEngagement }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Packages" value={`${pt.active_packages} active`} />
        <Stat label="Used" value={`${pt.sessions_used}/${pt.sessions_purchased}`} />
        <Stat label="Remaining" value={String(pt.sessions_remaining)} />
      </div>
      <ProgressBar pct={pt.utilization_pct ?? 0}>
        <div className="mt-1.5 flex items-center justify-between text-tiny text-neutral-500">
          <span>Session utilisation</span>
          <span className="tabular-nums">
            {pt.utilization_pct != null ? `${pt.utilization_pct}%` : '—'}
          </span>
        </div>
      </ProgressBar>
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
  bare,
}: {
  label: string
  value: string
  hint?: string
  bare?: boolean
}) {
  const body = (
    <>
      <div className="text-small text-neutral-500">{label}</div>
      <div className="mt-1 text-h2 font-semibold tabular-nums text-neutral-900">
        {value}
      </div>
      {hint && <div className="mt-1 text-tiny text-neutral-400">{hint}</div>}
    </>
  )
  if (bare) return <div>{body}</div>
  return (
    <Card>
      <CardContent className="py-4">{body}</CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-tiny uppercase tracking-wide text-neutral-400">
        {label}
      </div>
      <div className="mt-0.5 text-small font-medium text-neutral-900">
        {value}
      </div>
    </div>
  )
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-56 w-full rounded-lg lg:col-span-2" />
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  )
}
